"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SIGNAL_ACTIVATION_TTL_MS,
  activateSignalProduct,
  activateSignalProductIfIdle,
  activeSignalActivations
} = require("../lib/signal-activation");
const { normalizeSignal } = require("../lib/signal-inbox");
const NOW = 1_000_000;

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

test("simultaneous sources coalesce while a later post-cancellation signal can activate", () => {
  const first = activateSignalProductIfIdle({}, {
    productId: "walmart:123",
    signalId: "trackalacker:first",
    source: "trackalacker",
    runId: "run-1",
    offerBinding: { maximumPrice: 49.99, firstParty: true }
  }, NOW);
  assert.equal(first.created, true);
  assert.equal(first.activation.signalId, "trackalacker:first");

  const corroborated = activateSignalProductIfIdle(first.activations, {
    productId: "walmart:123",
    signalId: "discord:second",
    source: "discord",
    runId: "run-1",
    offerBinding: { maximumPrice: 44.99, firstParty: true }
  }, NOW + 1_000);
  assert.equal(corroborated.created, false);
  assert.equal(corroborated.activation.signalId, "trackalacker:first");
  assert.equal(corroborated.activation.offerBinding.maximumPrice, 49.99);

  const cancelled = { ...corroborated.activations };
  delete cancelled["walmart:123"];
  const reSignaled = activateSignalProductIfIdle(cancelled, {
    productId: "walmart:123",
    signalId: "trackalacker:third",
    source: "trackalacker",
    runId: "run-1",
    offerBinding: { maximumPrice: 39.99, firstParty: true }
  }, NOW + 60_000);
  assert.equal(reSignaled.created, true);
  assert.equal(reSignaled.activation.signalId, "trackalacker:third");
  assert.equal(reSignaled.activation.offerBinding.maximumPrice, 39.99);
});

test("a strategy activation retains only bounded action and quantity overrides", () => {
  const active = activateSignalProduct({}, {
    productId: "amazon:B0GG16Q4X1",
    signalId: "trackalacker:strategy:1",
    source: "trackalacker",
    runId: "run-1",
    action: "review",
    quantity: 3,
    acceptPartial: true,
    strategyId: "signal-strategy:review",
    strategyName: "Review three",
    offerBinding: {
      maximumPrice: 49.999,
      seller: "  Acme   Collectibles  ",
      firstParty: false,
      allowThirdPartySeller: true,
      observedAt: "2026-08-21T12:00:00.000Z"
    }
  }, 500);
  assert.equal(active["amazon:B0GG16Q4X1"].action, "review");
  assert.equal(active["amazon:B0GG16Q4X1"].quantity, 3);
  assert.equal(active["amazon:B0GG16Q4X1"].acceptPartial, true);
  assert.equal(active["amazon:B0GG16Q4X1"].strategyId, "signal-strategy:review");
  assert.deepEqual(active["amazon:B0GG16Q4X1"].offerBinding, {
    maximumPrice: 50,
    seller: "Acme Collectibles",
    firstParty: false,
    allowThirdPartySeller: true,
    observedAt: "2026-08-21T12:00:00.000Z"
  });

  const rejected = activateSignalProduct({}, {
    productId: "amazon:B0GG16Q4X1",
    signalId: "trackalacker:strategy:2",
    source: "trackalacker",
    runId: "run-1",
    action: "unsafe-action",
    quantity: 100
  }, 500);
  assert.equal(rejected["amazon:B0GG16Q4X1"].action, "");
  assert.equal(rejected["amazon:B0GG16Q4X1"].quantity, null);
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
