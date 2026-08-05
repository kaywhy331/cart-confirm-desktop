"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStoreOpenQueue } = require("../lib/store-open-queue");

test("desktop openings for one store are serialized with the configured spacing", async () => {
  let clock = 1_000;
  const waits = [];
  const opened = [];
  const queue = createStoreOpenQueue({
    now: () => clock,
    intervalMs: () => 20_000,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    }
  });

  await Promise.all([
    queue.enqueue("target", async () => opened.push(["first", clock])),
    queue.enqueue("target", async () => opened.push(["second", clock]))
  ]);

  assert.deepEqual(opened, [["first", 1_000], ["second", 21_000]]);
  assert.deepEqual(waits, [20_000]);
});

test("a blocked store queue does not block a different retailer", async () => {
  let releaseTarget;
  const targetGate = new Promise((resolve) => { releaseTarget = resolve; });
  const opened = [];
  const queue = createStoreOpenQueue({ intervalMs: () => 0 });

  const target = queue.enqueue("target", async () => {
    await targetGate;
    opened.push("target");
  });
  await queue.enqueue("amazon", async () => opened.push("amazon"));
  assert.deepEqual(opened, ["amazon"]);
  releaseTarget();
  await target;
  assert.deepEqual(opened, ["amazon", "target"]);
});

test("a cooldown arriving during a queued wait extends the opening time", async () => {
  let clock = 1_000;
  let cooldownUntil = 0;
  const waits = [];
  const opened = [];
  const queue = createStoreOpenQueue({
    now: () => clock,
    intervalMs: () => 20_000,
    notBefore: () => cooldownUntil,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
      if (waits.length === 1) cooldownUntil = 51_000;
    }
  });

  await queue.enqueue("target", async () => opened.push(clock));
  await queue.enqueue("target", async () => opened.push(clock));
  assert.deepEqual(opened, [1_000, 51_000]);
  assert.deepEqual(waits, [20_000, 30_000]);
});
