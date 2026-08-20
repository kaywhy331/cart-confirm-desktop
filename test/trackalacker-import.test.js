"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  acceptTrackalackerCapture,
  beginTrackalackerImport,
  cancelTrackalackerImport,
  normalizeTrackalackerItem,
  normalizeTrackalackerState,
  planTrackalackerMissionImport
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

test("TrackaLacker captures are session-bound, bounded, normalized, and persisted without credentials", () => {
  const state = stateWithCapture();
  assert.equal(state.activeImport.state, "scanning");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].id, "trackalacker:12345");
  assert.equal(state.items[0].stores.length, 2);
  assert.equal(state.items[0].imageUrl, "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg");
  assert.throws(() => acceptTrackalackerCapture(state, {
    importId: "wrong",
    phase: "product",
    item: capturedItem()
  }, NOW + 2_000), /active scan/);
  const restored = normalizeTrackalackerState(JSON.parse(JSON.stringify(state)), NOW + 3_000);
  assert.equal(restored.items[0].stores[0].productUrl, "https://www.target.com/p/item/-/A-1010892076");
  assert.equal(JSON.stringify(restored).includes("password"), false);

  const mismatched = capturedItem();
  mismatched.stores[0].historyUrl = "https://www.trackalacker.com/products/showcase/other-product/listings/301/other-product";
  assert.equal(normalizeTrackalackerItem(mismatched).stores.some((store) => store.retailer === "target"), false);
});

test("mission planning groups retailer toggles under the product and enables only store-specific trusted history", () => {
  const state = stateWithCapture();
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
  assert.equal(plan.additions[0].maxPrice, 49.99);
  assert.equal(plan.additions[0].maxOrderTotal, 114.98);
  assert.equal(plan.additions[0].sourceUrl, "https://www.trackalacker.com/products/showcase/pokemon-box");
  assert.equal(plan.additions[0].imageUrl, "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg");
  assert.equal(plan.additions[1].enabled, false, "product-level price fallback requires review");
  assert.equal(plan.additions[1].expectedPriceConfidence, "product");
});

test("duplicate routes and capacity are reported without splitting an item by store", () => {
  const state = stateWithCapture();
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
