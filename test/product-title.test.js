"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSafeArmedUpdate, normalizeProduct } = require("../lib/core");

test("product titles are optional, trimmed, and bounded", () => {
  const base = { productUrl: "https://www.target.com/p/restocks/A-95298172", maxPrice: 40 };
  assert.equal(normalizeProduct(base).title, "");
  assert.equal(normalizeProduct({ ...base, title: "  Booster   Box  " }).title, "Booster Box");
  assert.equal(normalizeProduct({ ...base, title: "x".repeat(200) }).title.length, 80);
});

test("editing only a product title is allowed while automation stays armed", () => {
  const product = normalizeProduct({
    productUrl: "https://www.target.com/p/restocks/A-95298172",
    maxPrice: 40
  });
  const current = { automationEnabled: true, products: [product] };
  const next = { automationEnabled: true, products: [{ ...product, title: "Renamed" }] };
  assert.doesNotThrow(() => assertSafeArmedUpdate(current, next));
});

test("scheduled opening times normalize to ISO and reject invalid input", () => {
  const base = { productUrl: "https://www.target.com/p/restocks/A-95298172", maxPrice: 40 };
  assert.equal(normalizeProduct(base).openAt, "");
  assert.equal(
    normalizeProduct({ ...base, openAt: "2026-08-14T14:00:00.000Z" }).openAt,
    "2026-08-14T14:00:00.000Z"
  );
  assert.throws(() => normalizeProduct({ ...base, openAt: "not-a-time" }), /invalid/);
});

test("editing only a schedule time is allowed while automation stays armed", () => {
  const product = normalizeProduct({
    productUrl: "https://www.target.com/p/restocks/A-95298172",
    maxPrice: 40
  });
  const current = { automationEnabled: true, products: [product] };
  const next = {
    automationEnabled: true,
    products: [{ ...product, openAt: "2026-08-14T14:00:00.000Z" }]
  };
  assert.doesNotThrow(() => assertSafeArmedUpdate(current, next));
});

test("watch-only missions and alert levels normalize and arm without purchase caps", () => {
  const { normalizeSettings } = require("../lib/core");
  const base = { productUrl: "https://www.target.com/p/restocks/A-95298172", maxPrice: 40 };
  assert.equal(normalizeProduct({ ...base, action: "watch" }).action, "watch");
  assert.equal(normalizeProduct(base).alertLevel, "standard");
  assert.equal(normalizeProduct({ ...base, alertLevel: "alarm" }).alertLevel, "alarm");
  assert.throws(() => normalizeProduct({ ...base, alertLevel: "shout" }), /alert level/);

  // A watch mission never needs an order-total cap to arm.
  const armed = normalizeSettings({
    products: [{ ...base, action: "watch", alertLevel: "alarm" }],
    automationEnabled: true
  }, {});
  assert.equal(armed.automationEnabled, true);
  assert.equal(armed.products[0].maxOrderTotal, 0);
});
