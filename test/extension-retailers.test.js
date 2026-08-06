"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectRetailer,
  extractSkuFromUrl,
  getAdapter,
  isFirstPartyText,
  parsePrice,
  parseWalmartQueue
} = require("../extension/retailers");

test("extension helpers recognize supported retailer product pages", () => {
  assert.equal(detectRetailer("https://www.target.com/p/name/-/A-123456789"), "target");
  assert.equal(detectRetailer("https://www.walmart.com/ip/name/987654321"), "walmart");
  assert.equal(detectRetailer("https://www.amazon.com/name/dp/B0ABC12345"), "amazon");
  assert.equal(extractSkuFromUrl("target", "https://www.target.com/p/name/-/A-123456789"), "123456789");
  assert.equal(extractSkuFromUrl("walmart", "https://www.walmart.com/ip/name/987654321"), "987654321");
  assert.equal(extractSkuFromUrl("amazon", "https://www.amazon.com/name/dp/b0abc12345"), "B0ABC12345");
});

test("extension price parser handles US currency without mistaking unrelated text", () => {
  assert.equal(parsePrice("Now $1,249.95"), 1249.95);
  assert.equal(parsePrice("US $8.5"), 8.5);
  assert.equal(parsePrice("C$ 8.50"), null);
  assert.equal(parsePrice("MX $499.00"), null);
  assert.equal(parsePrice("SG$ 19.00"), null);
  assert.equal(parsePrice("HK$ 88.00"), null);
  assert.equal(parsePrice("A$ 12.00"), null);
  assert.equal(parsePrice("R$ 49.00"), null);
  assert.equal(parsePrice("Temporarily unavailable"), null);
});

test("first-party checks reject marketplace and fulfilled-only offers", () => {
  assert.equal(isFirstPartyText("target", "Sold and shipped by Target"), true);
  assert.equal(isFirstPartyText("target", "Sold and shipped by Marketplace Deals"), false);
  assert.equal(isFirstPartyText("target", "Fulfilled by Target"), false);
  assert.equal(isFirstPartyText("walmart", "Sold and shipped by Walmart.com"), true);
  assert.equal(isFirstPartyText("walmart", "Sold by Example Seller, fulfilled by Walmart"), false);
  assert.equal(isFirstPartyText("amazon", "Ships from Amazon.com Sold by Amazon.com"), true);
  assert.equal(isFirstPartyText("amazon", "Ships from Amazon.com Sold by Example Seller"), false);
});

test("Walmart queue URLs expose only safe item and wait state metadata", () => {
  const qpdata = encodeURIComponent(JSON.stringify({
    queued: true,
    url: "https://queue.invalid/should-not-be-replayed",
    customMetadata: {
      state: "pending",
      expectedTurn: "2026-08-06T02:00:00.000Z",
      nextRefreshRelativeTime: 30,
      item: { itemID: "987654321" }
    }
  }));
  const url = `https://www.walmart.com/qp?qpdata=${qpdata}&signature=secret`;
  const queue = parseWalmartQueue(url);
  assert.deepEqual(queue, {
    itemId: "987654321",
    queued: true,
    state: "pending",
    soldOut: false,
    expectedTurn: "2026-08-06T02:00:00.000Z",
    nextRefreshSeconds: 30
  });
  assert.equal(extractSkuFromUrl("walmart", url), "987654321");
  assert.equal(getAdapter("walmart").pageKind(url), "queue");
  assert.equal("url" in queue, false);
});
