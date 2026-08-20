"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planBulkImport,
  quickAddMission,
  urlEntries
} = require("../lib/mission-import");
const { BUILT_IN_ITEM_PROFILES, normalizeMsrpRecord } = require("../lib/item-defaults");

test("bulk import extracts, normalizes, deduplicates, and disables URL-only missions", () => {
  const plan = planBulkImport(`
    https://www.target.com/p/pokemon-box/-/A-1011209279?ref=tracking
    https://www.walmart.com/ip/pokemon-bundle/95163305
    https://www.amazon.com/Pokemon-Booster/dp/B0ABC12345?tag=example-20
    https://www.target.com/p/duplicate/-/A-1011209279
    not-a-url
  `, [{ id: "walmart:95163305" }]);

  assert.deepEqual(plan.additions.map((product) => product.id), [
    "target:1011209279",
    "amazon:B0ABC12345"
  ]);
  assert.equal(plan.additions.every((product) => product.enabled === false), true);
  assert.equal(plan.additions.every((product) => product.action === "watch"), true);
  assert.equal(plan.additions.every((product) => product.maxPrice === 0), true);
  assert.equal(plan.additions[0].productUrl.includes("?"), false);
  assert.deepEqual(plan.summary, {
    candidates: 5,
    imported: 2,
    ready: 0,
    needsPrice: 2,
    duplicates: 2,
    invalid: 1,
    overCapacity: 0
  });
});

test("bulk import reports capacity overflow without replacing existing missions", () => {
  const plan = planBulkImport([
    "https://www.target.com/p/a/-/A-1011209279",
    "https://www.target.com/p/b/-/A-1008581387"
  ].join("\n"), [{ id: "target:999999999" }], 2);

  assert.equal(plan.additions.length, 1);
  assert.equal(plan.summary.overCapacity, 1);
});

test("URL extraction accepts multiple pasted URLs and marks non-URL lines", () => {
  const entries = urlEntries("https://www.target.com/p/a/-/A-1011209279 https://www.walmart.com/ip/95163305\nmissing");
  assert.equal(entries.length, 3);
  assert.equal(entries[2].reason, "No HTTPS URL was found.");
});

test("quick add trusts only a matching exact ID and positive observed price", () => {
  const mission = quickAddMission({
    retailer: "amazon",
    sku: "B0ABC12345",
    productUrl: "https://www.amazon.com/Pokemon-Booster/dp/B0ABC12345?tag=tracking",
    title: "  Pokémon Booster Box  ",
    price: 34.987
  });

  assert.equal(mission.id, "amazon:B0ABC12345");
  assert.equal(mission.productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(mission.title, "Pokémon Booster Box");
  assert.equal(mission.maxPrice, 34.99);
  assert.equal(mission.action, "watch");
  assert.equal(mission.enabled, true);
  assert.throws(() => quickAddMission({
    retailer: "amazon",
    sku: "B0WRONG1234",
    productUrl: "https://www.amazon.com/dp/B0ABC12345",
    price: 34.99
  }), /do not match/);
  assert.throws(() => quickAddMission({
    retailer: "target",
    sku: "1011209279",
    productUrl: "https://www.target.com/p/a/-/A-1011209279",
    price: null
  }), /current price/);
});

test("default-profile imports use shipping auto-buy while unknown URL prices stay Off", () => {
  const profile = BUILT_IN_ITEM_PROFILES[0];
  const msrpCatalog = [normalizeMsrpRecord({
    id: "msrp:pokemon-etb",
    productLine: "Pokémon",
    productType: "ETB",
    matchTerms: ["elite trainer box"],
    prices: { target: 49.99 },
    sourceLabel: "Approved"
  })];
  const plan = planBulkImport([
    "https://www.target.com/p/pokemon-elite-trainer-box/-/A-1011209279",
    "https://www.walmart.com/ip/unknown-item/95163305"
  ].join("\n"), [], 50, { profile, msrpCatalog });
  assert.equal(plan.additions[0].action, "checkout");
  assert.equal(plan.additions[0].fulfillmentMode, "shipping");
  assert.equal(plan.additions[0].maxPrice, 49.99);
  assert.equal(plan.additions[0].maxOrderTotal, 85.99);
  assert.equal(plan.additions[0].enabled, true);
  assert.equal(plan.additions[1].action, "checkout");
  assert.equal(plan.additions[1].fulfillmentMode, "shipping");
  assert.equal(plan.additions[1].maxPrice, 0);
  assert.equal(plan.additions[1].enabled, false);
});

test("Quick add applies the default profile using a positive observed page price", () => {
  const mission = quickAddMission({
    retailer: "amazon",
    sku: "B0ABC12345",
    productUrl: "https://www.amazon.com/dp/B0ABC12345",
    title: "Unknown sealed item",
    price: 34.99
  }, {
    profile: BUILT_IN_ITEM_PROFILES[0],
    msrpCatalog: [],
    storeOrderAllowances: { amazon: 5 }
  });
  assert.equal(mission.action, "checkout");
  assert.equal(mission.fulfillmentMode, "shipping");
  assert.equal(mission.maxPrice, 34.99);
  assert.equal(mission.maxOrderTotal, 44.19);
  assert.equal(mission.enabled, true);
  assert.equal(mission.priceSource, "observed-page");
});

test("Quick add keeps the exact observed page cap when the title also matches an MSRP category", () => {
  const mission = quickAddMission({
    retailer: "target",
    sku: "1011209279",
    productUrl: "https://www.target.com/p/pokemon-elite-trainer-box/-/A-1011209279",
    title: "Pokémon Elite Trainer Box",
    price: 39.99
  }, {
    profile: BUILT_IN_ITEM_PROFILES[0],
    msrpCatalog: [normalizeMsrpRecord({
      id: "msrp:pokemon-etb",
      productLine: "Pokémon",
      productType: "Elite Trainer Box",
      matchTerms: ["elite trainer box"],
      prices: { target: 49.99 },
      sourceLabel: "Approved"
    })]
  });
  assert.equal(mission.maxPrice, 39.99);
  assert.equal(mission.maxOrderTotal, 74.79);
  assert.equal(mission.priceSource, "observed-page");
  assert.equal(mission.msrpRecordId, "msrp:pokemon-etb");
});

test("quick add stores the captured affiliate link and opens with it first", () => {
  const { missionOpenUrl } = require("../lib/core");
  const affiliate = "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279?nrtv_cid=8k7bjebavog09&clkid=63477bc3";
  const imageUrl = "https://target.scene7.com/is/image/Target/GUEST_booster";
  const mission = quickAddMission({
    productUrl: "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279",
    affiliateOpenUrl: affiliate,
    imageUrl,
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Booster Bundle",
    price: 34.99
  });
  assert.equal(mission.productUrl, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279");
  assert.equal(mission.affiliateOpenUrl, affiliate);
  assert.equal(mission.imageUrl, imageUrl);
  assert.equal(missionOpenUrl(mission), affiliate);

  // A mismatched or malformed capture is dropped without failing the add.
  const mismatched = quickAddMission({
    productUrl: "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279",
    affiliateOpenUrl: "https://www.target.com/p/other/-/A-95298172?clkid=abc",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Booster Bundle",
    price: 34.99
  });
  assert.equal(mismatched.affiliateOpenUrl, "");
  assert.equal(missionOpenUrl(mismatched), mismatched.productUrl);
});
