"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ACTION_BUDGET_WINDOW_MS, consumeStoreAction } = require("../lib/action-budget");

test("the shared store budget hard-stops after its hourly limit", () => {
  const now = 2 * ACTION_BUDGET_WINDOW_MS;
  const history = Array.from({ length: 3 }, (_, index) => now - 1000 + index);
  const blocked = consumeStoreAction(history, now, 3);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAt, history[0] + ACTION_BUDGET_WINDOW_MS);
});

test("expired actions fall out of the rolling window", () => {
  const now = 2 * ACTION_BUDGET_WINDOW_MS;
  const result = consumeStoreAction([now - ACTION_BUDGET_WINDOW_MS - 1], now, 1);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.history, [now]);
});

test("an active overload cooldown rejects actions without consuming the hourly budget", () => {
  const history = [9_000];
  const result = consumeStoreAction(history, 10_000, 120, 20_000);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "traffic-overload");
  assert.equal(result.retryAt, 20_000);
  assert.deepEqual(result.history, history);
});
