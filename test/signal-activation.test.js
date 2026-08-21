"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SIGNAL_ACTIVATION_TTL_MS,
  activateSignalProduct,
  activeSignalActivations
} = require("../lib/signal-activation");
const { normalizeSignal } = require("../lib/signal-inbox");

test("signal activations authorize only the exact product in the current run", () => {
  const now = 1_000_000;
  const active = activateSignalProduct({}, {
    productId: "target:12345678",
    signalId: "discord:1",
    source: "discord",
    runId: "run-1"
  }, now);
  assert.deepEqual(Object.keys(active), ["target:12345678"]);
  assert.equal(active["target:12345678"].expiresAt, now + SIGNAL_ACTIVATION_TTL_MS);
  assert.deepEqual(activeSignalActivations(active, "run-2", now + 1), {});
  assert.deepEqual(activeSignalActivations(active, "run-1", now + SIGNAL_ACTIVATION_TTL_MS), {});
});

test("a newer browser signal refreshes one product without waking its siblings", () => {
  const first = activateSignalProduct({}, {
    productId: "walmart:111",
    signalId: "discord:1",
    runId: "run-1"
  }, 100);
  const second = activateSignalProduct(first, {
    productId: "walmart:222",
    signalId: "browser:2",
    source: "browser",
    runId: "run-1"
  }, 200);
  assert.deepEqual(Object.keys(second).sort(), ["walmart:111", "walmart:222"]);
  assert.equal(second["walmart:222"].source, "browser");
});

test("the signal inbox preserves the bounded browser source label", () => {
  const signal = normalizeSignal({
    id: "browser:run:target:95298172",
    source: "browser",
    retailer: "target",
    sku: "95298172",
    observedAt: "2026-08-20T12:00:00.000Z"
  });
  assert.equal(signal.source, "browser");
  assert.equal(signal.productId, "target:95298172");
});
