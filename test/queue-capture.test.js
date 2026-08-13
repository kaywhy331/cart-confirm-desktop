"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const QueueCapture = require("../extension/queue-capture");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

const capture = {
  retailer: "walmart",
  runId: "run-1",
  winnerProductId: "walmart:111"
};
const blitz = { id: "walmart:222", retailer: "walmart", executionMode: "blitz" };
const active = {
  automationEnabled: true,
  monitoringPaused: false,
  automationRunId: "run-1",
  queueCapture: capture,
  walmartQueueCaptureReloads: 5
};

test("queue capture applies only to an active current-run Walmart blitz mission", () => {
  assert.equal(QueueCapture.captureForProduct(active, blitz), capture);
  assert.equal(QueueCapture.captureForProduct({ ...active, automationRunId: "run-2" }, blitz), null);
  assert.equal(QueueCapture.captureForProduct({ ...active, monitoringPaused: true }, blitz), null);
  assert.equal(QueueCapture.captureForProduct(active, { ...blitz, executionMode: "watcher" }), null);
  assert.equal(QueueCapture.captureForProduct(active, { ...blitz, retailer: "target" }), null);
});

test("configured queue capture attempts persist and clamp at the exact limit", () => {
  const session = storage();
  assert.equal(QueueCapture.maxReloads(active), 5);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(QueueCapture.recordReload(session, capture, blitz, QueueCapture.maxReloads(active)), attempt);
  }
  assert.equal(QueueCapture.recordReload(session, capture, blitz, 5), 5);
  assert.equal(QueueCapture.readAttempts(session, capture, blitz), 5);
});

test("queue capture uses a two-second page-settle check and validates custom limits", () => {
  assert.equal(QueueCapture.PAGE_SETTLE_MS, 2_000);
  assert.equal(QueueCapture.DEFAULT_MAX_RELOADS, 5);
  assert.equal(QueueCapture.maxReloads({ walmartQueueCaptureReloads: 8 }), 8);
  assert.equal(QueueCapture.maxReloads({ walmartQueueCaptureReloads: 0 }), 5);
});
