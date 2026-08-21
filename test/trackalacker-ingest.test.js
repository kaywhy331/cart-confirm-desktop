"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  analyzePriceHistory,
  chooseStoreListings,
  estimateHistoryPrice,
  mergeCurrentPriceHistory,
  parseFollowedPage,
  parseHistoryPage,
  parseProductPage,
  parseProductPayload
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

test("followed pages read products and pagination from TrackaLacker React hydration data", () => {
  const props = {
    searchResultsProps: {
      results: [{
        product_id: 67890,
        name: "Scarlet & Violet Booster Bundle",
        show_path: "/products/showcase/scarlet-violet-booster-bundle",
        min_price: "26.94",
        max_price: "26.94",
        display_price: "$26.94",
        photo_items: [{ pad_300_300: "https://static.trackalacker.com/images/booster.jpg" }]
      }],
      pagination: { page: 1, total_pages: 9, total: 413 }
    }
  };
  const parsed = parseFollowedPage(doc(`
    <div data-react-class="products/YourProductsApp" data-react-props='${JSON.stringify(props)}'></div>
  `));
  assert.equal(parsed.requiresLogin, false);
  assert.equal(parsed.requiresChallenge, false);
  assert.equal(parsed.dataUnreadable, false);
  assert.equal(parsed.totalPages, 9);
  assert.deepEqual(parsed.items, [{
    sourceProductId: "67890",
    sourceUrl: "https://www.trackalacker.com/products/showcase/scarlet-violet-booster-bundle",
    title: "Scarlet & Violet Booster Bundle",
    imageUrl: "https://static.trackalacker.com/images/booster.jpg",
    displayPrice: 26.94
  }]);
});

test("followed pages distinguish a browser security challenge from a signed-out session", () => {
  const parsed = parseFollowedPage(doc(`
    <title>Just a moment...</title>
    <main>Performing security verification before continuing.</main>
  `));
  assert.equal(parsed.requiresChallenge, true);
  assert.equal(parsed.requiresLogin, false);
  assert.deepEqual(parsed.items, []);
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

test("product JSON itemizes exact retailer URLs and future stores", () => {
  const parsed = parseProductPayload({
    product: {
      name: "Scarlet & Violet Booster Bundle",
      slug: "scarlet-violet-booster-bundle",
      listings: [{
        id: 401,
        provider: { display_name: "Target" },
        url: "https://howl.link/target-route",
        preferred_product_url: "https://www.target.com/p/item/-/A-91234567",
        show_path: "/products/showcase/scarlet-violet-booster-bundle/listings/401/item",
        current_status: {
          price: "26.94",
          price_changed_at: "2026-08-20T18:30:00Z",
          short_stock_status_text: "In Stock",
          msrp_state: { code_str: "equal_to", full_text: "At MSRP" }
        }
      }, {
        id: 402,
        provider: { display_name: "Best Buy" },
        url: "https://www.bestbuy.com/site/item/12345.p",
        show_path: "/products/showcase/scarlet-violet-booster-bundle/listings/402/item",
        current_status: { price: 29.99, short_stock_status_text: "Out of Stock" }
      }]
    }
  }, {
    sourceProductId: "67890",
    sourceUrl: "https://www.trackalacker.com/products/showcase/scarlet-violet-booster-bundle",
    title: "Fallback"
  });
  assert.equal(parsed.title, "Scarlet & Violet Booster Bundle");
  assert.equal(parsed.listings.length, 2);
  assert.deepEqual(parsed.listings.map((listing) => [listing.listingId, listing.retailer, listing.store]), [
    ["401", "target", "Target"],
    ["402", "", "Best Buy"]
  ]);
  assert.equal(parsed.listings[0].outboundUrl, "https://www.target.com/p/item/-/A-91234567");
  assert.equal(parsed.listings[0].currentPrice, 26.94);
  assert.equal(parsed.listings[0].currentPriceChangedAt, "2026-08-20T18:30:00.000Z");
  assert.equal(parsed.listings[0].currentMsrpCode, "equal_to");
  assert.equal(parsed.listings[0].historyUrl, "https://www.trackalacker.com/products/showcase/scarlet-violet-booster-bundle/listings/401/item");
});

test("history analysis preserves spikes but uses the newest normal observation instead of an older modal price", () => {
  const entries = parseHistoryPage(doc(`
    <table><tbody>
      <tr><td>8/20/2026, 10:18:12 PM</td><td>$189.99</td><td><div title="The price is significantly higher than the original MSRP; likely a scalper price.">Out of Stock</div></td></tr>
      <tr><td>8/18/2026, 9:04:02 AM</td><td>$69.99</td><td><div title="The price is higher than the original MSRP.">Preorder (Above MSRP)</div></td></tr>
      <tr><td>8/17/2026, 3:36:23 PM</td><td>$44.99</td><td><div title="We estimate this price is basically the same as the original MSRP.">Out of Stock</div></td></tr>
      <tr><td>7/10/2026, 3:36:23 PM</td><td>$49.99</td><td><div title="We estimate this price is basically the same as the original MSRP.">Out of Stock</div></td></tr>
      <tr><td>7/09/2026, 3:36:23 PM</td><td>$49.99</td><td><div title="We estimate this price is basically the same as the original MSRP.">In Stock</div></td></tr>
      <tr><td>7/08/2026, 3:36:23 PM</td><td>$39.99</td><td><div title="We estimate this price is below the original MSRP.">Sale</div></td></tr>
    </tbody></table>
  `));
  const estimate = estimateHistoryPrice(entries);
  const analysis = analyzePriceHistory(entries);
  assert.equal(estimate.price, 44.99);
  assert.equal(estimate.confidence, "history");
  assert.equal(estimate.samples, 4);
  assert.equal(estimate.observedAt, "2026-08-17T15:36:23.000Z");
  assert.equal(analysis.history.length, 6);
  assert.deepEqual(analysis.history.slice(0, 3).map((entry) => entry.classification), ["surge", "above", "normal"]);
  assert.equal(analysis.summary.latestPrice, 189.99);
  assert.equal(analysis.summary.lowestPrice, 39.99);
  assert.equal(analysis.summary.highestPrice, 189.99);
  assert.equal(analysis.summary.normalLowPrice, 39.99);
  assert.equal(analysis.summary.normalHighPrice, 49.99);
  assert.equal(analysis.summary.surgeSamples, 1);
  assert.equal(analysis.summary.trend, "up");
  assert.equal(analysis.summary.changeAmount, 120);
});

test("history estimates read TrackaLacker React hydration data", () => {
  const props = {
    statuses: [{
      price: "69.99",
      created_at: "2026-08-18T09:05:02Z",
      price_changed_at: "2026-08-18T09:04:02Z",
      short_stock_status_text: "Preorder",
      msrp_state: { code_str: "above_msrp", full_text: "Above MSRP" }
    }, {
      price: "49.99",
      created_at: "2026-07-10T15:40:23Z",
      price_changed_at: "2026-07-10T15:36:23Z",
      short_stock_status_text: "Out of Stock",
      msrp_state: { code_str: "equal_to", full_text: "At MSRP" }
    }, {
      price: 49.99,
      created_at: "2026-07-09T15:40:23Z",
      price_changed_at: "2026-07-09T15:36:23Z",
      short_stock_status_text: "In Stock",
      msrp_state: { code_str: "equal_to", full_text: "At MSRP" }
    }]
  };
  const entries = parseHistoryPage(doc(`
    <div data-react-class="products/listings/RecentChanges" data-react-props='${JSON.stringify(props)}'></div>
  `));
  const estimate = estimateHistoryPrice(entries);
  assert.equal(entries.length, 3);
  assert.equal(estimate.price, 49.99);
  assert.equal(estimate.samples, 2);
  assert.equal(estimate.observedAt, "2026-07-10T15:36:23.000Z");
  assert.equal(estimate.priceChangedAt, "2026-07-10T15:36:23.000Z");
  assert.equal(entries[0].classification, "above");
});

test("the current listing status becomes the latest observation without duplicating its history row", () => {
  const historical = [{
    observedAt: "2026-08-19T18:30:00Z",
    priceChangedAt: "2026-08-19T18:00:00Z",
    price: 49.99,
    status: "In Stock",
    msrpCode: "equal_to",
    classification: "normal"
  }];
  const merged = mergeCurrentPriceHistory(historical, {
    currentPrice: 189.99,
    currentPriceChangedAt: "2026-08-20T18:00:00Z",
    status: "Price Surge",
    currentMsrpCode: "price_surge"
  }, "2026-08-20T20:00:00Z");
  const analysis = analyzePriceHistory(merged);
  assert.equal(analysis.history.length, 2);
  assert.equal(analysis.history[0].isCurrent, true);
  assert.equal(analysis.summary.latestPrice, 189.99);
  assert.equal(analysis.summary.latestClassification, "surge");
  assert.equal(analysis.summary.referencePrice, 49.99);

  const deduplicated = mergeCurrentPriceHistory(historical, {
    currentPrice: 49.99,
    currentPriceChangedAt: "2026-08-19T18:00:00Z",
    status: "In Stock",
    currentMsrpCode: "equal_to"
  }, "2026-08-20T20:00:00Z");
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].isCurrent, true);
  assert.equal(deduplicated[0].observedAt, "2026-08-20T20:00:00.000Z");
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

test("history capture is bounded and omits long classification prose from the loopback payload", () => {
  const entries = Array.from({ length: 55 }, (_, index) => ({
    observedAt: new Date(Date.parse("2026-08-20T20:00:00Z") - index * 60_000).toISOString(),
    priceChangedAt: new Date(Date.parse("2026-08-20T19:59:00Z") - index * 60_000).toISOString(),
    price: 49.99 + index,
    status: "x".repeat(60),
    msrpCode: "equal_to",
    assessment: "x".repeat(500)
  }));
  const analysis = analyzePriceHistory(entries);
  assert.equal(analysis.history.length, 50);
  assert.equal("assessment" in analysis.history[0], false);
  const store = {
    retailer: "target",
    listingId: "301",
    productUrl: "https://www.target.com/p/item/-/A-1010892076",
    historyUrl: "https://www.trackalacker.com/products/showcase/item/listings/301/item",
    priceHistory: analysis.history,
    priceHistorySummary: analysis.summary
  };
  const worstSupportedStorePayload = JSON.stringify({
    phase: "product",
    item: { sourceProductId: "1", title: "x".repeat(80), stores: [store, store, store] }
  });
  assert.ok(Buffer.byteLength(worstSupportedStorePayload) < 64 * 1024);
});
