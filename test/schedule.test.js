"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SCHEDULE_GRACE_MS,
  evaluateProductSchedules,
  evaluateSchedule,
  planImmediateProductOpenings,
  productScheduleKey,
  scheduleKey
} = require("../lib/schedule");

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

test("per-product schedules fire exactly once inside their grace window", () => {
  const openAt = new Date(2_000_000).toISOString();
  const products = [
    { id: "target:95298172", retailer: "target", enabled: true, openAt },
    { id: "walmart:12345", retailer: "walmart", enabled: true, openAt: "" },
    { id: "amazon:B0ABC12345", retailer: "amazon", enabled: false, openAt }
  ];
  const key = productScheduleKey(products[0]);

  assert.deepEqual(evaluateProductSchedules(products, {}, 1_999_999), []);
  const due = evaluateProductSchedules(products, {}, 2_000_001);
  assert.equal(due.length, 1);
  assert.equal(due[0].productId, "target:95298172");
  assert.equal(due[0].action, "fire");
  assert.equal(due[0].key, key);

  const consumed = evaluateProductSchedules(products, { [key]: { status: "firing" } }, 2_000_001);
  assert.deepEqual(consumed, []);

  const missed = evaluateProductSchedules(products, {}, 2_000_000 + SCHEDULE_GRACE_MS + 1);
  assert.equal(missed[0].action, "missed");
});

test("multiple product schedules act independently", () => {
  const products = [
    { id: "target:1", retailer: "target", enabled: true, openAt: new Date(1_000_000).toISOString() },
    { id: "target:2", retailer: "target", enabled: true, openAt: new Date(5_000_000).toISOString() }
  ];
  const actions = evaluateProductSchedules(products, {}, 1_000_010);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].productId, "target:1");
});

test("immediate mission sweeps defer every calendar-owned product", () => {
  const config = {
    scheduledOpenEnabled: true,
    scheduledOpenAt: new Date(9_000_000).toISOString(),
    scheduledRetailer: "walmart",
    products: [
      { id: "target:ready", retailer: "target", enabled: true, openAt: "" },
      { id: "target:scheduled", retailer: "target", enabled: true, openAt: new Date(8_000_000).toISOString() },
      { id: "walmart:global", retailer: "walmart", enabled: true, openAt: "" },
      { id: "amazon:off", retailer: "amazon", enabled: false, openAt: "" }
    ]
  };

  const all = planImmediateProductOpenings(config);
  assert.deepEqual(all.ready.map((product) => product.id), ["target:ready"]);
  assert.deepEqual(all.scheduled.map((product) => product.id), ["target:scheduled", "walmart:global"]);
  assert.deepEqual(
    planImmediateProductOpenings(config, "target").scheduled.map((product) => product.id),
    ["target:scheduled"]
  );
});
