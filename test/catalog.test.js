"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  acceptCatalogResults,
  beginCatalogSearch,
  normalizeCatalogState,
  officialSearchUrl,
  planCatalogMissionImport,
  planWalmartPrepCandidates
} = require("../lib/catalog");
const { MAX_PRODUCTS } = require("../lib/core");

const NOW = Date.parse("2026-08-11T12:00:00Z");

function activeState(filters = {}) {
  return beginCatalogSearch(null, {
    query: "pokemon cards",
    retailers: ["target", "amazon"],
    filters
  }, { id: "search-1", now: NOW });
}

test("catalog searches are bounded, filtered, and tied to an active local search", () => {
  const state = activeState({ includeWords: "pokemon", excludeWords: "digital", maxPrice: "50" });
  assert.equal(officialSearchUrl("target", state.activeSearch.query), "https://www.target.com/s?searchTerm=pokemon%20cards");
  const result = acceptCatalogResults(state, {
    searchId: "search-1",
    retailer: "target",
    query: "pokemon cards",
    results: [
      { retailer: "target", sku: "1011209279", title: "Pokémon Booster Bundle", productUrl: "https://www.target.com/p/booster/-/A-1011209279?ref=x", price: 34.99 },
      { retailer: "target", sku: "1008581387", title: "Pokémon Digital Code", productUrl: "https://www.target.com/p/code/-/A-1008581387", price: 9.99 },
      { retailer: "target", sku: "95163305", title: "Pokémon Premium Box", productUrl: "https://www.target.com/p/box/-/A-95163305", price: 59.99 },
      { retailer: "walmart", sku: "95163305", title: "Pokémon mismatch", productUrl: "https://www.walmart.com/ip/95163305", price: 10 }
    ]
  }, NOW + 1_000);
  assert.equal(result.accepted, 1);
  assert.deepEqual(result.state.items[0], {
    id: "target:1011209279",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Booster Bundle",
    productUrl: "https://www.target.com/p/booster/-/A-1011209279",
    price: 34.99,
    observedAt: "2026-08-11T12:00:01.000Z",
    searchId: "search-1",
    query: "pokemon cards"
  });
  assert.equal(result.state.activeSearch.status.target.state, "captured");
  assert.throws(() => acceptCatalogResults(state, {
    searchId: "wrong-search",
    retailer: "target",
    query: "pokemon cards",
    results: []
  }, NOW + 1_000), /active catalog search/);
});

test("the desktop trust boundary accepts at most 20 results from one retailer capture", () => {
  const results = Array.from({ length: 25 }, (_, index) => {
    const sku = String(1011209000 + index);
    return {
      retailer: "target",
      sku,
      title: `Pokémon Card ${index}`,
      productUrl: `https://www.target.com/p/card-${index}/-/A-${sku}`,
      price: 10
    };
  });
  const accepted = acceptCatalogResults(activeState(), {
    searchId: "search-1",
    retailer: "target",
    query: "pokemon cards",
    results
  }, NOW + 1_000);
  assert.equal(accepted.accepted, 20);
  assert.equal(accepted.state.items.length, 20);
  assert.equal(accepted.state.activeSearch.status.target.count, 20);
});

test("catalog imports create only disabled watch-only zero-dollar missions and honor duplicates/capacity", () => {
  const accepted = acceptCatalogResults(activeState(), {
    searchId: "search-1",
    retailer: "amazon",
    query: "pokemon cards",
    results: [
      { retailer: "amazon", sku: "B0ABC12345", title: "Pokémon Trainer Box", productUrl: "https://www.amazon.com/name/dp/B0ABC12345?tag=x", price: 49.99 },
      { retailer: "amazon", sku: "B0XYZ67890", title: "Pokémon Booster Box", productUrl: "https://www.amazon.com/dp/B0XYZ67890", price: null }
    ]
  }, NOW + 1_000).state;
  const existing = [{ id: "amazon:B0ABC12345" }];
  const plan = planCatalogMissionImport(accepted, ["amazon:B0ABC12345", "amazon:B0XYZ67890", "missing"], existing, 2);
  assert.deepEqual(plan.summary, { selected: 3, imported: 1, ready: 0, needsPrice: 1, duplicates: 1, missing: 1, overCapacity: 0 });
  assert.equal(plan.additions[0].id, "amazon:B0XYZ67890");
  assert.equal(plan.additions[0].enabled, false);
  assert.equal(plan.additions[0].action, "watch");
  assert.equal(plan.additions[0].maxPrice, 0);
  assert.equal(plan.additions[0].maxOrderTotal, 0);
});

test("persisted catalog data is revalidated and expired searches are not restored", () => {
  const state = activeState();
  state.items = [{
    id: "target:1011209279",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Box",
    productUrl: "https://www.target.com/p/box/-/A-1011209279?tracking=yes",
    price: 34.99,
    observedAt: "2026-08-11T12:00:00Z",
    searchId: "search-1",
    query: "pokemon cards"
  }];
  const restored = normalizeCatalogState(state, NOW + 11 * 60_000);
  assert.equal(restored.activeSearch, null);
  assert.equal(restored.items[0].productUrl, "https://www.target.com/p/box/-/A-1011209279");
});

test("catalog import reports every selection beyond the 100-mission capacity", () => {
  const state = activeState();
  state.items = Array.from({ length: MAX_PRODUCTS + 2 }, (_, index) => {
    const sku = String(1011209000 + index);
    return {
      id: `target:${sku}`,
      retailer: "target",
      sku,
      title: `Card ${index}`,
      productUrl: `https://www.target.com/p/card-${index}/-/A-${sku}`,
      price: 10,
      observedAt: new Date(NOW).toISOString(),
      searchId: "search-1",
      query: "pokemon cards"
    };
  });
  const plan = planCatalogMissionImport(state, state.items.map((item) => item.id));
  assert.equal(plan.additions.length, MAX_PRODUCTS);
  assert.deepEqual(plan.summary, {
    selected: MAX_PRODUCTS + 2,
    imported: MAX_PRODUCTS,
    ready: 0,
    needsPrice: MAX_PRODUCTS,
    duplicates: 0,
    missing: 0,
    overCapacity: 2
  });
});

test("Walmart prep candidates require an exact catalog item, approved profile price, and future drop", () => {
  const state = beginCatalogSearch(null, {
    query: "pokemon cards",
    retailers: ["walmart"]
  }, { id: "search-1", now: NOW });
  const accepted = acceptCatalogResults(state, {
    searchId: "search-1",
    retailer: "walmart",
    query: "pokemon cards",
    results: [{
      retailer: "walmart",
      sku: "123456789",
      title: "Pokémon Elite Trainer Box",
      productUrl: "https://www.walmart.com/ip/pokemon-elite-trainer-box/123456789",
      price: 999
    }]
  }, NOW + 1_000).state;
  const { BUILT_IN_ITEM_PROFILES, normalizeMsrpRecord } = require("../lib/item-defaults");
  const profile = BUILT_IN_ITEM_PROFILES[1];
  const msrpCatalog = [{
    id: "msrp:test-pokemon-etb",
    productLine: "Pokémon",
    productType: "Pokémon Elite Trainer Box",
    matchTerms: ["elite trainer box"],
    excludeTerms: [],
    prices: { target: null, walmart: 49.99, amazon: null },
    sourceLabel: "Operator-approved test price"
  }].map(normalizeMsrpRecord);
  const plan = planWalmartPrepCandidates(
    accepted,
    ["walmart:123456789"],
    [],
    [],
    { profile, msrpCatalog, openAt: "2026-08-11T13:00:00Z", now: NOW }
  );
  assert.equal(plan.additions.length, 1);
  assert.deepEqual(plan.summary, { selected: 1, added: 1, skipped: 0, needsPrice: 0, overCapacity: 0 });
  assert.equal(plan.additions[0].maxPrice, 49.99, "listing price must not become the cap");
  assert.equal(plan.additions[0].openAt, "2026-08-11T13:00:00.000Z");
  assert.throws(() => planWalmartPrepCandidates(
    accepted, ["walmart:123456789"], [], [], { profile, msrpCatalog, openAt: "2026-08-11T11:00:00Z", now: NOW }
  ), /future Walmart drop time/);
});

test("catalog imports use an approved MSRP and item profile without trusting listing price", () => {
  const state = activeState();
  state.items = [{
    id: "target:1011209279",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Journey Together Elite Trainer Box",
    productUrl: "https://www.target.com/p/box/-/A-1011209279",
    price: 1,
    observedAt: new Date(NOW).toISOString(),
    searchId: "search-1",
    query: "pokemon cards"
  }];
  const profile = require("../lib/item-defaults").BUILT_IN_ITEM_PROFILES[0];
  const msrpCatalog = [require("../lib/item-defaults").normalizeMsrpRecord({
    id: "msrp:pokemon-etb",
    productLine: "Pokémon",
    productType: "ETB",
    matchTerms: ["elite trainer box", "etb"],
    prices: { target: 49.99 },
    sourceLabel: "Approved"
  })];
  const plan = planCatalogMissionImport(state, [state.items[0].id], [], 50, {
    profile,
    msrpCatalog,
    storeOrderAllowances: { target: 8 }
  });
  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.summary.needsPrice, 0);
  assert.equal(plan.additions[0].maxPrice, 49.99, "listing price must not become the purchase cap");
  assert.equal(plan.additions[0].maxOrderTotal, 63.99);
  assert.equal(plan.additions[0].action, "checkout");
  assert.equal(plan.additions[0].fulfillmentMode, "shipping");
  assert.equal(plan.additions[0].enabled, true);
});

test("a broad catalog search term cannot assign MSRP to a nonmatching result title", () => {
  const state = activeState();
  state.activeSearch.query = "pokemon etb";
  state.items = [{
    id: "target:1011209279",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Booster Bundle",
    productUrl: "https://www.target.com/p/bundle/-/A-1011209279",
    price: 1,
    observedAt: new Date(NOW).toISOString(),
    searchId: "search-1",
    query: "pokemon etb"
  }];
  const profile = require("../lib/item-defaults").BUILT_IN_ITEM_PROFILES[0];
  const msrpCatalog = [require("../lib/item-defaults").normalizeMsrpRecord({
    id: "msrp:pokemon-etb",
    productLine: "Pokémon",
    productType: "ETB",
    matchTerms: ["elite trainer box", "etb"],
    prices: { target: 49.99 },
    sourceLabel: "Approved"
  })];
  const plan = planCatalogMissionImport(state, [state.items[0].id], [], 50, { profile, msrpCatalog });
  assert.equal(plan.summary.ready, 0);
  assert.equal(plan.summary.needsPrice, 1);
  assert.equal(plan.additions[0].maxPrice, 0);
  assert.equal(plan.additions[0].enabled, false);
});
