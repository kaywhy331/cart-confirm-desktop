"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planSignalRoute } = require("../lib/signal-routing");

const NOW = Date.parse("2026-08-08T17:20:30.000Z");
const amazonProduct = {
  id: "amazon:B0GG16Q4X1",
  retailer: "amazon",
  sku: "B0GG16Q4X1",
  productUrl: "https://www.amazon.com/dp/B0GG16Q4X1",
  maxPrice: 180,
  action: "checkout",
  enabled: true,
  signalAutoOpen: true,
  signalEntry: "amazon-buy-now"
};
const signal = {
  productId: amazonProduct.id,
  observedAt: "2026-08-08T17:20:00.000Z",
  price: 179.99,
  seller: "Amazon.com",
  amazonBuyNowUrl: "https://www.amazon.com/gp/buy/express/handlers/display.html?ASIN=B0GG16Q4X1&quantity=1&offerListingID=offer"
};

function settings(overrides = {}) {
  return {
    products: [amazonProduct],
    automationEnabled: true,
    monitoringPaused: false,
    discordAutoOpen: true,
    ...overrides
  };
}

test("fresh desired Amazon signals can use a sanitized direct entry", () => {
  const route = planSignalRoute({ signal, settings: settings(), now: NOW });
  assert.equal(route.state, "pending");
  assert.equal(route.entry, "amazon-buy-now");
});

test("direct Amazon entry fails back to the product page without every proof", () => {
  for (const changed of [
    { price: 200 },
    { seller: "Marketplace Seller" },
    { amazonBuyNowUrl: "" }
  ]) {
    const route = planSignalRoute({ signal: { ...signal, ...changed }, settings: settings(), now: NOW });
    assert.equal(route.entry, "product");
    assert.equal(route.url, amazonProduct.productUrl);
  }
  assert.equal(planSignalRoute({ signal, settings: settings({ automationEnabled: false }), now: NOW }).entry, "product");
});

test("new, stopped, disabled, historical, and stale signals never auto-open", () => {
  assert.equal(planSignalRoute({ signal: { ...signal, productId: "amazon:OTHER" }, settings: settings(), now: NOW }).state, "new-product");
  assert.equal(planSignalRoute({ signal: { ...signal, productId: "amazon:OTHER" }, settings: settings({ monitoringPaused: true }), now: NOW }).state, "disabled");
  assert.equal(planSignalRoute({ signal, settings: settings({ monitoringPaused: true }), now: NOW }).state, "disabled");
  assert.equal(planSignalRoute({ signal, settings: settings({ discordAutoOpen: false }), now: NOW }).state, "disabled");
  assert.equal(planSignalRoute({ signal, settings: settings(), historical: true, now: NOW }).state, "historical");
  assert.equal(planSignalRoute({ signal: { ...signal, observedAt: "2026-08-08T17:00:00.000Z" }, settings: settings(), now: NOW }).state, "stale");
});

test("fresh Walmart matches can use the exact sanitized Buy Now entry", () => {
  const product = {
    ...amazonProduct,
    id: "walmart:19952559023",
    retailer: "walmart",
    sku: "19952559023",
    productUrl: "https://www.walmart.com/ip/19952559023",
    maxPrice: 40,
    signalEntry: "walmart-buy-now"
  };
  const route = planSignalRoute({
    signal: {
      productId: product.id,
      observedAt: "2026-08-08T17:20:00.000Z",
      price: 31.97,
      walmartBuyNowUrl: "https://www.walmart.com/affil/cart/buynow?items=19952559023"
    },
    settings: settings({ products: [product] }),
    now: NOW
  });
  assert.equal(route.entry, "walmart-buy-now");
  assert.equal(route.url, "https://www.walmart.com/affil/cart/buynow?items=19952559023");
  assert.equal(planSignalRoute({
    signal: {
      productId: product.id,
      observedAt: "2026-08-08T17:20:00.000Z",
      price: 31.97,
      walmartBuyNowUrl: "https://www.walmart.com/affil/cart/buynow?items=19952559023"
    },
    settings: settings({ products: [{ ...product, action: "cart" }] }),
    now: NOW
  }).entry, "product");
});
