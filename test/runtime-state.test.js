"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  activateBlitzExecution,
  loadRuntimeState,
  productExecutionMode,
  reconcileProductExecutionContexts,
  saveRuntimeState
} = require("../lib/runtime-state");

test("runtime receipts and overload deadlines survive a process restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-state-"));
  const filePath = path.join(directory, "runtime-state.json");
  try {
    saveRuntimeState(filePath, {
      scheduleReceipt: { key: "walmart|time|item", status: "fired", recordedAt: "2026-08-05T12:00:00.000Z" },
      productExecutionContexts: {
        "target:1011483406": {
          mode: "blitz",
          runId: "run-1",
          scheduleKey: "target:1011483406|time",
          firedAt: "2026-08-05T12:00:00.000Z"
        }
      },
      queueFanoutReceipts: {
        "run-1|walmart": { status: "fired", recordedAt: "2026-08-05T12:00:01.000Z" }
      },
      storeOverloadUntil: { walmart: 123456 },
      storeActionHistory: { walmart: [1000, 2000] },
      discord: {
        channelId: "123456789012345678",
        channelName: "restocks",
        lastMessageId: "223456789012345678",
        lastPollAt: "2026-08-05T12:00:02.000Z"
      },
      signals: [{
        id: "discord:223456789012345678",
        retailer: "target",
        sku: "1011483406",
        title: "Pitch Black ETB",
        observedAt: "2026-08-05T12:00:01.000Z"
      }],
      events: [{ eventType: "queue-waiting" }]
    });
    const loaded = loadRuntimeState(filePath);
    assert.equal(loaded.scheduleReceipt.status, "fired");
    assert.equal(productExecutionMode(loaded, "target:1011483406", "run-1"), "blitz");
    assert.equal(productExecutionMode(loaded, "target:1011483406", "run-2"), "watcher");
    assert.equal(loaded.queueFanoutReceipts["run-1|walmart"].status, "fired");
    assert.equal(loaded.storeOverloadUntil.walmart, 123456);
    assert.deepEqual(loaded.storeActionHistory.walmart, [1000, 2000]);
    assert.equal(loaded.discord.channelName, "restocks");
    assert.equal(loaded.discord.lastMessageId, "223456789012345678");
    assert.equal(loaded.signals[0].productId, "target:1011483406");
    assert.equal(loaded.events[0].eventType, "queue-waiting");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("calendar release activates blitz durably and schedule edits clear stale context", () => {
  const state = { productExecutionContexts: {} };
  const scheduled = [{ id: "target:1011209279", enabled: true, openAt: "2026-08-12T12:00:00.000Z" }];
  activateBlitzExecution(state, scheduled, "run-1", "schedule-key", 1_000);
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1"), "blitz");

  const released = [{ ...scheduled[0], openAt: "" }];
  reconcileProductExecutionContexts(state, released, released, "run-1");
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1"), "blitz");

  const rescheduled = [{ ...released[0], openAt: "2026-08-13T12:00:00.000Z" }];
  reconcileProductExecutionContexts(state, released, rescheduled, "run-1");
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1"), "watcher");
});
