"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  MAX_SIGNAL_RECORDS,
  appendSignalRecord,
  defaultSignalJournal,
  duplicateSignalRecord,
  duplicateSemanticRecord,
  loadSignalJournal,
  normalizeSignalJournal,
  recordDuplicateOccurrence,
  saveSignalJournal,
  updateSignalRecord
} = require("../lib/signal-journal");

const NOW = Date.parse("2026-08-21T07:00:00.000Z");

function record(index = 1, overrides = {}) {
  if (index && typeof index === "object") {
    overrides = index;
    index = 1;
  }
  return {
    id: `signal-${index}`,
    signalId: `signal-${index}`,
    source: "trackalacker",
    transport: "windows_chrome_notification",
    notificationId: `notification-${index}`,
    transportKey: String(index).padStart(64, "a").slice(-64),
    semanticKey: String(index).padStart(64, "b").slice(-64),
    receivedAt: new Date(NOW + index).toISOString(),
    observedAt: new Date(NOW).toISOString(),
    rawTitle: "IN STOCK at Walmart!",
    rawBody: "An item\nin stock for $10.00",
    eventType: "in_stock",
    retailer: "walmart",
    productNameRaw: "An item",
    normalizedProductName: "an item",
    price: 10,
    currency: "USD",
    resolutionState: "matched",
    matchMethod: "exact-title-retailer",
    itemId: "trackalacker:123",
    productId: "walmart:45678",
    sourceProductId: "123",
    sourceListingId: "999",
    missionDecision: "queued",
    actionState: "pending",
    timing: {
      sourceCreatedAt: new Date(NOW).toISOString(),
      listenerReceivedAt: new Date(NOW + 1).toISOString(),
      cartcollectReceivedAt: new Date(NOW + 2).toISOString(),
      parseCompletedAt: new Date(NOW + 3).toISOString(),
      resolvedAt: new Date(NOW + 4).toISOString(),
      dedupeCompletedAt: new Date(NOW + 5).toISOString(),
      missionEvaluatedAt: new Date(NOW + 6).toISOString(),
      acknowledgedAt: new Date(NOW + 7).toISOString()
    },
    ...overrides
  };
}

test("signal receipts survive restart and retain every hot-path timestamp", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-signal-journal-"));
  const filePath = path.join(directory, "signals.json");
  try {
    const state = appendSignalRecord(defaultSignalJournal(), record(), NOW + 10);
    saveSignalJournal(filePath, state);
    const loaded = loadSignalJournal(filePath);
    assert.equal(loaded.records.length, 1);
    assert.equal(loaded.records[0].missionDecision, "queued");
    assert.equal(loaded.records[0].timing.parseCompletedAt, new Date(NOW + 3).toISOString());
    assert.equal(loaded.records[0].timing.dedupeCompletedAt, new Date(NOW + 5).toISOString());
    assert.equal(loaded.records[0].rawBody.includes("\n"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("semantic dedupe uses a sliding window and treats a price change as new", () => {
  const state = appendSignalRecord(defaultSignalJournal(), record({
    productId: "walmart:123",
    eventType: "in_stock",
    price: 49.99,
    observedAt: "2026-08-20T20:04:59.900Z"
  }));
  assert.ok(duplicateSemanticRecord(state, {
    productId: "walmart:123",
    eventType: "in_stock",
    price: 49.99,
    observedAt: "2026-08-20T20:05:00.100Z"
  }, 300));
  assert.equal(duplicateSemanticRecord(state, {
    productId: "walmart:123",
    eventType: "in_stock",
    price: 50,
    observedAt: "2026-08-20T20:05:00.100Z"
  }, 300), null);
});

test("transport, semantic, and signal IDs identify one durable receipt", () => {
  const state = appendSignalRecord(defaultSignalJournal(), record(), NOW + 10);
  const existing = state.records[0];
  assert.equal(duplicateSignalRecord(state, { signalId: existing.signalId }), existing);
  assert.equal(duplicateSignalRecord(state, { transportKey: existing.transportKey }), existing);
  assert.equal(duplicateSignalRecord(state, { semanticKey: existing.semanticKey }), existing);
  const updated = recordDuplicateOccurrence(state, existing, new Date(NOW + 20).toISOString(), NOW + 20);
  assert.equal(updated.records[0].occurrenceCount, 2);
  assert.equal(updated.records[0].actionState, "pending");
});

test("action results update the same receipt instead of creating a second purchase event", () => {
  const state = appendSignalRecord(defaultSignalJournal(), record(), NOW + 10);
  const updated = updateSignalRecord(state, "signal-1", {
    actionState: "opened",
    timing: { ...state.records[0].timing, actionStartedAt: new Date(NOW + 20).toISOString() }
  }, NOW + 20);
  assert.equal(updated.records.length, 1);
  assert.equal(updated.records[0].actionState, "opened");
  assert.equal(updated.records[0].timing.actionStartedAt, new Date(NOW + 20).toISOString());
});

test("the audit journal is bounded independently from the 100-card UI inbox", () => {
  const state = normalizeSignalJournal({
    records: Array.from({ length: MAX_SIGNAL_RECORDS + 20 }, (_value, index) => record(index + 1))
  }, NOW + MAX_SIGNAL_RECORDS + 20);
  assert.equal(state.records.length, MAX_SIGNAL_RECORDS);
  assert.equal(state.records[0].signalId, `signal-${MAX_SIGNAL_RECORDS + 20}`);
});
