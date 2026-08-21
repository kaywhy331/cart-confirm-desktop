"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { defaultSignalJournal } = require("../lib/signal-journal");
const { buildTrackalackerSignalIndex } = require("../lib/trackalacker-signal-resolver");
const { processTrackalackerSignal } = require("../lib/trackalacker-signal-service");

const OBSERVED = "2026-08-21T06:41:31.100Z";
const NOW = Date.parse("2026-08-21T06:41:31.200Z");

function envelope(overrides = {}) {
  const sourceOverrides = overrides.source || {};
  const notificationOverrides = overrides.notification || {};
  return {
    schemaVersion: 1,
    signalId: overrides.signalId || "windows:chrome:783922:20260821",
    testSignal: overrides.testSignal === true,
    source: {
      provider: "trackalacker",
      transport: overrides.testSignal ? "synthetic_replay" : "windows_chrome_notification",
      notificationId: "windows-783922",
      applicationName: "Google Chrome",
      applicationId: "Google.Chrome",
      domain: "www.trackalacker.com",
      createdAt: OBSERVED,
      receivedAt: "2026-08-21T06:41:31.184Z",
      ...sourceOverrides
    },
    notification: {
      title: "IN STOCK at Walmart!",
      body: "Pokemon Perfect Order Booster Display Box\nin stock for $169.99 (~ MSRP)\nwww.trackalacker.com",
      textElements: [],
      ...notificationOverrides
    }
  };
}

function fixture() {
  const product = {
    id: "walmart:19376602103",
    itemId: "trackalacker:12345",
    retailer: "walmart",
    sku: "19376602103",
    title: "Pokemon Perfect Order Booster Display Box",
    productUrl: "https://www.walmart.com/ip/19376602103",
    maxPrice: 175,
    maxOrderTotal: 220,
    quantity: 1,
    action: "review",
    fulfillmentMode: "shipping",
    enabled: true,
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: ""
  };
  const state = {
    items: [{
      id: "trackalacker:12345",
      sourceProductId: "12345",
      sourceUrl: "https://www.trackalacker.com/products/showcase/12345",
      title: product.title,
      stores: [{
        id: product.id,
        retailer: "walmart",
        sku: product.sku,
        listingId: "287632",
        productUrl: product.productUrl,
        historyUrl: "https://www.trackalacker.com/products/showcase/12345/listings/287632/item"
      }]
    }]
  };
  return {
    product,
    index: buildTrackalackerSignalIndex(state),
    settings: {
      products: [product],
      trackalackerSignalBridgeEnabled: true,
      trackalackerSignalDeliveryPaused: false,
      trackalackerSignalDedupeWindowSeconds: 300,
      signalsEnabled: true,
      monitoringPaused: false,
      automationEnabled: false,
      automationRunId: "run-1"
    }
  };
}

function process(input = envelope(), changes = {}) {
  const base = fixture();
  return processTrackalackerSignal({
    ...changes,
    envelope: input,
    idempotencyKey: input.signalId,
    journal: defaultSignalJournal(),
    index: base.index,
    settings: { ...base.settings, ...(changes.settings || {}) },
    now: NOW,
    clock: () => NOW
  });
}

test("a known under-cap signal is durably queued before its store action begins", () => {
  const result = process();
  assert.equal(result.shouldOpen, true);
  assert.equal(result.response.action, "queued");
  assert.deepEqual(result.response.mission_ids, ["walmart:19376602103"]);
  assert.equal(result.record.actionState, "pending");
  assert.equal(result.record.missionDecision, "queued");
  assert.equal(result.record.sourceListingId, "287632");
  assert.equal(result.record.timing.missionEvaluatedAt, new Date(NOW).toISOString());
});

test("an authenticated extension Web Push signal enters the same mission pipeline", () => {
  const input = envelope({
    signalId: "push:trackalacker:12345678",
    source: {
      transport: "chrome_extension_web_push",
      notificationId: "push:trackalacker:12345678",
      applicationName: "CartCollect Chrome extension",
      applicationId: "kmpoonjaidgnldeobaaopfhfhlalclhd"
    }
  });
  const result = process(input, {
    validation: { allowedTransports: ["chrome_extension_web_push"] }
  });
  assert.equal(result.shouldOpen, true);
  assert.equal(result.record.transport, "chrome_extension_web_push");
  assert.equal(result.response.action, "queued");
});

test("mission rejection is an acknowledged bridge delivery, not an infrastructure error", () => {
  const result = process(envelope({
    notification: { body: "Pokemon Perfect Order Booster Display Box\nin stock for $199.99 (Above MSRP)\nwww.trackalacker.com" }
  }));
  assert.equal(result.shouldOpen, false);
  assert.equal(result.response.accepted, true);
  assert.equal(result.response.mission_matches, 1);
  assert.equal(result.response.action, "price_exceeds_limit");
});

test("a pre-sync mapping is never reported as a configured mission", () => {
  const mappedOnly = process(envelope(), {
    settings: {
      products: [],
      trackalackerSignalBridgeEnabled: false
    }
  });
  assert.equal(mappedOnly.response.action, "bridge_disabled");
  assert.equal(mappedOnly.response.mission_matches, 0);
  assert.deepEqual(mappedOnly.response.mission_ids, []);

  const duplicate = processTrackalackerSignal({
    envelope: envelope(),
    idempotencyKey: envelope().signalId,
    journal: mappedOnly.journal,
    index: fixture().index,
    settings: {
      ...fixture().settings,
      products: [],
      trackalackerSignalBridgeEnabled: false
    },
    now: NOW + 100,
    clock: () => NOW + 100
  });
  assert.equal(duplicate.response.action, "duplicate_signal");
  assert.equal(duplicate.response.mission_matches, 0);
  assert.deepEqual(duplicate.response.mission_ids, []);
});

test("duplicates increment one durable receipt and never queue a second action", () => {
  const first = process();
  const secondEnvelope = envelope({
    signalId: "windows:chrome:783923:20260821",
    source: { notificationId: "windows-783923", receivedAt: "2026-08-21T06:41:31.300Z" }
  });
  const second = processTrackalackerSignal({
    envelope: secondEnvelope,
    idempotencyKey: secondEnvelope.signalId,
    journal: first.journal,
    index: fixture().index,
    settings: fixture().settings,
    now: NOW + 100,
    clock: () => NOW + 100
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.shouldOpen, false);
  assert.equal(second.response.action, "duplicate_signal");
  assert.equal(second.journal.records.length, 1);
  assert.equal(second.record.occurrenceCount, 2);
});

test("unknown products, disabled delivery, and synthetic replay all fail closed", () => {
  const unknown = process(envelope({
    notification: { body: "Pokemon Perfect Order Booster Bundle\nin stock for $169.99 (~ MSRP)\nwww.trackalacker.com" }
  }));
  assert.equal(unknown.response.action, "unresolved_product");
  assert.equal(unknown.shouldOpen, false);

  const paused = process(envelope(), { settings: { trackalackerSignalDeliveryPaused: true } });
  assert.equal(paused.response.action, "delivery_paused");
  assert.equal(paused.shouldOpen, false);

  const replay = process(envelope({
    signalId: "synthetic:trackalacker:783922",
    testSignal: true,
    source: { notificationId: "synthetic-783922" }
  }));
  assert.equal(replay.response.action, "test_signal");
  assert.equal(replay.shouldOpen, false);
});

test("the local contract rejects a missing idempotency key", () => {
  const base = fixture();
  assert.throws(() => processTrackalackerSignal({
    envelope: envelope(),
    journal: defaultSignalJournal(),
    index: base.index,
    settings: base.settings,
    now: NOW
  }), /Idempotency-Key/);
});
