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
