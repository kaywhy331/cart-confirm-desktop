"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseTrackalackerNotification,
  semanticDedupeKey,
  transportDedupeKey,
  validateTrackalackerSignalEnvelope
} = require("../lib/trackalacker-notification");
const {
  buildTrackalackerSignalIndex,
  resolveTrackalackerSignal
} = require("../lib/trackalacker-signal-resolver");

function envelope(overrides = {}) {
  return {
    schemaVersion: 1,
    signalId: "windows:chrome:783922:20260821",
    testSignal: false,
    source: {
      provider: "trackalacker",
      transport: "windows_chrome_notification",
      notificationId: "windows-783922",
      applicationName: "Google Chrome",
      applicationId: "Google.Chrome",
      domain: "www.trackalacker.com",
      createdAt: "2026-08-21T06:41:31.100Z",
      receivedAt: "2026-08-21T06:41:31.184Z"
    },
    notification: {
      title: "IN STOCK at Walmart!",
      body: "Pokemon Perfect Order Booster Display Box\nin stock for $169.99 (~ MSRP)\nwww.trackalacker.com",
      textElements: []
    },
    ...overrides
  };
}

function mappingState(duplicate = false) {
  const item = (id, sku, title = "Pokemon Perfect Order Booster Display Box") => ({
    id: `trackalacker:${id}`,
    sourceProductId: id,
    sourceUrl: `https://www.trackalacker.com/products/showcase/${id}`,
    title,
    imageUrl: "",
    stores: [{
      id: `walmart:${sku}`,
      retailer: "walmart",
      sku,
      listingId: `${id}9`,
      productUrl: `https://www.walmart.com/ip/${sku}`,
      historyUrl: `https://www.trackalacker.com/products/showcase/${id}/listings/${id}9/walmart`
    }]
  });
  return { items: duplicate ? [item("12345", "19376602103"), item("67890", "19376602104")] : [item("12345", "19376602103")] };
}

test("TrackaLacker Walmart, Amazon, and Target notification formats parse deterministically", () => {
  const walmart = parseTrackalackerNotification(envelope());
  assert.equal(walmart.eventType, "in_stock");
  assert.equal(walmart.retailer, "walmart");
  assert.equal(walmart.productNameRaw, "Pokemon Perfect Order Booster Display Box");
  assert.equal(walmart.price, 169.99);
  assert.equal(walmart.msrpStatus, "near_msrp");
  assert.equal(walmart.actionable, true);

  const amazon = parseTrackalackerNotification(envelope({
    notification: {
      title: "IN STOCK at Amazon!",
      body: "Pokemon Perfect Order Booster Display Box\nin stock for $172.57 (Above MSRP)\ntrackalacker.com",
      textElements: []
    }
  }));
  assert.equal(amazon.retailer, "amazon");
  assert.equal(amazon.price, 172.57);
  assert.equal(amazon.msrpStatus, "above_msrp");

  const target = parseTrackalackerNotification(envelope({
    notification: {
      title: "PREORDER AVAILABLE at Target!",
      body: "Pokemon Perfect Order Elite Trainer Box\npreorder available for $59.99 (At MSRP)\nwww.trackalacker.com",
      textElements: []
    }
  }));
  assert.equal(target.eventType, "preorder");
  assert.equal(target.retailer, "target");
  assert.equal(target.price, 59.99);
  assert.equal(target.msrpStatus, "at_msrp");
});

test("the bridge rejects unrelated applications, domains, transports, and malformed envelopes", () => {
  assert.throws(() => validateTrackalackerSignalEnvelope(envelope({
    source: { ...envelope().source, applicationName: "Microsoft Teams", applicationId: "Teams" }
  })), /Google Chrome/);
  assert.throws(() => validateTrackalackerSignalEnvelope(envelope({
    source: { ...envelope().source, applicationName: "Evil Google Chrome Helper", applicationId: "Malware.NotChrome" }
  })), /Google Chrome/);
  assert.throws(() => validateTrackalackerSignalEnvelope(envelope({
    source: { ...envelope().source, domain: "eviltrackalacker.com" }
  })), /trackalacker\.com/);
  assert.throws(() => validateTrackalackerSignalEnvelope(envelope({
    source: { ...envelope().source, transport: "retailer_poll" }
  })), /transport/);
  const malformed = parseTrackalackerNotification(envelope({
    notification: { title: "A notification", body: "without a known format", textElements: [] }
  }));
  assert.equal(malformed.parseState, "malformed");
  assert.equal(malformed.actionable, false);
});

test("real TrackaLacker test notifications are parsed but never actionable", () => {
  const parsed = parseTrackalackerNotification(envelope({
    notification: {
      title: "IN STOCK at Walmart!",
      body: "Pokemon Perfect Order Booster Display Box\nin stock for $169.99 (~ MSRP)\nThis is a test notification\ntrackalacker.com",
      textElements: []
    }
  }));
  assert.equal(parsed.testNotification, true);
  assert.equal(parsed.actionable, false);
});

test("pre-synced listings resolve by exact title and retailer without fuzzy variant guessing", () => {
  const parsed = parseTrackalackerNotification(envelope());
  const mission = { id: "walmart:19376602103", retailer: "walmart", sku: "19376602103", enabled: true };
  const index = buildTrackalackerSignalIndex(mappingState());
  const resolved = resolveTrackalackerSignal(parsed, index, [mission]);
  assert.equal(resolved.state, "matched");
  assert.equal(resolved.matchMethod, "exact-title-retailer");
  assert.equal(resolved.mapping.itemId, "trackalacker:12345");
  assert.equal(resolved.canonicalSignal.productId, mission.id);
  assert.equal(resolved.mission, mission);

  const variant = parseTrackalackerNotification(envelope({
    notification: {
      title: "IN STOCK at Walmart!",
      body: "Pokemon Perfect Order Booster Bundle\nin stock for $169.99 (~ MSRP)\ntrackalacker.com",
      textElements: []
    }
  }));
  assert.equal(resolveTrackalackerSignal(variant, index, [mission]).state, "unresolved");
});

test("approved aliases are exact, retailer-bound, and ambiguity fails closed", () => {
  const parsed = parseTrackalackerNotification(envelope({
    notification: {
      title: "RESTOCK at Walmart!",
      body: "Perfect Order BB\nin stock for $169.99 (~ MSRP)\ntrackalacker.com",
      textElements: []
    }
  }));
  const aliases = [{ sourceProductId: "12345", retailer: "walmart", alias: "Perfect Order BB" }];
  const resolved = resolveTrackalackerSignal(parsed, buildTrackalackerSignalIndex(mappingState(), aliases));
  assert.equal(resolved.state, "matched");
  assert.equal(resolved.matchMethod, "approved-alias-retailer");

  const ambiguous = resolveTrackalackerSignal(
    parseTrackalackerNotification(envelope()),
    buildTrackalackerSignalIndex(mappingState(true))
  );
  assert.equal(ambiguous.state, "ambiguous");
  assert.equal(ambiguous.candidates.length, 2);
});

test("transport and semantic dedupe keys are stable while material price changes differ", () => {
  const parsed = parseTrackalackerNotification(envelope());
  const resolution = resolveTrackalackerSignal(parsed, buildTrackalackerSignalIndex(mappingState()));
  assert.equal(transportDedupeKey(parsed), transportDedupeKey(parsed));
  assert.equal(semanticDedupeKey(parsed, resolution.mapping), semanticDedupeKey(parsed, resolution.mapping));
  const changed = parseTrackalackerNotification(envelope({
    signalId: "windows:chrome:783923:20260821",
    source: { ...envelope().source, notificationId: "windows-783923" },
    notification: {
      title: "IN STOCK at Walmart!",
      body: "Pokemon Perfect Order Booster Display Box\nin stock for $170.99 (~ MSRP)\ntrackalacker.com",
      textElements: []
    }
  }));
  assert.notEqual(semanticDedupeKey(parsed, resolution.mapping), semanticDedupeKey(changed, resolution.mapping));
});
