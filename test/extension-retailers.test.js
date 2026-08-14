"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const {
  detectRetailer,
  extractSkuFromUrl,
  getAdapter,
  isFirstPartyText,
  parsePrice,
  parseWalmartQueue,
  walmartHoldingQueue
} = require("../extension/retailers");

test("extension helpers recognize supported retailer product pages", () => {
  assert.equal(detectRetailer("https://www.target.com/p/name/-/A-123456789"), "target");
  assert.equal(detectRetailer("https://www.walmart.com/ip/name/987654321"), "walmart");
  assert.equal(detectRetailer("https://www.amazon.com/name/dp/B0ABC12345"), "amazon");
  assert.equal(extractSkuFromUrl("target", "https://www.target.com/p/name/-/A-123456789"), "123456789");
  assert.equal(extractSkuFromUrl("walmart", "https://www.walmart.com/ip/name/987654321"), "987654321");
  assert.equal(extractSkuFromUrl("walmart", "https://www.walmart.com/affil/cart/buynow?items=19952559023"), "19952559023");
  assert.equal(extractSkuFromUrl("amazon", "https://www.amazon.com/name/dp/b0abc12345"), "B0ABC12345");
  assert.equal(extractSkuFromUrl("amazon", "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=b0abc12345&Quantity.1=1"), "B0ABC12345");
  assert.equal(extractSkuFromUrl("amazon", "https://www.amazon.com/gp/buy/express/handlers/display.html?ASIN=b0abc12345&quantity=1"), "B0ABC12345");
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
    identityVerified: true,
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

test("Walmart product-route holding pages require exact identity and explicit queue evidence", () => {
  const product = { sku: "987654321" };
  const holding = { body: { textContent: "High demand. You’re in line in our virtual queue. Please stay on this page." }, querySelector: () => null };
  assert.deepEqual(
    walmartHoldingQueue(holding, "https://www.walmart.com/ip/pokemon/987654321", product),
    { itemId: "987654321", queued: true, state: "holding", soldOut: false }
  );
  assert.equal(getAdapter("walmart").pageKind("https://www.walmart.com/ip/pokemon/987654321", holding, product), "queue");
  assert.equal(walmartHoldingQueue(holding, "https://www.walmart.com/ip/pokemon/111111111", product), null);
  assert.equal(walmartHoldingQueue(
    { body: { textContent: "High demand. Please try again later." }, querySelector: () => null },
    "https://www.walmart.com/ip/pokemon/987654321",
    product
  ), null);
});

test("Walmart product-route holding pages reject hidden stale queue evidence", () => {
  const product = { sku: "987654321" };
  const url = "https://www.walmart.com/ip/pokemon/987654321";
  for (const hiddenMarkup of [
    "<main style='display:none' data-testid='waiting-room'>High demand. You’re in line in our virtual queue. Please stay on this page.</main>",
    "<main aria-hidden='true' data-testid='waiting-room'>High demand. You’re in line in our virtual queue. Please stay on this page.</main>",
    "<section style='visibility:hidden'><main data-testid='waiting-room'>High demand. You’re in line in our virtual queue. Please stay on this page.</main></section>"
  ]) {
    const doc = new JSDOM(`<body>${hiddenMarkup}<main>Product details</main></body>`).window.document;
    assert.equal(walmartHoldingQueue(doc, url, product), null);
    assert.equal(getAdapter("walmart").pageKind(url, doc, product), "product");
  }
});

test("Target checkout routes include co-cart while authentication stays manual", () => {
  const target = getAdapter("target");
  assert.equal(target.pageKind("https://www.target.com/co-cart"), "cart");
  assert.equal(target.pageKind("https://www.target.com/co-pickup"), "checkout");
  assert.equal(target.pageKind("https://www.target.com/co-delivery"), "checkout");
  assert.equal(target.pageKind("https://www.target.com/co-payment"), "checkout");
  assert.equal(target.pageKind("https://www.target.com/co-review"), "checkout");
  assert.equal(target.pageKind("https://www.target.com/login"), "auth");
  assert.equal(target.pageKind("https://www.target.com/account"), "auth");
});

test("Target product-page sign-in extras do not masquerade as an authentication wall", () => {
  const target = getAdapter("target");
  const doc = new JSDOM(`<body><main>
    <h1>Pokémon 30th Collection Tin Trading Cards (Styles May Vary)</h1>
    <button aria-label="sign in to favorite Pokémon 30th Collection Tin Trading Cards to keep tabs on it"></button>
    <button data-test="registryListButton" aria-label="sign in to add item to registry and wish list">Sign in</button>
    <button data-test="writeReviewPdp" aria-label="sign in to write a review">Write a review</button>
    <button id="addToCartButtonOrTextIdFor1010892069" disabled>Add to cart</button>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-1010892069" }).window.document;

  assert.equal(target.interactivePageState(doc), "");
});

test("Target distinguishes package wording from an explicit purchase limit", () => {
  const target = getAdapter("target");
  const doc = new JSDOM(`<body><main>
    <div role="alert">Limit 2 per order</div>
    <div data-test="@web/ProductDetailPageHighlights">
      <h2>Highlights</h2>
      <ul><li>Styles May Vary</li><li>1 Tin per Order</li></ul>
    </div>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-1010892069" }).window.document;

  // Package-count copy without an explicit limit marker is not a quantity cap.
  assert.equal(target.visibleQuantityLimit(doc, { retailer: "target", sku: "1010892069" }), 2);
});

for (const retailer of ["target", "walmart", "amazon"]) {
  test(`${retailer} classifies MFA, location, and membership interstitials for manual handling`, () => {
    const adapter = getAdapter(retailer);
    const page = (markup) => new JSDOM(`<body><main>${markup}</main></body>`).window.document;
    assert.equal(adapter.interactivePageState(page(`<label>Verification code <input name="otp" autocomplete="one-time-code"></label>`)), "mfa");
    assert.equal(adapter.interactivePageState(page(`<div role="dialog"><button>Choose your pickup store</button></div>`)), "location");
    assert.equal(adapter.interactivePageState(page(`<div role="dialog"><button>Join ${retailer === "amazon" ? "Prime" : retailer === "walmart" ? "Walmart+" : "Target Circle 360"} free trial</button></div>`)), "membership");
    assert.equal(adapter.interactivePageState(page(`<div role="dialog"><h2>Sign in</h2><button>Continue</button></div>`)), "auth");
    assert.equal(adapter.interactivePageState(page(`<button>Place your order</button>`)), "");
  });
}
