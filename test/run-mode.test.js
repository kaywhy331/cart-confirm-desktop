"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertSafeArmedUpdate, normalizeSettings, purchaseModeEnabled } = require("../lib/core");

const product = {
  retailer: "target",
  productUrl: "https://www.target.com/p/example/-/A-95298172",
  sku: "95298172",
  maxPrice: 40,
  maxOrderTotal: 75,
  quantity: 1,
  action: "checkout",
  fulfillmentMode: "shipping",
  enabled: true
};

test("Signals is a purchase-capable run mode distinct from Autopilot", () => {
  const signals = normalizeSettings({
    products: [product],
    automationEnabled: false,
    signalsEnabled: true
  });
  assert.equal(signals.automationEnabled, false);
  assert.equal(signals.signalsEnabled, true);
  assert.equal(purchaseModeEnabled(signals), true);
  assert.throws(() => normalizeSettings({
    products: [product],
    automationEnabled: true,
    signalsEnabled: true
  }), /either Autopilot or Signals/);
});

test("Signals applies armed validation and blocks live mission-contract edits", () => {
  assert.throws(() => normalizeSettings({ products: [], signalsEnabled: true }), /Enable at least one product/);
  const current = normalizeSettings({ products: [product], signalsEnabled: true });
  const changed = normalizeSettings({
    products: [{ ...product, maxPrice: 41 }],
    signalsEnabled: true
  });
  assert.throws(() => assertSafeArmedUpdate(current, changed), /Disarm automation/);
  assert.doesNotThrow(() => assertSafeArmedUpdate(current, {
    ...changed,
    signalsEnabled: false
  }));
});
