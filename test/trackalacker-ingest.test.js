"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  chooseStoreListings,
  estimateHistoryPrice,
  parseFollowedPage,
  parseHistoryPage,
  parseProductPage
} = require("../extension/trackalacker-ingest");

function doc(html, url = "https://www.trackalacker.com/products/followed") {
  return new JSDOM(html, { url }).window.document;
}

test("followed pages expose stable product identity, source URL, image, price, and pagination", () => {
  const parsed = parseFollowedPage(doc(`
    <div class="mb-4 border-bottom pb-4">
      <a href="/products/showcase/pokemon-box"><img alt="Pokemon Box" src="https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg"></a>
      <a class="text-reset text-decoration-none" href="/products/showcase/pokemon-box">Pokemon Elite Trainer Box</a>
      <span class="fs-7">Expected $49.99</span>
      <button class="testing-track-all-false-product-12345-button">Untrack</button>
    </div>
    <a href="/products/followed?page=2">2</a>
    <a href="/products/followed?page=9">9</a>
  `));
  assert.equal(parsed.requiresLogin, false);
  assert.equal(parsed.totalPages, 9);
  assert.deepEqual(parsed.items, [{
    sourceProductId: "12345",
    sourceUrl: "https://www.trackalacker.com/products/showcase/pokemon-box",
    title: "Pokemon Elite Trainer Box",
    imageUrl: "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg",
    displayPrice: 49.99
  }]);
});

test("product pages itemize supported and future stores with listing history links", () => {
  const page = doc(`
    <h1>Pokemon Elite Trainer Box</h1>
    <div class="testing-product-listing-row">
      <a href="https://howl.link/target-route" class="gtm-click-trigger">Target</a>
      <span>$59.99</span><span>Out of Stock</span>
      <a data-testing="listing-301-details" href="/products/showcase/pokemon-box/listings/301/pokemon-box">History</a>
    </div>
    <div class="testing-product-listing-row">
      <a href="https://example.test/store" class="gtm-click-trigger">GameStop</a>
      <span>$49.99</span><span>In Stock</span>
      <a data-testing="listing-302-details" href="/products/showcase/pokemon-box/listings/302/pokemon-box">History</a>
    </div>
  `, "https://www.trackalacker.com/products/showcase/pokemon-box");
  const parsed = parseProductPage(page, {
    sourceProductId: "12345",
    sourceUrl: "https://www.trackalacker.com/products/showcase/pokemon-box",
    title: "Fallback"
  });
  assert.equal(parsed.title, "Pokemon Elite Trainer Box");
  assert.equal(parsed.listings.length, 2);
  assert.deepEqual(parsed.listings.map((listing) => [listing.listingId, listing.retailer, listing.store]), [
    ["301", "target", "Target"],
    ["302", "", "GameStop"]
  ]);
  assert.equal(parsed.listings[0].historyUrl, "https://www.trackalacker.com/products/showcase/pokemon-box/listings/301/pokemon-box");
});

test("history estimates reject surge and above-MSRP observations and use the stable normal price", () => {
  const entries = parseHistoryPage(doc(`
    <table><tbody>
      <tr><td>8/20/2026, 10:18:12 PM</td><td>$189.99</td><td><div title="The price is significantly higher than the original MSRP; likely a scalper price.">Price Surge</div></td></tr>
      <tr><td>8/18/2026, 9:04:02 AM</td><td>$69.99</td><td><div title="The price is higher than the original MSRP.">Preorder (Above MSRP)</div></td></tr>
      <tr><td>7/10/2026, 3:36:23 PM</td><td>$49.99</td><td><div title="We estimate this price is basically the same as the original MSRP.">Out of Stock</div></td></tr>
      <tr><td>7/09/2026, 3:36:23 PM</td><td>$49.99</td><td><div title="We estimate this price is basically the same as the original MSRP.">In Stock</div></td></tr>
      <tr><td>7/08/2026, 3:36:23 PM</td><td>$39.99</td><td><div title="We estimate this price is below the original MSRP.">Sale</div></td></tr>
    </tbody></table>
  `));
  const estimate = estimateHistoryPrice(entries);
  assert.equal(estimate.price, 49.99);
  assert.equal(estimate.confidence, "history");
  assert.equal(estimate.samples, 3);
  assert.equal(estimate.observedAt, "2026-07-10T15:36:23.000Z");
});

test("one store toggle is selected per retailer, favoring exact history over product fallback", () => {
  const stores = chooseStoreListings([
    {
      retailer: "target", listingId: "2", sku: "1010892076", productUrl: "https://www.target.com/p/item/-/A-1010892076",
      historyUrl: "https://www.trackalacker.com/products/showcase/item/listings/2/item", status: "Out of Stock",
      historyEstimate: null, currentPrice: 69.99
    },
    {
      retailer: "target", listingId: "1", sku: "1010892077", productUrl: "https://www.target.com/p/item/-/A-1010892077",
      historyUrl: "https://www.trackalacker.com/products/showcase/item/listings/1/item", status: "Out of Stock",
      historyEstimate: { price: 49.99, confidence: "history", samples: 4, observedAt: "2026-07-10T15:36:23.000Z" }, currentPrice: 49.99
    }
  ], 59.99);
  assert.equal(stores.length, 1);
  assert.equal(stores[0].listingId, "1");
  assert.equal(stores[0].expectedPrice, 49.99);
  assert.equal(stores[0].priceConfidence, "history");
  assert.equal(stores[0].alternateCount, 1);
});
