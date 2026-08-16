"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerProductFailure, registerStoreFailure } = require("../lib/quiet-monitor-failures");

test("three unreadable results quarantine only the exact product", () => {
  const failures = new Map();
  assert.deepEqual(registerProductFailure(failures, "target:111111"), { quarantined: false, count: 1 });
  registerProductFailure(failures, "target:222222");
  assert.deepEqual(registerProductFailure(failures, "target:111111"), { quarantined: false, count: 2 });
  assert.deepEqual(registerProductFailure(failures, "target:111111"), { quarantined: true, count: 3 });
  assert.equal(failures.has("target:111111"), false);
  assert.equal(failures.get("target:222222"), 1);
});

test("a structural shell response quarantines on the first failure", () => {
  const failures = new Map();
  failures.set("target:222222", 2);
  assert.deepEqual(registerProductFailure(failures, "target:111111", 1), { quarantined: true, count: 1 });
  assert.equal(failures.has("target:111111"), false);
  // A prior transient count still resolves through the structural limit.
  assert.deepEqual(registerProductFailure(failures, "target:222222", 1), { quarantined: true, count: 3 });
  assert.equal(failures.has("target:222222"), false);
});

test("a store breaker requires distinct products inside the rolling window", () => {
  const failures = new Map();
  const input = { retailer: "target", now: 100_000, windowMs: 60_000, distinctLimit: 4 };
  assert.equal(registerStoreFailure(failures, { ...input, productId: "target:1" }).tripped, false);
  assert.equal(registerStoreFailure(failures, { ...input, productId: "target:1", now: 101_000 }).tripped, false);
  assert.equal(registerStoreFailure(failures, { ...input, productId: "target:2", now: 102_000 }).tripped, false);
  assert.equal(registerStoreFailure(failures, { ...input, productId: "target:3", now: 103_000 }).tripped, false);
  assert.equal(registerStoreFailure(failures, { ...input, productId: "target:4", now: 104_000 }).tripped, true);
  assert.equal(failures.get("target").size, 0);
});

test("expired transport failures and another retailer cannot trip the store", () => {
  const failures = new Map();
  registerStoreFailure(failures, { retailer: "target", productId: "target:1", now: 1_000, windowMs: 60_000, distinctLimit: 2 });
  assert.equal(registerStoreFailure(failures, {
    retailer: "target", productId: "target:2", now: 61_001, windowMs: 60_000, distinctLimit: 2
  }).tripped, false);
  assert.equal(registerStoreFailure(failures, {
    retailer: "walmart", productId: "walmart:1", now: 61_002, windowMs: 60_000, distinctLimit: 2
  }).tripped, false);
});
