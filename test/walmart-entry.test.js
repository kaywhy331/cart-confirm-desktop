"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWalmartBuyNowUrl, sanitizeWalmartBuyNowUrl } = require("../lib/walmart-entry");

test("Walmart Buy Now is built from the exact item ID", () => {
  assert.equal(
    buildWalmartBuyNowUrl("19952559023"),
    "https://www.walmart.com/affil/cart/buynow?items=19952559023"
  );
  assert.equal(buildWalmartBuyNowUrl("19952559023,11111111111"), "");
});

test("Walmart Buy Now keeps only one exact matching item ID", () => {
  const result = sanitizeWalmartBuyNowUrl(
    "https://www.walmart.com/affil/cart/buynow?items=19952559023&affp1=tracking&veh=aff",
    "19952559023"
  );
  assert.deepEqual(result, {
    kind: "walmart-buy-now",
    url: "https://www.walmart.com/affil/cart/buynow?items=19952559023",
    sku: "19952559023"
  });
});

test("Walmart Buy Now rejects off-domain, mismatched, and multi-item entries", () => {
  assert.equal(sanitizeWalmartBuyNowUrl("https://example.com/affil/cart/buynow?items=19952559023", "19952559023"), null);
  assert.equal(sanitizeWalmartBuyNowUrl("https://www.walmart.com/affil/cart/buynow?items=11111111111", "19952559023"), null);
  assert.equal(sanitizeWalmartBuyNowUrl("https://www.walmart.com/affil/cart/buynow?items=19952559023,11111111111", "19952559023"), null);
  assert.equal(sanitizeWalmartBuyNowUrl("https://www.walmart.com/affil/cart/buynow?items=19952559023&items=11111111111", "19952559023"), null);
});
