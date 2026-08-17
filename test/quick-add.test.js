"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const Retailers = require("../extension/retailers");
const { hasUsablePrice, inspectProductPage } = require("../extension/quick-add");

function inspect(html, url) {
  const dom = new JSDOM(html, { url });
  const result = inspectProductPage(dom.window.document, url, Retailers);
  dom.window.close();
  return result;
}

test("Quick add reads an exact Target ID, title, current price, and query-free URL", () => {
  const result = inspect(`
    <h1 data-test="product-title">Pokémon Booster Bundle</h1>
    <div data-test="product-price">$34.99</div>
    <button id="addToCartButtonOrTextIdFor1011209279">Add to cart</button>
  `, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279?ref=tracking");
  assert.equal(result.retailer, "target");
  assert.equal(result.sku, "1011209279");
  assert.equal(result.title, "Pokémon Booster Bundle");
  assert.equal(result.price, 34.99);
  assert.equal(result.productUrl, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279");
  assert.equal(result.firstParty, true);
});

test("Quick add reads Walmart and Amazon product data through their existing adapters", () => {
  const walmart = inspect(`
    <h1 data-automation-id="product-title">Trading Card Collection</h1>
    <section>
      <span data-automation-id="product-price">Now $31.97</span>
      <span data-testid="seller-fulfilled">Sold and shipped by Walmart.com</span>
      <button data-automation-id="add-to-cart">Add to cart</button>
    </section>
  `, "https://www.walmart.com/ip/trading-card-collection/95163305?athbdg=L1100");
  assert.equal(walmart.sku, "95163305");
  assert.equal(walmart.price, 31.97);
  assert.equal(walmart.productUrl, "https://www.walmart.com/ip/95163305");
  assert.equal(walmart.firstParty, true);

  const amazon = inspect(`
    <h1 id="productTitle">Pokémon Elite Trainer Box</h1>
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$49.99</span></span></div>
    <div id="shipsFromSoldBy_feature_div">Ships from Amazon.com Sold by Amazon.com</div>
    <input id="add-to-cart-button" value="Add to Cart">
  `, "https://www.amazon.com/Pokemon-Elite-Trainer-Box/dp/B0ABC12345?tag=tracking-20");
  assert.equal(amazon.sku, "B0ABC12345");
  assert.equal(amazon.price, 49.99);
  assert.equal(amazon.productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(amazon.firstParty, true);
});

test("Quick add keeps a missing retailer price explicit and rejects non-product pages", () => {
  const missing = inspect("<h1>Unavailable Pokémon Box</h1>", "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(missing.price, null);
  assert.throws(
    () => inspectProductPage(new JSDOM("<h1>Cart</h1>").window.document, "https://www.target.com/cart", Retailers),
    /product page/
  );
});

test("Quick add accepts only present, finite, positive prices", () => {
  assert.equal(hasUsablePrice(34.99), true);
  assert.equal(hasUsablePrice(" 34.99 "), true);
  for (const value of [null, undefined, "", "   ", 0, "0", -1, Number.POSITIVE_INFINITY, true]) {
    assert.equal(hasUsablePrice(value), false);
  }
});

test("Quick add captures the full affiliate URL alongside the canonical product link", () => {
  const affiliate = "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279?nrtv_cid=8k7bjebavog09&clkid=63477bc3&afid=Howl%20Technologies%2C%20Inc.";
  const decorated = inspect(`
    <h1 data-test="product-title">Pokémon Booster Bundle</h1>
    <div data-test="product-price">$34.99</div>
    <button id="addToCartButtonOrTextIdFor1011209279">Add to cart</button>
  `, affiliate);
  assert.equal(decorated.productUrl, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279");
  assert.equal(decorated.affiliateOpenUrl, affiliate);

  const plain = inspect(`
    <h1 data-test="product-title">Pokémon Booster Bundle</h1>
    <div data-test="product-price">$34.99</div>
    <button id="addToCartButtonOrTextIdFor1011209279">Add to cart</button>
  `, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279");
  assert.equal(plain.affiliateOpenUrl, "");
});

