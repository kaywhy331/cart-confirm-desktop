"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyOverloadSignal,
  isOverloadStatus,
  parseRetryAfter,
  reserveNavigationSlot,
  revalidateNavigationSlot
} = require("../extension/traffic");

test("traffic slots serialize independent tabs for one retailer", () => {
  const first = reserveNavigationSlot({}, {
    now: 1_000,
    notBefore: 1_000,
    intervalMs: 20_000,
    reservationId: "one",
    ownerId: "tab:1",
    productId: "target:1"
  });
  const second = reserveNavigationSlot(first.state, {
    now: 1_000,
    notBefore: 1_000,
    intervalMs: 20_000,
    reservationId: "two",
    ownerId: "tab:2",
    productId: "target:2"
  });
  assert.equal(first.allowedAt, 1_000);
  assert.equal(second.allowedAt, 21_000);

  const consumed = revalidateNavigationSlot(second.state, {
    now: 1_000,
    reservationId: "one",
    ownerId: "tab:1",
    productId: "target:1"
  });
  assert.equal(consumed.allowed, true);
});

test("an overload circuit shifts an existing reservation", () => {
  const reserved = reserveNavigationSlot({}, {
    now: 10_000,
    notBefore: 20_000,
    intervalMs: 20_000,
    reservationId: "one",
    ownerId: "tab:1",
    productId: "amazon:A"
  });
  const overloaded = applyOverloadSignal(reserved.state, {
    now: 12_000,
    defaultCooldownMs: 300_000,
    retryAfterMs: 600_000,
    status: 429
  });
  const checked = revalidateNavigationSlot(overloaded.state, {
    now: 20_000,
    reservationId: "one",
    ownerId: "tab:1",
    productId: "amazon:A"
  });
  assert.equal(checked.allowed, false);
  assert.equal(checked.waitMs, 592_000);
  assert.equal(checked.state.lastStatus, 429);
});

test("Retry-After and overload status parsing are bounded", () => {
  assert.equal(parseRetryAfter("120", 0), 120_000);
  assert.equal(parseRetryAfter("999999", 0), 86_400_000);
  assert.equal(parseRetryAfter("not-a-date", 0), 0);
  assert.equal(isOverloadStatus(429), true);
  assert.equal(isOverloadStatus(503), true);
  assert.equal(isOverloadStatus(522), true);
  assert.equal(isOverloadStatus(500), false);
});

test("repeated overload signals escalate and then decay", () => {
  const first = applyOverloadSignal({}, { now: 1_000, defaultCooldownMs: 60_000, status: 503 });
  const second = applyOverloadSignal(first.state, { now: 62_000, defaultCooldownMs: 60_000, status: 503 });
  assert.equal(first.cooldownMs, 60_000);
  assert.equal(second.cooldownMs, 120_000);

  const decayed = applyOverloadSignal(second.state, {
    now: second.state.lastSignalAt + 6 * 60 * 60_000 + 1,
    defaultCooldownMs: 60_000,
    status: 503
  });
  assert.equal(decayed.cooldownMs, 60_000);
});

test("a product's fresh reservation replaces its stale one instead of queueing behind it", () => {
  const first = reserveNavigationSlot({}, {
    now: 1_000,
    intervalMs: 20_000,
    reservationId: "retry-1",
    ownerId: "tab:1",
    productId: "target:1"
  });
  const second = reserveNavigationSlot(first.state, {
    now: 2_000,
    intervalMs: 20_000,
    reservationId: "retry-2",
    ownerId: "tab:1",
    productId: "target:1"
  });
  assert.equal(second.allowedAt, 2_000);
  assert.deepEqual(Object.keys(second.state.reservations), ["retry-2"]);

  const other = reserveNavigationSlot(second.state, {
    now: 2_500,
    intervalMs: 20_000,
    reservationId: "retry-3",
    ownerId: "tab:2",
    productId: "target:2"
  });
  assert.equal(other.allowedAt, 22_000, "a different product still honors the spacing chain");
});
