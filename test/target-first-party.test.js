"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const { getAdapter } = require("../extension/retailers");
const { effectiveLineOffer } = require("../extension/safety");

const PRODUCT = {
  id: "target:95298172",
  retailer: "target",
  sku: "95298172",
  maxPrice: 50,
  maxOrderTotal: 60,
  quantity: 1,
  action: "cart",
  fulfillmentMode: "manual",
  enabled: true
};

function productPage(extraMarkup = "") {
  return new JSDOM(`<body><main>
    <h1>Trading Cards Booster Box</h1>
    <div data-test="product-price">$39.99</div>
    ${extraMarkup}
    <div><button id="addToCartButtonOrTextIdFor95298172" aria-label="Add to cart">Add to cart</button></div>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-95298172" }).window.document;
}

function cartPage(extraLineMarkup = "") {
  return new JSDOM(`<body><main>
    <div data-test="cart-item" data-tcin="95298172">
      <a href="https://www.target.com/p/restocks/-/A-95298172">Trading Cards Booster Box</a>
      ${extraLineMarkup}
      <span data-test="cart-item-price">$39.99</span>
      <select aria-label="Quantity"><option value="1" selected>1</option></select>
      <button aria-label="Remove item">Remove</button>
    </div>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document;
}

test("a target product page without any marketplace label is first-party", () => {
  const offer = getAdapter("target").offer(productPage(), PRODUCT);
  assert.equal(offer.firstParty, true);
  assert.equal(offer.available, true);
  assert.equal(offer.price, 39.99);
});

test("an explicit target marketplace seller label stays third-party", () => {
  const offer = getAdapter("target").offer(
    productPage("<div data-test='marketplace-seller'>Sold and shipped by Acme Collectibles</div>"),
    PRODUCT
  );
  assert.equal(offer.firstParty, false);
  assert.match(offer.seller, /Acme Collectibles/);
});

test("a marketplace marker anywhere on the target page fails closed", () => {
  const offer = getAdapter("target").offer(
    productPage("<p>This item ships from a Target Plus Partner.</p>"),
    PRODUCT
  );
  assert.equal(offer.firstParty, false);
});

test("target shipping-date copy in the seller region is not treated as third-party", () => {
  const offer = getAdapter("target").offer(
    productPage("<div data-test='fulfillment-cell'>Get it shipped by Thu, Aug 14</div>"),
    PRODUCT
  );
  assert.equal(offer.firstParty, true);
});

test("an unlabeled target cart line passes the first-party line check", () => {
  const adapter = getAdapter("target");
  const line = adapter.findLine(cartPage(), PRODUCT);
  assert.equal(line.firstParty, true);
  const offer = effectiveLineOffer(PRODUCT, line);
  assert.equal(offer.ok, true);
  assert.equal(offer.price, 39.99);
});

test("a marketplace-labeled target cart line stays blocked", () => {
  const adapter = getAdapter("target");
  const line = adapter.findLine(cartPage("<span>Sold and shipped by Acme Ltd</span>"), PRODUCT);
  assert.equal(line.firstParty, false);
  assert.equal(effectiveLineOffer(PRODUCT, line).ok, false);
});

test("walmart still requires an explicit first-party seller label", () => {
  const doc = new JSDOM(`<body><main>
    <div data-automation-id="product-price">$24.50</div>
    <button data-automation-id="add-to-cart">Add to cart</button>
  </main></body>`, { url: "https://www.walmart.com/ip/123456789" }).window.document;
  const offer = getAdapter("walmart").offer(doc);
  assert.equal(offer.firstParty, false);
});
