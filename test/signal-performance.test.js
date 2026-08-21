"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const test = require("node:test");

const { defaultSignalJournal, duplicateSemanticRecord, duplicateSignalRecord } = require("../lib/signal-journal");
const {
  parseTrackalackerNotification,
  semanticDedupeKey,
  transportDedupeKey
} = require("../lib/trackalacker-notification");
const { buildTrackalackerSignalIndex, resolveTrackalackerSignal } = require("../lib/trackalacker-signal-resolver");
const { processTrackalackerSignal } = require("../lib/trackalacker-signal-service");

const SIGNAL_COUNT = 120;
const BASE_TIME = Date.parse("2026-08-21T08:00:00.000Z");
const RETAILERS = ["walmart", "amazon", "target"];

function fixture() {
  const items = [];
  const products = [];
  for (let index = 0; index < SIGNAL_COUNT; index += 1) {
    const retailer = RETAILERS[index % RETAILERS.length];
    const sourceProductId = String(100_000 + index);
    const listingId = String(800_000 + index);
    const sku = retailer === "amazon"
      ? `B0${String(10_000_000 + index).slice(-8)}`
      : String(20_000_000 + index);
    const productId = `${retailer}:${sku}`;
    const title = `Signal regression product ${index}`;
    const productUrl = retailer === "amazon"
      ? `https://www.amazon.com/dp/${sku}`
      : retailer === "target"
        ? `https://www.target.com/p/item/-/A-${sku}`
        : `https://www.walmart.com/ip/${sku}`;
    items.push({
      id: `trackalacker:${sourceProductId}`,
      sourceProductId,
      sourceUrl: `https://www.trackalacker.com/products/showcase/${sourceProductId}`,
      title,
      stores: [{
        id: productId,
        retailer,
        sku,
        listingId,
        productUrl,
        historyUrl: `https://www.trackalacker.com/products/showcase/${sourceProductId}/listings/${listingId}/item`
      }]
    });
    products.push({
      id: productId,
      itemId: `trackalacker:${sourceProductId}`,
      retailer,
      sku,
      title,
      productUrl,
      maxPrice: 100,
      maxOrderTotal: 150,
      quantity: 1,
      action: "review",
      fulfillmentMode: "shipping",
      enabled: true,
      signalAutoOpen: true,
      signalEntry: "product",
      openAt: ""
    });
  }
  return {
    products,
    index: buildTrackalackerSignalIndex({ items }),
    settings: {
      products,
      trackalackerSignalBridgeEnabled: true,
      trackalackerSignalDeliveryPaused: false,
      trackalackerSignalDedupeWindowSeconds: 300,
      signalsEnabled: true,
      monitoringPaused: false,
      automationEnabled: false,
      automationRunId: "performance-run"
    }
  };
}

function envelope(index) {
  const retailer = RETAILERS[index % RETAILERS.length];
  const label = retailer[0].toUpperCase() + retailer.slice(1);
  const observedAt = new Date(BASE_TIME + index).toISOString();
  return {
    schemaVersion: 1,
    signalId: `windows:chrome:performance:${index}:20260821`,
    testSignal: false,
    source: {
      provider: "trackalacker",
      transport: "windows_chrome_notification",
      notificationId: `performance-${index}`,
      applicationName: "Google Chrome",
      applicationId: "Google.Chrome",
      domain: "trackalacker.com",
      createdAt: observedAt,
      receivedAt: new Date(BASE_TIME + index + 1).toISOString()
    },
    notification: {
      title: `IN STOCK at ${label}!`,
      body: `Signal regression product ${index}\nin stock for $49.${String(index % 100).padStart(2, "0")} (~ MSRP)\ntrackalacker.com`,
      textElements: []
    }
  };
}

function p95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

test("120 known signals meet parser, mapping, dedupe, and local mission-decision budgets", () => {
  const context = fixture();
  let journal = defaultSignalJournal();
  const parseTimes = [];
  const lookupTimes = [];
  const dedupeTimes = [];
  const requestTimes = [];

  for (let index = 0; index < SIGNAL_COUNT; index += 1) {
    const input = envelope(index);
    let started = performance.now();
    const parsed = parseTrackalackerNotification(input);
    parseTimes.push(performance.now() - started);

    started = performance.now();
    const resolution = resolveTrackalackerSignal(parsed, context.index, context.products);
    lookupTimes.push(performance.now() - started);
    assert.equal(resolution.state, "matched");

    started = performance.now();
    const transportKey = transportDedupeKey(parsed);
    const semanticKey = semanticDedupeKey(parsed, resolution.mapping, 300);
    assert.equal(duplicateSignalRecord(journal, { signalId: input.signalId, transportKey, semanticKey }), null);
    assert.equal(duplicateSemanticRecord(journal, {
      productId: resolution.mapping.productId,
      eventType: parsed.eventType,
      price: parsed.price,
      observedAt: parsed.observedAt
    }, 300), null);
    dedupeTimes.push(performance.now() - started);

    started = performance.now();
    const result = processTrackalackerSignal({
      envelope: input,
      idempotencyKey: input.signalId,
      journal,
      index: context.index,
      settings: context.settings,
      now: BASE_TIME + 1_000 + index,
      clock: () => BASE_TIME + 1_000 + index
    });
    requestTimes.push(performance.now() - started);
    assert.equal(result.shouldOpen, true);
    assert.equal(result.response.mission_matches, 1);
    assert.deepEqual(result.response.mission_ids, [context.products[index].id]);
    journal = result.journal;
  }

  assert.equal(journal.records.length, SIGNAL_COUNT);
  assert.ok(p95(parseTimes) < 100, `notification parse p95 was ${p95(parseTimes).toFixed(2)} ms`);
  assert.ok(p95(lookupTimes) < 50, `mapping lookup p95 was ${p95(lookupTimes).toFixed(2)} ms`);
  assert.ok(p95(dedupeTimes) < 25, `dedupe p95 was ${p95(dedupeTimes).toFixed(2)} ms`);
  assert.ok(p95(requestTimes) < 150, `local mission-decision p95 was ${p95(requestTimes).toFixed(2)} ms`);
});
