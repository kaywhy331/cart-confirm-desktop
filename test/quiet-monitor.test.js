"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { checkProductPage } = require("../lib/quiet-monitor");
const { normalizeSettings } = require("../lib/core");

function page(jsonLd, extra = "") {
  return `<html><head>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  </head><body>${extra}</body></html>`;
}

test("a matching in-stock JSON-LD product reads available with its price", () => {
  const html = page({
    "@context": "https://schema.org",
    "@type": "Product",
    sku: "95298172",
    url: "https://www.target.com/p/restocks/-/A-95298172",
    offers: { "@type": "Offer", price: "31.99", availability: "https://schema.org/InStock" }
  });
  assert.deepEqual(checkProductPage(html, "target", "95298172"), {
    availability: "available",
    price: 31.99
  });
});

test("out-of-stock and sold-out offers read unavailable", () => {
  const html = page({
    "@type": "Product",
    sku: "95298172",
    offers: [{ availability: "http://schema.org/OutOfStock", price: "31.99" }]
  });
  assert.equal(checkProductPage(html, "target", "95298172").availability, "unavailable");
});

test("a page whose only product records belong to other SKUs stays unknown", () => {
  const html = page([
    { "@type": "Product", sku: "111111", offers: { availability: "https://schema.org/InStock" } },
    { "@type": "Product", sku: "222222", offers: { availability: "https://schema.org/InStock" } }
  ]);
  assert.equal(checkProductPage(html, "target", "95298172").availability, "unknown");
});

test("walmart availabilityStatus JSON markers work without JSON-LD", () => {
  const inStock = "<html><body><script>window.__WML_REDUX__={\"availabilityStatus\":\"IN_STOCK\"}</script></body></html>";
  const outOfStock = "<html><body><script>{\"availabilityStatus\":\"OUT_OF_STOCK\"}</script></body></html>";
  assert.equal(checkProductPage(inStock, "walmart", "123456789").availability, "available");
  assert.equal(checkProductPage(outOfStock, "walmart", "123456789").availability, "unavailable");
  assert.equal(checkProductPage("<html></html>", "walmart", "123456789").availability, "unknown");
});

test("monitoringPaused persists through settings saves and defaults off", () => {
  const stopped = normalizeSettings({ monitoringPaused: true }, {});
  assert.equal(stopped.monitoringPaused, true);
  const carried = normalizeSettings({ fastMode: false }, stopped);
  assert.equal(carried.monitoringPaused, true);
  assert.equal(normalizeSettings({}, {}).monitoringPaused, false);
});
