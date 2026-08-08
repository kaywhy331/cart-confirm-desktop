"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAmazonActionUrls,
  sanitizeAmazonActionUrl
} = require("../lib/amazon-entry");

test("Amazon Buy Now signals retain only the exact offer entry parameters", () => {
  const input = "https://www.amazon.com/gp/buy/express/handlers/display.html?ie=UTF8&ASIN=B0GG16Q4X1&quantity=1&offerListingID=abc%2B123&ref_=assoc_tag&isEligibilityLogicDisabled=1";
  const result = sanitizeAmazonActionUrl(input, "B0GG16Q4X1");
  assert.equal(result.kind, "amazon-buy-now");
  assert.equal(result.asin, "B0GG16Q4X1");
  assert.equal(result.offerId, "abc+123");
  assert.equal(result.url.includes("isEligibilityLogicDisabled"), false);
  assert.equal(result.url.includes("ref_"), false);
  assert.equal(result.url.includes("offerListingID=abc%2B123"), true);
});

test("Amazon ATC signals are exact-ASIN, bounded-quantity HTTPS URLs", () => {
  const input = "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1&Quantity.1=12&OfferListingId.1=offer";
  const result = sanitizeAmazonActionUrl(input, "B0GG16Q4X1");
  assert.equal(result.kind, "amazon-atc");
  assert.equal(result.quantity, 12);
  assert.equal(sanitizeAmazonActionUrl(input, "B0OTHER123"), null);
  assert.equal(sanitizeAmazonActionUrl(input.replace("https:", "http:"), "B0GG16Q4X1"), null);
  assert.equal(sanitizeAmazonActionUrl("https://example.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1"), null);
});

test("an offer ID can produce sanitized ATC and Buy Now entry links", () => {
  const result = buildAmazonActionUrls("B0GG16Q4X1", "R%2BJU%2Foffer", 1);
  assert.match(result.amazonAtcUrl, /ASIN\.1=B0GG16Q4X1/);
  assert.match(result.amazonAtcUrl, /OfferListingId\.1=R%2BJU%2Foffer/);
  assert.match(result.amazonBuyNowUrl, /ASIN=B0GG16Q4X1/);
  assert.match(result.amazonBuyNowUrl, /offerListingID=R%2BJU%2Foffer/);
});
