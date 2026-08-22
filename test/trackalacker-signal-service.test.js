"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { defaultSignalJournal, updateSignalRecord } = require("../lib/signal-journal");
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

test("ordered signal strategies record the winning rule and honor notification-only actions", () => {
  const result = process(envelope(), {
    settings: {
      signalStrategies: [{
        id: "signal-strategy:notify",
        name: "MSRP notification",
        enabled: true,
        priceBand: "msrp",
        stores: ["walmart"],
        action: "notify",
        quantity: "max",
        includeKeywords: "pokemon + \"booster display box\"",
        excludeKeywords: "used | refurbished"
      }]
    }
  });
  assert.equal(result.shouldOpen, false);
  assert.equal(result.route.state, "notified");
  assert.equal(result.response.action, "notified");
  assert.equal(result.record.strategyId, "signal-strategy:notify");
  assert.equal(result.record.strategyName, "MSRP notification");
  assert.equal(result.record.strategyAction, "notify");
  assert.equal(result.record.strategyQuantity, "max");
});

test("a configured strategy set rejects a mission when no rule matches", () => {
  const result = process(envelope(), {
    settings: {
      signalStrategies: [{
        id: "signal-strategy:amazon-only",
        name: "Amazon only",
        enabled: true,
        priceBand: "any",
        stores: ["amazon"],
        action: "add_to_cart",
        quantity: 1,
        includeKeywords: "",
        excludeKeywords: ""
      }]
    }
  });
  assert.equal(result.shouldOpen, false);
  assert.equal(result.route.reason, "no-strategy");
  assert.equal(result.response.action, "no_matching_strategy");
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

test("a live sentence-style push strips the event suffix before exact matching", () => {
  const input = envelope({
    signalId: "push:trackalacker:live-sentence",
    source: {
      transport: "chrome_extension_web_push",
      notificationId: "push:trackalacker:live-sentence",
      applicationName: "CartCollect Chrome extension",
      applicationId: "kmpoonjaidgnldeobaaopfhfhlalclhd"
    },
    notification: {
      body: "Pokemon Perfect Order Booster Display Box is in stock at Walmart\nin stock for $169.99 (~ MSRP)"
    }
  });
  const result = process(input, {
    validation: { allowedTransports: ["chrome_extension_web_push"] }
  });
  assert.equal(result.parsed.productNameRaw, "Pokemon Perfect Order Booster Display Box");
  assert.equal(result.resolution.matchMethod, "exact-title-retailer");
  assert.equal(result.shouldOpen, true);
});

test("a sanitized product ID routes a generic live push without retaining its URL", () => {
  const input = envelope({
    signalId: "push:trackalacker:live-identity",
    source: {
      transport: "chrome_extension_web_push",
      notificationId: "push:trackalacker:live-identity",
      applicationName: "CartCollect Chrome extension",
      applicationId: "kmpoonjaidgnldeobaaopfhfhlalclhd"
    },
    notification: {
      body: "in stock for $169.99 (~ MSRP)",
      sourceProductId: "12345"
    }
  });
  const result = process(input, {
    validation: { allowedTransports: ["chrome_extension_web_push"] }
  });
  assert.equal(result.parsed.productNameRaw, "");
  assert.equal(result.resolution.matchMethod, "source-product-retailer");
  assert.equal(result.record.sourceProductId, "12345");
  assert.equal(result.record.productNameRaw, "Pokemon Perfect Order Booster Display Box");
  assert.match(result.resolution.canonicalSignal.keywordText, /Pokemon Perfect Order Booster Display Box/);
  assert.equal(result.shouldOpen, true);
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

test("a new transport may re-signal after the prior live offer was cancelled", () => {
  const first = process();
  const cancelled = updateSignalRecord(first.journal, first.record.signalId, {
    missionDecision: "offer_mismatch",
    actionState: "cancelled",
    reason: "The live offer changed before Add to cart."
  }, NOW + 50);
  const secondEnvelope = envelope({
    signalId: "windows:chrome:783924:20260821",
    source: {
      notificationId: "windows-783924",
      receivedAt: "2026-08-21T06:41:31.400Z"
    }
  });
  const second = processTrackalackerSignal({
    envelope: secondEnvelope,
    idempotencyKey: secondEnvelope.signalId,
    journal: cancelled,
    index: fixture().index,
    settings: fixture().settings,
    now: NOW + 200,
    clock: () => NOW + 200
  });
  assert.equal(second.duplicate, false);
  assert.equal(second.shouldOpen, true);
  assert.equal(second.response.action, "queued");
  assert.equal(second.journal.records.length, 2);

  const exactReplay = processTrackalackerSignal({
    envelope: secondEnvelope,
    idempotencyKey: secondEnvelope.signalId,
    journal: second.journal,
    index: fixture().index,
    settings: fixture().settings,
    now: NOW + 300,
    clock: () => NOW + 300
  });
  assert.equal(exactReplay.duplicate, true);
  assert.equal(exactReplay.shouldOpen, false);
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
