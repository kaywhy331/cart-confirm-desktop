"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_QUIET_READS_PER_HOUR,
  QUIET_READ_BUDGET_WINDOW_MS,
  consumeQuietRead
} = require("../lib/quiet-read-budget");

test("quiet reads use their own exact half-open rolling-hour ceiling", () => {
  const now = 2 * QUIET_READ_BUDGET_WINDOW_MS;
  const history = Array.from({ length: 3 }, (_, index) => now - 1_000 + index);
  const blocked = consumeQuietRead(history, now, 3);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "quiet-read-budget-exhausted");
  assert.equal(blocked.retryAt, history[0] + QUIET_READ_BUDGET_WINDOW_MS);

  const boundary = consumeQuietRead([now - QUIET_READ_BUDGET_WINDOW_MS], now, 1);
  assert.equal(boundary.allowed, true);
  assert.deepEqual(boundary.history, [now]);
});

test("an overload deadline blocks without consuming or refunding a quiet-read token", () => {
  const result = consumeQuietRead([9_000], 10_000, MAX_QUIET_READS_PER_HOUR, 20_000);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "traffic-overload");
  assert.deepEqual(result.history, [9_000]);
});

test("an allowed attempt is charged before any fetch result exists", () => {
  const result = consumeQuietRead([], 10_000, 1);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.history, [10_000]);
  assert.equal(consumeQuietRead(result.history, 10_001, 1).allowed, false);
});
