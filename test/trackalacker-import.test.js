"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  acceptTrackalackerCapture,
  acceptTrackalackerCaptureFromNormalizedState,
  beginTrackalackerImport,
  cancelTrackalackerImport,
  normalizeTrackalackerItem,
  normalizeTrackalackerState,
  planTrackalackerMissionImport,
  publicTrackalackerState,
  trackalackerPriceHistory
} = require("../lib/trackalacker-import");

const NOW = Date.parse("2026-08-20T20:00:00Z");
const PROFILE = {
  id: "custom:trackalacker-test",
  name: "Tracka test",
  settings: {
    quantity: 2,
    action: "review",
    fulfillmentMode: "shipping",
    alertLevel: "standard",
    signalAutoOpen: true,
    enabled: true
  }
};

function capturedItem() {
  return {
    sourceProductId: "12345",
    sourceUrl: "https://www.trackalacker.com/products/showcase/pokemon-box",
    title: "Pokemon Elite Trainer Box",
    imageUrl: "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg",
    displayPrice: 49.99,
    capturedAt: "2026-08-20T20:01:00Z",
    stores: [
      {
        retailer: "target",
        sku: "1010892076",
        listingId: "301",
        productUrl: "https://www.target.com/p/item/-/A-1010892076",
        historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-box/listings/301/pokemon-box",
        currentPrice: 59.99,
        expectedPrice: 49.99,
        priceConfidence: "history",
        historySamples: 8,
        historyObservedAt: "2026-08-20T19:00:00Z",
        priceHistory: [
          { observedAt: "2026-08-20T19:30:00Z", priceChangedAt: "2026-08-20T19:29:00Z", price: 189.99, status: "Price Surge", msrpCode: "price_surge", classification: "normal" },
          { observedAt: "2026-08-20T19:00:00Z", priceChangedAt: "2026-08-20T18:59:00Z", price: 44.99, status: "In Stock", msrpCode: "equal_to", classification: "normal" },
          { observedAt: "2026-08-19T19:00:00Z", price: 49.99, status: "Out of Stock", msrpCode: "equal_to", classification: "normal" },
          { observedAt: "2026-08-18T19:00:00Z", price: 49.99, status: "In Stock", msrpCode: "equal_to", classification: "normal" }
        ],
        priceHistorySummary: { latestPrice: 1, referencePrice: 1 },
        status: "Out of Stock"
      },
      {
        retailer: "walmart",
        sku: "20754418655",
        listingId: "302",
        productUrl: "https://www.walmart.com/ip/item/20754418655",
        historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-box/listings/302/pokemon-box",
        currentPrice: 189.99,
        expectedPrice: 49.99,
        priceConfidence: "product",
        historySamples: 0,
        priceHistory: [
          { observedAt: "2026-08-20T19:45:00Z", price: 189.99, status: "Price Surge", msrpCode: "price_surge", classification: "normal" }
        ],
        status: "Price Surge"
      }
    ],
    otherStores: [{
      store: "Best Buy",
      listingId: "303",
      historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-box/listings/303/pokemon-box"
    }]
  };
}

function stateWithCapture() {
  let state = beginTrackalackerImport(null, { id: "import-1", now: NOW });
  state = acceptTrackalackerCapture(state, {
    importId: "import-1",
    phase: "started",
    message: "Scanning"
  }, NOW + 100).state;
  state = acceptTrackalackerCapture(state, {
    importId: "import-1",
    phase: "product",
    item: capturedItem(),
    discovered: 1,
    processed: 1,
    captured: 1
  }, NOW + 1_000).state;
  return state;
}

function completedStateWithCapture() {
  const state = stateWithCapture();
  return acceptTrackalackerCapture(state, {
    importId: "import-1",
    phase: "complete",
    discovered: 1,
    processed: 1,
    captured: 1,
    message: "Captured 1 followed product."
  }, NOW + 2_000).state;
}

test("TrackaLacker captures are session-bound, bounded, normalized, and persisted without credentials", () => {
  const scanning = stateWithCapture();
  assert.equal(scanning.activeImport.state, "scanning");
  assert.equal(scanning.items.length, 0, "the last complete mapping snapshot remains active during a scan");
  assert.equal(scanning.stagingItems.length, 1);
  const state = completedStateWithCapture();
  assert.equal(state.activeImport.state, "complete");
  assert.equal(state.items.length, 1);
  assert.equal(state.stagingItems.length, 0);
  assert.equal(state.items[0].id, "trackalacker:12345");
  assert.equal(state.items[0].stores.length, 2);
  assert.equal(state.items[0].imageUrl, "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg");
  assert.equal(state.items[0].stores[0].expectedPrice, 44.99, "newest trustworthy row replaces the older captured estimate");
  assert.equal(state.items[0].stores[0].currentPrice, 189.99);
  assert.equal(state.items[0].stores[0].priceHistorySummary.latestClassification, "surge");
  assert.equal(state.items[0].stores[0].priceHistorySummary.lowestPrice, 44.99);
  assert.equal(state.items[0].stores[0].priceHistorySummary.highestPrice, 189.99);
  assert.equal(state.items[0].stores[0].priceHistorySummary.trend, "up");
  assert.equal(state.items[0].stores[1].priceConfidence, "product", "a surge-only history cannot become a trusted cap");
  assert.throws(() => acceptTrackalackerCapture(state, {
    importId: "wrong",
    phase: "product",
    item: capturedItem()
  }, NOW + 2_000), /currently accepting/);
  const restored = normalizeTrackalackerState(JSON.parse(JSON.stringify(state)), NOW + 3_000);
  assert.equal(restored.items[0].stores[0].productUrl, "https://www.target.com/p/item/-/A-1010892076");
  assert.equal(JSON.stringify(restored).includes("password"), false);
  const publicState = publicTrackalackerState(restored);
  assert.equal("priceHistory" in publicState.items[0].stores[0], false, "large histories stay out of regular snapshots");
  assert.equal(publicState.items[0].stores[0].priceHistorySummary.sampleCount, 4);
  const history = trackalackerPriceHistory(restored, "trackalacker:12345", "target", "301");
  assert.equal(history.entries.length, 4);
  assert.equal(history.entries[0].price, 189.99);
  assert.equal(history.summary.referencePrice, 44.99);
  assert.throws(() => trackalackerPriceHistory(restored, "trackalacker:12345", "target", "999"), /no longer available/);

  const mismatched = capturedItem();
  mismatched.stores[0].historyUrl = "https://www.trackalacker.com/products/showcase/other-product/listings/301/other-product";
  assert.equal(normalizeTrackalackerItem(mismatched).stores.some((store) => store.retailer === "target"), false);
});

test("mission planning groups retailer toggles under the product and enables only store-specific trusted history", () => {
  const state = completedStateWithCapture();
  const plan = planTrackalackerMissionImport(state, [{
    productId: "trackalacker:12345",
    retailers: ["target", "walmart"]
  }], [], 100, {
    profile: PROFILE,
    storeOrderAllowances: { target: 5, walmart: 7, amazon: 5 },
    orderTaxPercent: 10
  });
  assert.deepEqual(plan.summary, {
    selectedItems: 1,
    selectedStores: 2,
    importedItems: 1,
    importedStores: 2,
    ready: 1,
    needsReview: 1,
    duplicates: 0,
    missing: 0,
    overCapacity: 0
  });
  assert.equal(new Set(plan.additions.map((mission) => mission.itemId)).size, 1);
  assert.equal(plan.additions[0].itemId, "trackalacker:12345");
  assert.equal(plan.additions[0].enabled, true);
  assert.equal(plan.additions[0].maxPrice, 44.99);
  assert.equal(plan.additions[0].maxOrderTotal, 103.98);
  assert.equal(plan.additions[0].sourceUrl, "https://www.trackalacker.com/products/showcase/pokemon-box");
  assert.equal(plan.additions[0].imageUrl, "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg");
  assert.equal(plan.additions[0].sourcePriceSummary.latestPrice, 189.99);
  assert.equal(plan.additions[0].sourcePriceSummary.referencePrice, 44.99);
  assert.equal(plan.additions[0].expectedPriceObservedAt, "2026-08-20T18:59:00.000Z");
  assert.equal(plan.additions[1].enabled, false, "product-level price fallback requires review");
  assert.equal(plan.additions[1].expectedPriceConfidence, "product");
});

test("duplicate routes and capacity are reported without splitting an item by store", () => {
  const state = completedStateWithCapture();
  const existing = [{ id: "target:1010892076", itemId: "legacy:item", retailer: "target" }];
  const plan = planTrackalackerMissionImport(state, [{
    productId: "trackalacker:12345",
    retailers: ["target", "walmart"]
  }], existing, 1, { profile: PROFILE });
  assert.equal(plan.additions.length, 0);
  assert.equal(plan.summary.duplicates, 1);
  assert.equal(plan.summary.overCapacity, 1);
});

test("an active scan can be cancelled and no longer accepts browser captures", () => {
  const state = cancelTrackalackerImport(beginTrackalackerImport(null, { id: "import-1", now: NOW }), NOW + 1_000);
  assert.equal(state.activeImport.state, "cancelled");
  assert.throws(() => acceptTrackalackerCapture(state, {
    importId: "import-1",
    phase: "started"
  }, NOW + 2_000), /currently accepting/);
});

test("failed and cancelled rescans preserve the last completed mapping snapshot", () => {
  const completed = completedStateWithCapture();
  let rescanning = beginTrackalackerImport(completed, { id: "import-2", now: NOW + 3_000 });
  const replacement = capturedItem();
  replacement.sourceProductId = "67890";
  replacement.sourceUrl = "https://www.trackalacker.com/products/showcase/replacement-box";
  replacement.stores = [];
  rescanning = acceptTrackalackerCapture(rescanning, {
    importId: "import-2",
    phase: "product",
    item: replacement
  }, NOW + 4_000).state;
  assert.equal(rescanning.items[0].id, "trackalacker:12345");
  assert.equal(rescanning.stagingItems[0].id, "trackalacker:67890");

  const failed = acceptTrackalackerCapture(rescanning, {
    importId: "import-2",
    phase: "error",
    error: "Capture failed"
  }, NOW + 5_000).state;
  assert.equal(failed.items[0].id, "trackalacker:12345");
  assert.equal(failed.stagingItems.length, 0);

  const cancelled = cancelTrackalackerImport(
    beginTrackalackerImport(failed, { id: "import-3", now: NOW + 6_000 }),
    NOW + 7_000
  );
  assert.equal(cancelled.items[0].id, "trackalacker:12345");
  assert.equal(cancelled.stagingItems.length, 0);
});

test("the normalized capture path validates new items without reprocessing prior histories", () => {
  const initial = beginTrackalackerImport(null, { id: "import-fast", now: NOW });
  const result = acceptTrackalackerCaptureFromNormalizedState(initial, {
    importId: "import-fast",
    phase: "product",
    item: capturedItem(),
    processed: 1,
    captured: 1
  }, NOW + 1_000);
  assert.equal(result.accepted, 1);
  assert.equal(result.state.stagingItems[0].stores[0].priceHistory.length, 4);
  assert.throws(() => acceptTrackalackerCaptureFromNormalizedState({ version: 1, items: [] }, {
    importId: "import-fast",
    phase: "progress"
  }, NOW + 2_000), /state is invalid/);
});
