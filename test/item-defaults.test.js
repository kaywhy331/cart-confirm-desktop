"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BUILT_IN_ITEM_PROFILES,
  calculateOrderTotalCap,
  DEFAULT_ITEM_PROFILE_ID,
  applyItemProfile,
  cloneStarterCatalog,
  normalizeCustomItemProfile,
  normalizeMsrpRecord,
  normalizeStoreOrderAllowances,
  resolveMsrpRecord
} = require("../lib/item-defaults");

function approvedCatalog() {
  return [normalizeMsrpRecord({
    id: "msrp:pokemon-etb",
    productLine: "Pokémon",
    productType: "Elite Trainer Box",
    matchTerms: ["elite trainer box", "etb"],
    excludeTerms: ["pokemon center exclusive"],
    prices: { target: 49.99, walmart: 49.98, amazon: 54.99 },
    sourceLabel: "Operator approved",
    sourceUrl: "https://example.com/msrp",
    verifiedAt: "2026-08-12T12:00:00Z"
  })];
}

test("starter MSRP types are centralized but do not invent purchase caps", () => {
  const records = cloneStarterCatalog();
  assert.deepEqual(records.map((record) => record.productType), [
    "Elite Trainer Box (ETB)",
    "Blister pack",
    "Single booster pack",
    "Super-Premium Collection (SPC)",
    "Ultra-Premium Collection (UPC)"
  ]);
  assert.equal(records.every((record) => Object.values(record.prices).every((price) => price === null)), true);
});

test("MSRP matching uses the most specific included term and honors exclusions", () => {
  const catalog = approvedCatalog();
  assert.equal(resolveMsrpRecord({ title: "Pokémon Destined Rivals Elite Trainer Box" }, catalog)?.id, "msrp:pokemon-etb");
  assert.equal(resolveMsrpRecord({ title: "Pokémon ETB" }, catalog)?.id, "msrp:pokemon-etb");
  assert.equal(resolveMsrpRecord({ title: "Pokémon Center Exclusive ETB" }, catalog), null);
  assert.equal(resolveMsrpRecord({ title: "Pokémon Booster Bundle", query: "pokemon etb" }, catalog), null);
});

test("the new-install default profile applies approved store MSRP as shipping watch-only", () => {
  const profile = BUILT_IN_ITEM_PROFILES.find((candidate) => candidate.id === DEFAULT_ITEM_PROFILE_ID);
  const product = applyItemProfile({
    retailer: "target",
    title: "Pokémon Elite Trainer Box",
    maxPrice: 0,
    enabled: false
  }, profile, approvedCatalog());
  assert.equal(product.maxPrice, 49.99);
  assert.equal(product.maxOrderTotal, 0);
  assert.equal(product.quantity, 1);
  assert.equal(product.action, "watch");
  assert.equal(product.fulfillmentMode, "shipping");
  assert.equal(product.enabled, true);
  assert.equal(product.msrpRecordId, "msrp:pokemon-etb");
  assert.equal(product.itemProfileId, DEFAULT_ITEM_PROFILE_ID);
  assert.equal(product.priceSource, "approved-msrp");
});

test("unknown prices stay disabled while an existing manual cap can be profiled", () => {
  const profile = BUILT_IN_ITEM_PROFILES[0];
  const unknown = applyItemProfile({ retailer: "target", title: "Unknown item", maxPrice: 0 }, profile, approvedCatalog());
  assert.equal(unknown.enabled, false);
  assert.equal(unknown.action, "checkout");
  assert.equal(unknown.fulfillmentMode, "shipping");
  assert.equal(unknown.maxOrderTotal, 0);

  const manual = applyItemProfile({ retailer: "target", title: "Unknown item", maxPrice: 20 }, profile, approvedCatalog());
  assert.equal(manual.enabled, true);
  assert.equal(manual.maxOrderTotal, 35);
  assert.equal(manual.priceSource, "manual");

  const customAllowance = applyItemProfile(
    { retailer: "target", title: "Unknown item", maxPrice: 20 },
    profile,
    approvedCatalog(),
    { storeOrderAllowances: { target: 7.25 } }
  );
  assert.equal(customAllowance.maxOrderTotal, 27.25);
});

test("store allowances calculate final caps independently from item profiles", () => {
  assert.deepEqual(normalizeStoreOrderAllowances({ target: 8.5 }), {
    target: 8.5,
    walmart: 15,
    amazon: 15
  });
  assert.equal(calculateOrderTotalCap({
    retailer: "walmart",
    maxPrice: 12.99,
    quantity: 2,
    action: "review"
  }, { walmart: 4.02 }), 30);
  assert.equal(calculateOrderTotalCap({
    retailer: "walmart",
    maxPrice: 12.99,
    quantity: 2,
    action: "cart"
  }, { walmart: 4.02 }), 0);
  assert.throws(() => normalizeStoreOrderAllowances({ amazon: -1 }), /Amazon order-total allowance/);
});

test("custom profiles reject ambiguous fulfillment and drop legacy per-item allowances", () => {
  assert.throws(() => normalizeCustomItemProfile({
    id: "custom:unsafe",
    name: "Unsafe",
    settings: { action: "checkout", fulfillmentMode: "manual" }
  }), /shipping or pickup/);
  const profile = normalizeCustomItemProfile({
    id: "custom:two",
    name: "Two shipped",
    settings: {
      quantity: 2,
      action: "checkout",
      fulfillmentMode: "shipping",
      alertLevel: "alarm",
      maxOrderBuffer: 12,
      products: [{ id: "unsafe" }]
    }
  });
  assert.equal(profile.settings.quantity, 2);
  assert.equal("maxOrderBuffer" in profile.settings, false);
  assert.equal("products" in profile.settings, false);
});
