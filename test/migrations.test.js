"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateStoredSettings } = require("../lib/migrations");

test("legacy armed checkout settings receive tax-aware defaults without requiring advance evidence", () => {
  const stored = {
    automationEnabled: true,
    retryIntervalSeconds: 30,
    products: [{
      retailer: "target",
      productUrl: "https://www.target.com/p/example/-/A-1011960739",
      sku: "1011960739",
      maxPrice: 50,
      quantity: 2,
      action: "checkout",
      fulfillmentMode: "shipping",
      enabled: true
    }]
  };
  const migrated = migrateStoredSettings(stored);
  assert.equal(migrated.automationEnabled, true);
  assert.equal(migrated.retryIntervalSeconds, 30);
  assert.equal(migrated.products[0].sku, "1011960739");
  assert.equal(migrated.products[0].maxOrderTotal, 142);
  assert.equal(migrated.orderTaxPercent, 12);
  assert.deepEqual(migrated.storeOrderAllowances, { target: 30, walmart: 30, amazon: 30 });
  assert.equal(stored.automationEnabled, true);
});

test("legacy per-item checkout caps clear optional evidence when the derived cap changes", () => {
  const stored = {
    automationEnabled: true,
    products: [{
      retailer: "target",
      maxPrice: 50,
      maxOrderTotal: 110,
      quantity: 2,
      action: "checkout",
      fulfillmentMode: "shipping",
      checkoutEvidence: { version: 2 },
      enabled: true
    }]
  };
  const migrated = migrateStoredSettings(stored);
  assert.equal(migrated.automationEnabled, true);
  assert.equal(migrated.products[0].maxOrderTotal, 142);
  assert.equal(migrated.products[0].checkoutEvidence, null);
});

test("tax migration raises untouched $15 defaults but preserves custom allowances", () => {
  const migrated = migrateStoredSettings({
    storeOrderAllowances: { target: 7.5, walmart: 15, amazon: 22 },
    products: []
  });
  assert.deepEqual(migrated.storeOrderAllowances, { target: 7.5, walmart: 30, amazon: 22 });
  assert.equal(migrated.orderTaxPercent, 12);

  const alreadyConfigured = migrateStoredSettings({
    orderTaxPercent: 8.25,
    storeOrderAllowances: { target: 15, walmart: 15, amazon: 15 },
    products: []
  });
  assert.deepEqual(alreadyConfigured.storeOrderAllowances, { target: 15, walmart: 15, amazon: 15 });
  assert.equal(alreadyConfigured.orderTaxPercent, 8.25);
});

test("legacy single-product auto-checkout settings are also preserved and disarmed", () => {
  const stored = {
    automationEnabled: true,
    autoOpenCart: true,
    productUrl: "https://www.target.com/p/example/-/A-1011960739",
    tcin: "1011960739",
    maxPrice: 50
  };
  const migrated = migrateStoredSettings(stored);
  assert.equal(migrated.automationEnabled, false);
  assert.equal(migrated.productUrl, stored.productUrl);
});

test("the legacy global schedule migrates onto matching enabled products", () => {
  const openAt = "2026-08-14T14:00:00.000Z";
  const migrated = migrateStoredSettings({
    scheduledOpenEnabled: true,
    scheduledOpenAt: openAt,
    scheduledRetailer: "target",
    products: [
      { retailer: "target", sku: "1", enabled: true },
      { retailer: "target", sku: "2", enabled: false },
      { retailer: "walmart", sku: "3", enabled: true },
      { retailer: "target", sku: "4", enabled: true, openAt: "2026-08-20T10:00:00.000Z" }
    ]
  });
  assert.equal(migrated.scheduledOpenEnabled, false);
  assert.equal(migrated.products[0].openAt, openAt);
  assert.equal(migrated.products[1].openAt, undefined);
  assert.equal(migrated.products[2].openAt, undefined);
  assert.equal(migrated.products[3].openAt, "2026-08-20T10:00:00.000Z");
});
