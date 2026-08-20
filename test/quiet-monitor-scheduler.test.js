"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_PRODUCTS } = require("../lib/core");
const {
  QUIET_GLOBAL_START_GAP_MS,
  QUIET_INTERVAL_MAX_MS,
  QUIET_INTERVAL_MIN_MS,
  QUIET_MAX_GLOBAL_IN_FLIGHT,
  QUIET_MAX_STORE_IN_FLIGHT,
  QUIET_STORE_START_GAP_MS,
  createQuietMonitorSchedule,
  deferQuietMonitorStore,
  markQuietMonitorFinished,
  markQuietMonitorStarted,
  nextQuietMonitorCandidate,
  reconcileQuietMonitorSchedule,
  resetQuietMonitorSchedule
} = require("../lib/quiet-monitor-scheduler");

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return (minimum, maximum) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return minimum + (state % (maximum - minimum));
  };
}

function products(count, retailer = "target") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${retailer}:${String(index + 1).padStart(8, "0")}`,
    retailer
  }));
}

function runImmediateRamp(seed) {
  const randomInt = seededRandom(seed);
  const state = createQuietMonitorSchedule();
  const startAt = 1_000_000;
  reconcileQuietMonitorSchedule(state, products(MAX_PRODUCTS), { now: startAt, randomInt, persistedStarts: {} });
  const starts = [];
  for (let now = startAt; starts.length < MAX_PRODUCTS; now += 250) {
    const candidate = nextQuietMonitorCandidate(state, { now, blockedUntil: new Map() });
    if (!candidate) continue;
    const started = markQuietMonitorStarted(state, candidate.productId, { now, randomInt });
    starts.push(started);
    markQuietMonitorFinished(state, candidate.productId, started.startToken);
  }
  return starts;
}

test("the initial 100-product ramp is shuffled, complete, and paced", () => {
  const starts = runImmediateRamp(42);
  assert.equal(new Set(starts.map((entry) => entry.productId)).size, MAX_PRODUCTS);
  assert.deepEqual(starts.map((entry) => entry.productId), runImmediateRamp(42).map((entry) => entry.productId));
  assert.notDeepEqual(starts.map((entry) => entry.productId), products(MAX_PRODUCTS).map((entry) => entry.id));
  assert.equal(starts[0].startedAt, 1_000_000);
  assert.ok(starts.at(-1).startedAt - starts[0].startedAt <= (MAX_PRODUCTS - 1) * QUIET_STORE_START_GAP_MS);
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(starts[index].startedAt - starts[index - 1].startedAt >= QUIET_STORE_START_GAP_MS);
  }
});

test("slow first reads still cover every product before any quiet-check repeat", () => {
  const randomInt = seededRandom(84);
  const state = createQuietMonitorSchedule();
  const list = products(12);
  const startAt = 1_000_000;
  const starts = [];
  const pending = [];
  reconcileQuietMonitorSchedule(state, list, { now: startAt, randomInt, persistedStarts: {} });

  for (let now = startAt; starts.length <= list.length && now < startAt + 180_000; now += 250) {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index].finishAt > now) continue;
      markQuietMonitorFinished(state, pending[index].productId, pending[index].startToken);
      pending.splice(index, 1);
    }
    const candidate = nextQuietMonitorCandidate(state, { now, blockedUntil: new Map() });
    if (!candidate) continue;
    const started = markQuietMonitorStarted(state, candidate.productId, { now, randomInt });
    starts.push(started);
    pending.push({ ...started, finishAt: now + 8_000 });
  }

  assert.equal(starts.length, list.length + 1);
  assert.equal(new Set(starts.slice(0, list.length).map((entry) => entry.productId)).size, list.length);
  assert.equal(new Set(starts.map((entry) => entry.productId)).size, list.length);
});

test("per-product deadlines include both exact 45 and 90 second boundaries", () => {
  const minimum = createQuietMonitorSchedule();
  reconcileQuietMonitorSchedule(minimum, products(1), { now: 100_000, randomInt: (min) => min });
  const minStart = markQuietMonitorStarted(minimum, products(1)[0].id, { now: 100_000, randomInt: (min) => min });
  assert.equal(minStart.intervalMs, QUIET_INTERVAL_MIN_MS);
  assert.equal(minStart.nextDueAt, 145_000);

  const maximum = createQuietMonitorSchedule();
  reconcileQuietMonitorSchedule(maximum, products(1), { now: 100_000, randomInt: (_min, max) => max - 1 });
  const maxStart = markQuietMonitorStarted(maximum, products(1)[0].id, { now: 100_000, randomInt: (_min, max) => max - 1 });
  assert.equal(maxStart.intervalMs, QUIET_INTERVAL_MAX_MS);
  assert.equal(maxStart.nextDueAt, 190_000);
});

test("100 same-store products remain serviceable when every interval draws 45 seconds", () => {
  const randomInt = (minimum) => minimum;
  const state = createQuietMonitorSchedule();
  const list = products(MAX_PRODUCTS);
  const startAt = 1_000_000;
  const starts = new Map(list.map((product) => [product.id, []]));
  reconcileQuietMonitorSchedule(state, list, { now: startAt, randomInt, persistedStarts: {} });
  for (let now = startAt; now <= startAt + 300_000; now += 250) {
    const candidate = nextQuietMonitorCandidate(state, { now, blockedUntil: new Map() });
    if (!candidate) continue;
    const started = markQuietMonitorStarted(state, candidate.productId, { now, randomInt });
    starts.get(candidate.productId).push(started.startedAt);
    markQuietMonitorFinished(state, candidate.productId, started.startToken);
  }
  for (const history of starts.values()) {
    assert.ok(history.length >= 4);
    for (let index = 1; index < history.length; index += 1) {
      assert.ok(history[index] - history[index - 1] >= QUIET_INTERVAL_MIN_MS);
      assert.ok(history[index] - history[index - 1] <= QUIET_INTERVAL_MAX_MS);
    }
  }
});

test("global, store, and product in-flight limits are independent", () => {
  const randomInt = seededRandom(7);
  const state = createQuietMonitorSchedule();
  const list = [...products(3, "target"), ...products(3, "walmart")];
  reconcileQuietMonitorSchedule(state, list, { now: 1_000_000, randomInt, persistedStarts: {} });
  const started = [];
  for (let now = 1_000_000; now < 1_010_000; now += QUIET_GLOBAL_START_GAP_MS) {
    const candidate = nextQuietMonitorCandidate(state, { now, blockedUntil: new Map() });
    if (!candidate) continue;
    started.push(markQuietMonitorStarted(state, candidate.productId, { now, randomInt }));
    if (started.length === QUIET_MAX_GLOBAL_IN_FLIGHT) break;
  }
  assert.equal(started.length, QUIET_MAX_GLOBAL_IN_FLIGHT);
  assert.equal(started.filter((entry) => entry.retailer === "target").length, QUIET_MAX_STORE_IN_FLIGHT);
  assert.equal(started.filter((entry) => entry.retailer === "walmart").length, QUIET_MAX_STORE_IN_FLIGHT);
  assert.equal(nextQuietMonitorCandidate(state, { now: 1_020_000, blockedUntil: new Map() }), null);
  assert.equal(markQuietMonitorStarted(state, started[0].productId, { now: 1_020_000, randomInt }), null);
});

test("restart floors, eligibility churn, store deferral, and reset fail closed", () => {
  const randomInt = seededRandom(9);
  const state = createQuietMonitorSchedule();
  const [product] = products(1);
  const now = 1_000_000;
  reconcileQuietMonitorSchedule(state, [product], {
    now,
    randomInt,
    persistedStarts: { [product.id]: now - QUIET_INTERVAL_MIN_MS + 1 }
  });
  assert.equal(nextQuietMonitorCandidate(state, { now, blockedUntil: new Map() }), null);
  assert.equal(nextQuietMonitorCandidate(state, { now: now + 1, blockedUntil: new Map() }).productId, product.id);

  deferQuietMonitorStore(state, "target", now + 60_000, randomInt);
  assert.equal(nextQuietMonitorCandidate(state, { now: now + 59_999, blockedUntil: new Map() }), null);
  reconcileQuietMonitorSchedule(state, [], { now, randomInt, persistedStarts: {} });
  assert.equal(state.entries.size, 0);
  resetQuietMonitorSchedule(state);
  assert.equal(state.globalInFlight, 0);
  assert.equal(state.lastGlobalStartAt, Number.NEGATIVE_INFINITY);
});

test("a delayed product reports one cadence miss instead of creating catch-up work", () => {
  const randomInt = (minimum) => minimum;
  const state = createQuietMonitorSchedule();
  const [product] = products(1);
  reconcileQuietMonitorSchedule(state, [product], { now: 100_000, randomInt, persistedStarts: {} });
  const first = markQuietMonitorStarted(state, product.id, { now: 100_000, randomInt });
  markQuietMonitorFinished(state, product.id, first.startToken);
  const delayed = markQuietMonitorStarted(state, product.id, { now: 200_000, randomInt });
  assert.equal(delayed.cadenceMissed, true);
  assert.equal(delayed.nextDueAt, 245_000);
});

test("a completion from an old Stop generation cannot finish a newer request", () => {
  const randomInt = (minimum) => minimum;
  const state = createQuietMonitorSchedule();
  const [product] = products(1);
  reconcileQuietMonitorSchedule(state, [product], { now: 100_000, randomInt, persistedStarts: {} });
  const oldStart = markQuietMonitorStarted(state, product.id, { now: 100_000, randomInt });
  resetQuietMonitorSchedule(state);
  reconcileQuietMonitorSchedule(state, [product], { now: 200_000, randomInt, persistedStarts: {} });
  const newStart = markQuietMonitorStarted(state, product.id, { now: 200_000, randomInt });
  assert.notEqual(oldStart.startToken, newStart.startToken);
  assert.equal(markQuietMonitorFinished(state, product.id, oldStart.startToken), false);
  assert.equal(state.entries.get(product.id).inFlight, true);
  assert.equal(state.globalInFlight, 1);
  assert.equal(markQuietMonitorFinished(state, product.id, newStart.startToken), true);
});
