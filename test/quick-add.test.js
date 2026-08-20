"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
    <meta property="og:image" content="https://target.scene7.com/is/image/Target/GUEST_booster">
    <h1 data-test="product-title">Pokémon Booster Bundle</h1>
    <div data-test="product-price">$34.99</div>
    <button id="addToCartButtonOrTextIdFor1011209279">Add to cart</button>
  `, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279?ref=tracking");
  assert.equal(result.retailer, "target");
  assert.equal(result.sku, "1011209279");
  assert.equal(result.title, "Pokémon Booster Bundle");
  assert.equal(result.imageUrl, "https://target.scene7.com/is/image/Target/GUEST_booster");
  assert.equal(result.price, 34.99);
  assert.equal(result.productUrl, "https://www.target.com/p/pokemon-booster-bundle/-/A-1011209279");
  assert.equal(result.firstParty, true);
});

test("Quick add reads Walmart and Amazon product data through their existing adapters", () => {
  const walmart = inspect(`
    <h1 data-automation-id="product-title">Trading Card Collection</h1>
    <img data-testid="hero-image" src="https://i5.walmartimages.com/seo/card-collection.jpg">
    <section>
      <span data-automation-id="product-price">Now $31.97</span>
      <span data-testid="seller-fulfilled">Sold and shipped by Walmart.com</span>
      <button data-automation-id="add-to-cart">Add to cart</button>
    </section>
  `, "https://www.walmart.com/ip/trading-card-collection/95163305?athbdg=L1100");
  assert.equal(walmart.sku, "95163305");
  assert.equal(walmart.price, 31.97);
  assert.equal(walmart.productUrl, "https://www.walmart.com/ip/95163305");
  assert.equal(walmart.imageUrl, "https://i5.walmartimages.com/seo/card-collection.jpg");
  assert.equal(walmart.firstParty, true);

  const amazon = inspect(`
    <h1 id="productTitle">Pokémon Elite Trainer Box</h1>
    <img id="landingImage" src="https://m.media-amazon.com/images/I/small.jpg" data-old-hires="https://m.media-amazon.com/images/I/large.jpg">
    <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$49.99</span></span></div>
    <div id="shipsFromSoldBy_feature_div">Ships from Amazon.com Sold by Amazon.com</div>
    <input id="add-to-cart-button" value="Add to Cart">
  `, "https://www.amazon.com/Pokemon-Elite-Trainer-Box/dp/B0ABC12345?tag=tracking-20");
  assert.equal(amazon.sku, "B0ABC12345");
  assert.equal(amazon.price, 49.99);
  assert.equal(amazon.productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(amazon.imageUrl, "https://m.media-amazon.com/images/I/large.jpg");
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

test("a duplicate quick add attaches captured affiliate and image metadata to the existing mission", () => {
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");

  // The duplicate branch merges a validated capture into the stored mission
  // and re-broadcasts config so the extension picks up the new open URL.
  const duplicateBranch = main.slice(main.indexOf("function quickAddMissionRequest"));
  assert.match(duplicateBranch, /const affiliateUpdated = Boolean\(product\.affiliateOpenUrl\)\s*&& product\.affiliateOpenUrl !== existing\.affiliateOpenUrl;/);
  assert.match(duplicateBranch, /const imageUpdated = Boolean\(product\.imageUrl\)\s*&& product\.imageUrl !== existing\.imageUrl;/);
  assert.match(duplicateBranch, /if \(affiliateUpdated \|\| imageUpdated\) \{[\s\S]*?persistSettings\(\);[\s\S]*?configVersion \+= 1;[\s\S]*?broadcast\(\);[\s\S]*?\}/);
  assert.match(duplicateBranch, /duplicate: true,\s*affiliateUpdated,\s*imageUpdated,/);
  assert.match(main, /event\.imageUrl && event\.imageUrl !== product\.imageUrl[\s\S]*?persistSettings\(\);[\s\S]*?configVersion \+= 1;/);

  // The popup tells the user which of the two duplicate outcomes happened.
  assert.match(popup, /product thumbnail/);
  assert.match(popup, /Affiliate Link Attached/);
});
