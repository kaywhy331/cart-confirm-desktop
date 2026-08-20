"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Retailers = require("../extension/retailers");
const {
  canonicalProductUrl,
  isAllowedRedirectHost
} = require("../extension/trackalacker-links");

test("TrackaLacker retailer redirects become exact canonical store routes", () => {
  assert.deepEqual(canonicalProductUrl(
    "https://www.target.com/p/pokemon-box/-/A-1010892076?preselect=1010892076",
    "target",
    Retailers
  ), {
    retailer: "target",
    sku: "1010892076",
    productUrl: "https://www.target.com/p/pokemon-box/-/A-1010892076"
  });
  assert.deepEqual(canonicalProductUrl(
    "https://www.amazon.com/name/dp/B0ABC12345?tag=trackalacker",
    "amazon",
    Retailers
  ), {
    retailer: "amazon",
    sku: "B0ABC12345",
    productUrl: "https://www.amazon.com/dp/B0ABC12345"
  });
});

test("Walmart's redirect-block page is decoded without accepting a search or mismatched retailer", () => {
  const encoded = Buffer.from("/ip/Pokemon-Box/20754418655").toString("base64").replace(/=+$/, "");
  assert.deepEqual(canonicalProductUrl(
    `https://www.walmart.com/blocked?url=${encodeURIComponent(encoded)}&uuid=test`,
    "walmart",
    Retailers
  ), {
    retailer: "walmart",
    sku: "20754418655",
    productUrl: "https://www.walmart.com/ip/20754418655"
  });
  assert.equal(canonicalProductUrl("https://www.target.com/s?searchTerm=pokemon", "target", Retailers), null);
  assert.equal(canonicalProductUrl("https://www.walmart.com/ip/20754418655", "target", Retailers), null);
});

test("only the observed HTTPS Howl redirect host can require network resolution", () => {
  assert.equal(isAllowedRedirectHost("https://howl.link/example"), true);
  assert.equal(isAllowedRedirectHost("https://sub.howl.link/example"), true);
  assert.equal(isAllowedRedirectHost("http://howl.link/example"), false);
  assert.equal(isAllowedRedirectHost("https://howl.link@evil.example/example"), false);
  assert.equal(isAllowedRedirectHost("https://evil.example/example"), false);
});
