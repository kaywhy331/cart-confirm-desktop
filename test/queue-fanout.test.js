"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  QUEUE_FANOUT_SPACING_MS,
  planQueueFanout,
  queueFanoutKey
} = require("../lib/queue-fanout");

function settings(overrides = {}) {
  return {
    automationEnabled: true,
    monitoringPaused: false,
    automationRunId: "run-1",
    products: [
      { id: "walmart:1", retailer: "walmart", enabled: true },
      { id: "walmart:2", retailer: "walmart", enabled: true },
      { id: "walmart:3", retailer: "walmart", enabled: true },
      { id: "walmart:scheduled", retailer: "walmart", enabled: true, openAt: "2026-08-12T00:00:00.000Z" },
      { id: "walmart:off", retailer: "walmart", enabled: false },
      { id: "target:1", retailer: "target", enabled: true }
    ],
    ...overrides
  };
}

function queueEvent(overrides = {}) {
  return {
    eventType: "queue-waiting",
    productId: "walmart:1",
    retailer: "walmart",
    availability: "unknown",
    ...overrides
  };
}

const capture = {
  retailer: "walmart",
  runId: "run-1",
  cohortId: "cohort-a",
  participantProductIds: ["walmart:1", "walmart:2", "walmart:3"]
};

test("the first official queue signal fans out remaining enabled missions once", () => {
  const decision = planQueueFanout({ settings: settings(), event: queueEvent(), capture, receipts: {} });
  assert.equal(decision.key, "run-1|walmart|cohort-a");
  assert.deepEqual(decision.productIds, ["walmart:2", "walmart:3"]);
  assert.equal(decision.spacingMs, QUEUE_FANOUT_SPACING_MS);
  assert.equal(decision.spacingMs, 0);
  assert.equal(decision.parallel, true);
  assert.equal(decision.dedicatedTab, true);
  assert.equal(decision.openRequestDrainMs, 3_000);
});

test("fan-out excludes tabs already waiting in the official queue", () => {
  const decision = planQueueFanout({
    settings: settings(),
    event: queueEvent(),
    capture,
    receipts: {},
    queuedProductIds: ["walmart:2"]
  });
  assert.deepEqual(decision.productIds, ["walmart:3"]);
});

test("a durable receipt blocks duplicate queue bursts until a new run", () => {
  const key = queueFanoutKey("run-1", "walmart", "cohort-a");
  assert.equal(planQueueFanout({
    settings: settings(),
    event: queueEvent(),
    capture,
    receipts: { [key]: { status: "firing" } }
  }), null);

  const next = planQueueFanout({
    settings: settings({ automationRunId: "run-2" }),
    event: queueEvent(),
    capture: { ...capture, runId: "run-2", cohortId: "cohort-b" },
    receipts: { [key]: { status: "fired" } }
  });
  assert.equal(next.key, "run-2|walmart|cohort-b");
});

test("fan-out fails closed while stopped, disarmed, or sold out", () => {
  assert.equal(planQueueFanout({
    settings: settings({ automationEnabled: false }),
    event: queueEvent(), capture
  }), null);
  assert.equal(planQueueFanout({
    settings: settings({ monitoringPaused: true }),
    event: queueEvent(), capture
  }), null);
  assert.equal(planQueueFanout({
    settings: settings(),
    event: queueEvent({ availability: "unavailable" }), capture
  }), null);
  assert.equal(planQueueFanout({
    settings: settings({
      products: settings().products.map((product) => (
        product.id === "walmart:1" ? { ...product, openAt: "2026-08-12T00:00:00.000Z" } : product
      ))
    }),
    event: queueEvent(), capture
  }), null);
});

test("two cohorts in one run remain isolated and immutable", () => {
  const first = planQueueFanout({ settings: settings(), event: queueEvent(), capture, receipts: {} });
  const secondCapture = {
    ...capture,
    cohortId: "cohort-b",
    participantProductIds: ["walmart:1", "walmart:3"]
  };
  const second = planQueueFanout({ settings: settings(), event: queueEvent(), capture: secondCapture, receipts: {} });
  assert.notEqual(first.key, second.key);
  assert.deepEqual(second.productIds, ["walmart:3"]);
});
