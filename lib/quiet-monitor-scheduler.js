"use strict";

const QUIET_INTERVAL_MIN_MS = 45_000;
const QUIET_INTERVAL_MAX_MS = 90_000;
const QUIET_DISPATCH_TICK_MS = 250;
const QUIET_GLOBAL_START_GAP_MS = 500;
const QUIET_STORE_START_GAP_MS = 750;
const QUIET_MAX_GLOBAL_IN_FLIGHT = 4;
const QUIET_MAX_STORE_IN_FLIGHT = 2;

function createQuietMonitorSchedule() {
  return {
    entries: new Map(),
    globalInFlight: 0,
    storeInFlight: new Map(),
    nextStartToken: 1,
    lastGlobalStartAt: Number.NEGATIVE_INFINITY,
    lastStoreStartAt: new Map()
  };
}

function randomTie(randomInt) {
  return randomInt(0, 0x7fffffff);
}

function boundedPersistedStart(value, now) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < 0) return 0;
  return Math.min(timestamp, now);
}

function reconcileQuietMonitorSchedule(state, products, options = {}) {
  const now = Number(options.now ?? Date.now());
  const randomInt = options.randomInt;
  const persistedStarts = options.persistedStarts || {};
  if (typeof randomInt !== "function") throw new Error("A quiet-monitor random source is required.");

  for (const entry of state.entries.values()) entry.eligible = false;
  for (const product of products || []) {
    const productId = String(product?.id || "");
    const retailer = String(product?.retailer || "");
    if (!productId || !["target", "walmart"].includes(retailer)) continue;
    let entry = state.entries.get(productId);
    if (!entry) {
      const lastStartedAt = boundedPersistedStart(persistedStarts[productId], now);
      entry = {
        productId,
        retailer,
        dueAt: lastStartedAt ? Math.max(now, lastStartedAt + QUIET_INTERVAL_MIN_MS) : now,
        lastStartedAt,
        inFlight: false,
        eligible: true,
        randomTie: randomTie(randomInt)
      };
      state.entries.set(productId, entry);
    } else {
      entry.eligible = true;
    }
  }

  for (const [productId, entry] of state.entries) {
    if (!entry.eligible && !entry.inFlight) state.entries.delete(productId);
  }
  return state;
}

function storeBlocked(blockedUntil, retailer, now) {
  if (blockedUntil instanceof Map) return Number(blockedUntil.get(retailer) || 0) > now;
  return Number(blockedUntil?.[retailer] || 0) > now;
}

function nextQuietMonitorCandidate(state, options = {}) {
  const now = Number(options.now ?? Date.now());
  if (state.globalInFlight >= QUIET_MAX_GLOBAL_IN_FLIGHT) return null;
  if (now < state.lastGlobalStartAt + QUIET_GLOBAL_START_GAP_MS) return null;

  const candidates = [];
  for (const entry of state.entries.values()) {
    if (!entry.eligible || entry.inFlight || entry.dueAt > now) continue;
    if (storeBlocked(options.blockedUntil, entry.retailer, now)) continue;
    if ((state.storeInFlight.get(entry.retailer) || 0) >= QUIET_MAX_STORE_IN_FLIGHT) continue;
    if (now < (state.lastStoreStartAt.get(entry.retailer) ?? Number.NEGATIVE_INFINITY) + QUIET_STORE_START_GAP_MS) continue;
    candidates.push(entry);
  }
  candidates.sort((left, right) => (
    left.dueAt - right.dueAt
    || left.randomTie - right.randomTie
    || left.productId.localeCompare(right.productId)
  ));
  return candidates[0] || null;
}

function markQuietMonitorStarted(state, productId, options = {}) {
  const now = Number(options.now ?? Date.now());
  const randomInt = options.randomInt;
  if (typeof randomInt !== "function") throw new Error("A quiet-monitor random source is required.");
  const entry = state.entries.get(String(productId || ""));
  if (!entry?.eligible || entry.inFlight) return null;

  const previousStartedAt = entry.lastStartedAt;
  const intervalMs = randomInt(
    QUIET_INTERVAL_MIN_MS / 1000,
    QUIET_INTERVAL_MAX_MS / 1000 + 1
  ) * 1000;
  entry.inFlight = true;
  entry.activeToken = state.nextStartToken;
  state.nextStartToken += 1;
  entry.lastStartedAt = now;
  entry.dueAt = now + intervalMs;
  entry.randomTie = randomTie(randomInt);
  state.globalInFlight += 1;
  state.storeInFlight.set(entry.retailer, (state.storeInFlight.get(entry.retailer) || 0) + 1);
  state.lastGlobalStartAt = now;
  state.lastStoreStartAt.set(entry.retailer, now);
  return {
    productId: entry.productId,
    retailer: entry.retailer,
    startedAt: now,
    previousStartedAt,
    nextDueAt: entry.dueAt,
    intervalMs,
    startToken: entry.activeToken,
    cadenceMissed: previousStartedAt > 0 && now - previousStartedAt > QUIET_INTERVAL_MAX_MS
  };
}

function markQuietMonitorFinished(state, productId, startToken) {
  const entry = state.entries.get(String(productId || ""));
  if (!entry?.inFlight || entry.activeToken !== startToken) return false;
  entry.inFlight = false;
  entry.activeToken = 0;
  state.globalInFlight = Math.max(0, state.globalInFlight - 1);
  state.storeInFlight.set(entry.retailer, Math.max(0, (state.storeInFlight.get(entry.retailer) || 0) - 1));
  if (!entry.eligible) state.entries.delete(entry.productId);
  return true;
}

function deferQuietMonitorStore(state, retailer, notBefore, randomInt) {
  const deadline = Math.max(0, Number(notBefore) || 0);
  for (const entry of state.entries.values()) {
    if (entry.retailer !== retailer || !entry.eligible || entry.inFlight) continue;
    entry.dueAt = Math.max(entry.dueAt, deadline);
    entry.randomTie = randomTie(randomInt);
  }
  return state;
}

function resetQuietMonitorSchedule(state) {
  state.entries.clear();
  state.globalInFlight = 0;
  state.storeInFlight.clear();
  state.lastGlobalStartAt = Number.NEGATIVE_INFINITY;
  state.lastStoreStartAt.clear();
  return state;
}

module.exports = {
  QUIET_DISPATCH_TICK_MS,
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
};
