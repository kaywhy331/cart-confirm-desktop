"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const TabContext = require("../extension/tab-context");

const config = {
  products: [
    { id: "amazon:B0GG16Q4X1", retailer: "amazon", sku: "B0GG16Q4X1" },
    { id: "walmart:19952559023", retailer: "walmart", sku: "19952559023" }
  ]
};

test("a direct entry receives bounded tab context only for its exact mission", () => {
  const plan = TabContext.validateOpenRequest(config, {
    retailer: "amazon",
    productId: "amazon:B0GG16Q4X1",
    contextRequired: true,
    url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1&Quantity.1=1"
  }, 1_000);
  assert.equal(plan.ok, true);
  assert.equal(plan.context.productId, "amazon:B0GG16Q4X1");
  assert.equal(plan.context.entry, "amazon-atc");
  assert.equal(plan.context.expiresAt, 1_000 + TabContext.CONTEXT_TTL_MS);

  assert.equal(TabContext.validateOpenRequest(config, {
    retailer: "amazon",
    productId: "amazon:B0GG16Q4X1",
    contextRequired: true,
    url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0MISMATCH1"
  }).ok, false);
});

test("Walmart Buy Now context survives only while its mission remains configured", () => {
  const plan = TabContext.validateOpenRequest(config, {
    retailer: "walmart",
    productId: "walmart:19952559023",
    contextRequired: true,
    url: "https://www.walmart.com/affil/cart/buynow?items=19952559023"
  }, 2_000);
  const contexts = { 42: plan.context };
  assert.equal(TabContext.productIdForTab(config, contexts, 42, "walmart", 3_000), "walmart:19952559023");
  assert.equal(TabContext.contextForTab(config, contexts, 42, "walmart", 3_000).entry, "walmart-buy-now");
  assert.equal(TabContext.productIdForTab({ products: [] }, contexts, 42, "walmart", 3_000), "");
  assert.equal(TabContext.productIdForTab(config, contexts, 42, "amazon", 3_000), "");
});

test("direct tab context rejects duplicate or ambiguous action identifiers", () => {
  assert.equal(TabContext.validateOpenRequest(config, {
    retailer: "walmart",
    productId: "walmart:19952559023",
    contextRequired: true,
    url: "https://www.walmart.com/affil/cart/buynow?items=19952559023&items=11111111111"
  }).ok, false);
  assert.equal(TabContext.validateOpenRequest(config, {
    retailer: "amazon",
    productId: "amazon:B0GG16Q4X1",
    contextRequired: true,
    url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1&ASIN=B0GG16Q4X1"
  }).ok, false);
  assert.equal(TabContext.validateOpenRequest(config, {
    retailer: "amazon",
    productId: "amazon:B0GG16Q4X1",
    contextRequired: true,
    url: "https://www.amazon.com/dp/B0GG16Q4X1"
  }).ok, false);
});

test("expired and malformed tab contexts are pruned", () => {
  assert.deepEqual(TabContext.normalizeContextMap({
    1: { productId: "amazon:B0GG16Q4X1", retailer: "amazon", sku: "B0GG16Q4X1", expiresAt: 999 },
    nope: { productId: "amazon:B0GG16Q4X1", retailer: "amazon", sku: "B0GG16Q4X1", expiresAt: 5_000 }
  }, 1_000), {});
});
