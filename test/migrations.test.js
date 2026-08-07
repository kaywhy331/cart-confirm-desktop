"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateStoredSettings } = require("../lib/migrations");

test("legacy armed checkout settings are preserved but disarmed when the final-total cap is missing", () => {
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
  assert.equal(migrated.automationEnabled, false);
  assert.equal(migrated.retryIntervalSeconds, 30);
  assert.equal(migrated.products[0].sku, "1011960739");
  assert.equal(stored.automationEnabled, true);
});

test("valid capped checkout settings remain armed during migration", () => {
  const stored = {
    automationEnabled: true,
    products: [{
      maxPrice: 50,
      maxOrderTotal: 110,
      quantity: 2,
      action: "checkout",
      fulfillmentMode: "shipping",
      enabled: true
    }]
  };
  assert.equal(migrateStoredSettings(stored), stored);
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
