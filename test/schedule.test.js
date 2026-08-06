"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SCHEDULE_GRACE_MS, evaluateSchedule, scheduleKey } = require("../lib/schedule");

function settings(at) {
  return {
    scheduledOpenEnabled: true,
    scheduledOpenAt: new Date(at).toISOString(),
    scheduledRetailer: "walmart",
    products: [
      { id: "walmart:12345", retailer: "walmart", enabled: true },
      { id: "target:999999", retailer: "target", enabled: true }
    ]
  };
}

test("a single schedule fires only inside its bounded grace period", () => {
  const target = 1_000_000;
  const config = settings(target);
  assert.equal(evaluateSchedule(config, null, target - 1).action, "wait");
  assert.equal(evaluateSchedule(config, null, target).action, "fire");
  assert.equal(evaluateSchedule(config, null, target + SCHEDULE_GRACE_MS + 1).action, "missed");
});

test("a persisted receipt prevents the same schedule from firing after restart", () => {
  const config = settings(1_000_000);
  const key = scheduleKey(config);
  assert.equal(evaluateSchedule(config, { key, status: "firing" }, 1_000_001).action, "consumed");
  assert.equal(evaluateSchedule(config, { key, status: "fired" }, 1_000_001).action, "consumed");
});
