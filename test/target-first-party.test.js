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

test("a shipping blurb hiding the DOM price falls back to the JSON-LD product record", () => {
  const doc = new JSDOM(`<body><main>
    <h1>Trading Cards Booster Box</h1>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"Product","sku":"95298172",
        "url":"https://www.target.com/p/restocks/-/A-95298172",
        "offers":{"@type":"Offer","price":"27.99","priceCurrency":"USD"}}]}
    </script>
    <div>
      <div data-test="fulfillment-cell">Ships free with RedCard or $35 orders</div>
      <button id="addToCartButtonOrTextIdFor95298172" aria-label="Add to cart">Add to cart</button>
    </div>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-95298172" }).window.document;
  const offer = getAdapter("target").offer(doc, PRODUCT);
  assert.equal(offer.price, 27.99);
  assert.equal(offer.firstParty, true);
  assert.equal(offer.seller, "", "fulfillment copy must not be reported as a seller name");
});

test("a JSON-LD record for a different product is not borrowed", () => {
  const doc = new JSDOM(`<body><main>
    <script type="application/ld+json">
      [{"@type":"Product","sku":"111111","offers":{"price":"9.99"}},
       {"@type":"Product","sku":"222222","offers":{"price":"19.99"}}]
    </script>
    <div data-test="fulfillment-cell">Ships free with RedCard or $35 orders</div>
    <button id="addToCartButtonOrTextIdFor95298172" aria-label="Add to cart">Add to cart</button>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-95298172" }).window.document;
  const offer = getAdapter("target").offer(doc, PRODUCT);
  assert.equal(offer.price, null);
});

test("a single unkeyed JSON-LD product record is accepted as the page's product", () => {
  const doc = new JSDOM(`<body><main>
    <script type="application/ld+json">
      {"@type":"Product","name":"Trading Cards","offers":{"lowPrice":"31.49"}}
    </script>
    <div data-test="fulfillment-cell">Ships free with RedCard or $35 orders</div>
    <button id="addToCartButtonOrTextIdFor95298172" aria-label="Add to cart">Add to cart</button>
  </main></body>`, { url: "https://www.target.com/p/restocks/A-95298172" }).window.document;
  assert.equal(getAdapter("target").offer(doc, PRODUCT).price, 31.49);
});

test("cart quantity reads steppers and never parses add-on option values", () => {
  const doc = new JSDOM(`<body><main>
    <div data-test="cart-item" data-tcin="95298172">
      <a href="https://www.target.com/p/restocks/-/A-95298172">Trading Cards Booster Box</a>
      <span data-test="cart-item-price">$39.99</span>
      <select><option value="2-year-plan" selected>2-year protection plan</option></select>
      <div role="spinbutton" aria-valuenow="1" aria-label="quantity"></div>
      <button aria-label="Remove item">Remove</button>
    </div>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document;
  const line = getAdapter("target").findLine(doc, PRODUCT);
  assert.equal(line.quantity, 1, "spinbutton value wins; '2-year-plan' must not parse as 2");
});

test("a cart line without any quantity control reads null instead of a guess", () => {
  const line = getAdapter("target").findLine(new JSDOM(`<body><main>
    <div data-test="cart-item" data-tcin="95298172">
      <a href="https://www.target.com/p/restocks/-/A-95298172">Trading Cards Booster Box</a>
      <span data-test="cart-item-price">$39.99</span>
      <button aria-label="Remove item">Remove</button>
    </div>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document, PRODUCT);
  assert.equal(line.quantity, null);
});

test("a Target recommendation link cannot masquerade as a cart line", () => {
  const doc = new JSDOM(`<body><main>
    <h1>Your cart is empty</h1>
    <section data-test="recommended-products">
      <a href="https://www.target.com/p/restocks/-/A-95298172">Trading Cards Booster Box</a>
      <span data-test="product-price">$39.99</span>
      <button aria-label="Add to cart">Add to cart</button>
    </section>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document;
  const adapter = getAdapter("target");

  assert.equal(adapter.findLine(doc, PRODUCT), null);
  assert.equal(adapter.cartInventory(doc).complete, false);
  assert.deepEqual(adapter.cartInventory(doc).ids, []);
});

test("a Target recommendation Add button cannot qualify a missing exact product", () => {
  const doc = new JSDOM(`<body>
    <header><a data-test="@web/CartLink" aria-label="cart 0 items" href="/cart">Cart</a></header>
    <main>
      <h1>Page not found</h1>
      <div data-test="product-price">$34.99</div>
      <section data-test="recommended-products">
        <article data-test="product-card">
          <a href="https://www.target.com/p/other/-/A-11111111">Other product</a>
          <button data-test="shipItButton" aria-label="Add to cart">Add to cart</button>
        </article>
      </section>
    </main>
  </body>`, { url: "https://www.target.com/p/-/A-95298172" }).window.document;
  const offer = getAdapter("target").offer(doc, PRODUCT);

  assert.equal(offer.addButton, null);
  assert.equal(offer.available, false);
});

test("Target exposes a readable header cart count for Add settlement and empty-cart proof", () => {
  const doc = new JSDOM(`<body><header>
    <a data-test="@web/CartLink" aria-label="cart 2 items" href="/cart">Cart</a>
  </header></body>`, { url: "https://www.target.com/p/-/A-95298172" }).window.document;
  assert.equal(getAdapter("target").cartItemCount(doc), 2);
});

test("walmart still requires an explicit first-party seller label", () => {
  const doc = new JSDOM(`<body><main>
    <div data-automation-id="product-price">$24.50</div>
    <button data-automation-id="add-to-cart">Add to cart</button>
  </main></body>`, { url: "https://www.walmart.com/ip/123456789" }).window.document;
  const offer = getAdapter("walmart").offer(doc);
  assert.equal(offer.firstParty, false);
});

test("the product-page proof backfills a cart line's missing seller and unit price", () => {
  const proof = { firstParty: true, seller: "Sold by Target", price: 39.99 };
  // Hydrating cart line: no seller text, no readable price yet.
  const bare = { seller: "", firstParty: false, price: Number.NaN, quantity: 1 };
  const backed = effectiveLineOffer(PRODUCT, bare, proof);
  assert.equal(backed.ok, true);
  assert.equal(backed.price, 39.99);
  assert.equal(backed.firstParty, true);
  // Quantity-multiplied subtotal above the unit cap resolves to the proof unit price.
  const subtotal = { seller: "", firstParty: true, price: 79.98, quantity: 2 };
  const resolved = effectiveLineOffer({ ...PRODUCT, quantity: 2 }, subtotal, proof);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.price, 39.99);
  // A visibly third-party line stays blocked no matter what the proof says.
  const marketplace = { seller: "Sold and shipped by Acme Ltd", firstParty: false, price: 39.99, quantity: 1 };
  assert.equal(effectiveLineOffer(PRODUCT, marketplace, proof).reason, "third-party");
  // Without any proof, the hydrating line still fails closed.
  assert.equal(effectiveLineOffer(PRODUCT, bare).ok, false);
});

test("the cart-stage line check consumes the durable product-page proof", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(source, /Safety\.effectiveLineOffer\(product, line, await proofFor\(product\), await staleProofFor\(product\)\)/);
  assert.match(source, /first-party seller could not be verified here or on the recent product page/);
});

test("an aged price anchor corrects a quantity subtotal but never backfills seller or a missing price", () => {
  const stale = { firstParty: true, seller: "Sold by Target", price: 34.99 };
  const twoUp = { ...PRODUCT, maxPrice: 35, quantity: 2 };
  // Subtotal $69.98 over the $35 unit cap resolves via arithmetic even when
  // the fresh proof is gone (cart older than the proof freshness window).
  const subtotal = { seller: "", firstParty: true, price: 69.98, quantity: 2 };
  const resolved = effectiveLineOffer(twoUp, subtotal, null, stale);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.price, 34.99);
  // A changed price breaks the arithmetic match and still fails closed.
  const drifted = effectiveLineOffer(twoUp, { ...subtotal, price: 89.98 }, null, stale);
  assert.equal(drifted.ok, false);
  assert.equal(drifted.reason, "over-price");
  // The stale anchor must not stand in for fresh seller/first-party proof...
  const unlabeled = { seller: "", firstParty: false, price: 69.98, quantity: 2 };
  assert.equal(effectiveLineOffer(twoUp, unlabeled, null, stale).reason, "seller-unverified");
  // ...nor for a missing price.
  const blank = { seller: "", firstParty: true, price: Number.NaN, quantity: 2 };
  assert.equal(effectiveLineOffer(twoUp, blank, null, stale).reason, "price-unavailable");
});
