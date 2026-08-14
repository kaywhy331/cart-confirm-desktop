"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const QueueCapture = require("../extension/queue-capture");

const capture = {
  retailer: "walmart",
  runId: "run-1",
  cohortId: "cohort-1",
  winnerProductId: "walmart:111",
  participantProductIds: ["walmart:111", "walmart:222"],
  expiresAt: 10_000
};
const blitz = {
  id: "walmart:222",
  retailer: "walmart",
  executionMode: "blitz",
  executionCohortId: "cohort-1",
  executionExpiresAt: 10_000
};
const active = {
  automationEnabled: true,
  monitoringPaused: false,
  automationRunId: "run-1",
  queueCaptures: { "cohort-1": capture },
  walmartQueueCaptureReloads: 0
};

test("queue capture applies only to an active current-run Walmart blitz mission", () => {
  assert.equal(QueueCapture.captureForProduct(active, blitz, 9_999), capture);
  assert.equal(QueueCapture.captureForProduct(active, blitz, 10_000), null);
  assert.equal(QueueCapture.captureForProduct({ ...active, automationRunId: "run-2" }, blitz, 9_999), null);
  assert.equal(QueueCapture.captureForProduct({ ...active, monitoringPaused: true }, blitz, 9_999), null);
  assert.equal(QueueCapture.captureForProduct(active, { ...blitz, executionMode: "watcher" }, 9_999), null);
  assert.equal(QueueCapture.captureForProduct(active, { ...blitz, retailer: "target" }, 9_999), null);
});

test("queue capture uses a two-second page-settle check and validates custom limits", () => {
  assert.equal(QueueCapture.PAGE_SETTLE_MS, 2_000);
  assert.equal(QueueCapture.DEFAULT_MAX_RELOADS, 0);
  assert.equal(QueueCapture.maxReloads({ walmartQueueCaptureReloads: 8 }), 8);
  assert.equal(QueueCapture.maxReloads({ walmartQueueCaptureReloads: 0 }), 0);
});
