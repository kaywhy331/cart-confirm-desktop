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
  productExecutionContext,
  queueCaptureForProduct,
  reconcileProductExecutionContexts,
  registerQueueCapture,
  reserveQueueCaptureAttempt,
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
          firedAt: "2026-08-05T12:00:00.000Z",
          expiresAt: 2_000_000_000_000,
          cohortId: "cohort-a",
          participantProductIds: ["target:1011483406"]
        }
      },
      queueFanoutReceipts: {
        "run-1|walmart": { status: "fired", recordedAt: "2026-08-05T12:00:01.000Z" }
      },
      queueCaptures: {
        "cohort-w": {
          retailer: "walmart",
          runId: "run-1",
          cohortId: "cohort-w",
          winnerProductId: "walmart:123456789",
          participantProductIds: ["walmart:123456789"],
          detectedAt: "2026-08-05T12:00:01.000Z",
          expiresAt: 2_000_000_000_000,
          attempts: {}
        }
      },
      walmartPrepObservations: {
        "walmart:123456789": {
          status: 200,
          availability: "unavailable",
          price: 49.99,
          queue: false,
          etag: '"abc"',
          observedAt: "2026-08-05T12:00:01.000Z",
          fingerprint: '[200,"unavailable",49.99,false]'
        }
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
    assert.equal(productExecutionMode(loaded, "target:1011483406", "run-1", 1_999_999_999_999), "blitz");
    assert.equal(productExecutionMode(loaded, "target:1011483406", "run-2"), "watcher");
    assert.equal(loaded.queueFanoutReceipts["run-1|walmart"].status, "fired");
    assert.equal(loaded.queueCaptures["cohort-w"].winnerProductId, "walmart:123456789");
    assert.equal(loaded.walmartPrepObservations["walmart:123456789"].etag, '"abc"');
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

test("the first queue capture is immutable within each Walmart release cohort", () => {
  const state = { productExecutionContexts: {}, queueCaptures: {} };
  const first = { id: "walmart:111", retailer: "walmart" };
  const second = { id: "walmart:222", retailer: "walmart" };
  activateBlitzExecution(state, [first, second], "run-1", "schedule-key", 1_000, 120);

  const created = registerQueueCapture(state, first, "run-1", 2_000);
  const repeated = registerQueueCapture(state, second, "run-1", 3_000);

  assert.equal(created.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.capture.winnerProductId, first.id);
  assert.equal(registerQueueCapture(state, first, "run-2", 4_000).created, false);
  assert.equal(queueCaptureForProduct(state, second.id, "run-1", 4_000).winnerProductId, first.id);
});

test("calendar release activates blitz durably and schedule edits clear stale context", () => {
  const state = { productExecutionContexts: {} };
  const scheduled = [{ id: "target:1011209279", enabled: true, openAt: "2026-08-12T12:00:00.000Z" }];
  activateBlitzExecution(state, scheduled, "run-1", "schedule-key", 1_000, 120);
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1", 1_001), "blitz");

  const released = [{ ...scheduled[0], openAt: "" }];
  reconcileProductExecutionContexts(state, released, released, "run-1");
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1", 1_001), "blitz");

  const rescheduled = [{ ...released[0], openAt: "2026-08-13T12:00:00.000Z" }];
  reconcileProductExecutionContexts(state, released, rescheduled, "run-1");
  assert.equal(productExecutionMode(state, scheduled[0].id, "run-1"), "watcher");
});

test("blitz expires exactly at its deadline and legacy contexts fail to watcher", () => {
  const product = { id: "walmart:111", retailer: "walmart" };
  const state = { productExecutionContexts: {}, queueCaptures: {} };
  activateBlitzExecution(state, [product], "run", "release", 1_000, 15);
  const context = productExecutionContext(state, product.id, "run", 1_001);
  assert.equal(productExecutionMode(state, product.id, "run", context.expiresAt - 1), "blitz");
  assert.equal(productExecutionMode(state, product.id, "run", context.expiresAt), "watcher");
  assert.equal(productExecutionMode(state, product.id, "run", context.expiresAt + 1), "watcher");
  assert.equal(productExecutionMode({ productExecutionContexts: { [product.id]: { mode: "blitz", runId: "run" } } }, product.id, "run", 1), "watcher");
});

test("queue-capture attempt reservations are durable, concurrent-safe, and zero means zero", () => {
  const winner = { id: "walmart:111", retailer: "walmart" };
  const loser = { id: "walmart:222", retailer: "walmart" };
  const state = { productExecutionContexts: {}, queueCaptures: {} };
  activateBlitzExecution(state, [winner, loser], "run", "release", 1_000, 15);
  registerQueueCapture(state, winner, "run", 1_001);
  assert.equal(reserveQueueCaptureAttempt(state, {
    productId: loser.id, runId: "run", reservationId: "r0", limit: 0, now: 1_002
  }).reason, "reloads-disabled");
  const first = reserveQueueCaptureAttempt(state, {
    productId: loser.id, runId: "run", reservationId: "r1", limit: 2, now: 1_003
  });
  const duplicate = reserveQueueCaptureAttempt(state, {
    productId: loser.id, runId: "run", reservationId: "r1", limit: 2, now: 1_004
  });
  assert.equal(first.attempts, 1);
  assert.equal(duplicate.attempts, 1);
  assert.equal(duplicate.deduped, true);
  assert.equal(reserveQueueCaptureAttempt(state, {
    productId: winner.id, runId: "run", reservationId: "winner", limit: 2, now: 1_005
  }).reason, "queued-winner");
  const restored = require("../lib/runtime-state").normalizeRuntimeState(state);
  assert.equal(reserveQueueCaptureAttempt(restored, {
    productId: loser.id, runId: "run", reservationId: "r2", limit: 2, now: 1_006
  }).attempts, 2);
});
