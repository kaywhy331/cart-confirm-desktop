"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const { getAdapter } = require("../extension/retailers");
const {
  CART_PROOF_MAX_AGE_MS,
  checkoutSafety,
  effectiveLineOffer,
  verifySingleProductCart
} = require("../extension/safety");

const CASES = [
  { retailer: "target", sku: "1011960739", unit: 39.99, total: 86.38, cap: 100 },
  { retailer: "walmart", sku: "123456789", unit: 24.5, total: 53.27, cap: 70 },
  { retailer: "amazon", sku: "B0ABC12345", unit: 12.5, total: 27.44, cap: 40 }
];

function fixture(retailer) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", `${retailer}-cart.html`), "utf8");
  return new JSDOM(html, { url: `https://www.${retailer}.com/cart` }).window.document;
}

function productFor(entry) {
  return {
    id: `${entry.retailer}:${entry.sku}`,
    retailer: entry.retailer,
    sku: entry.sku,
    maxPrice: entry.unit + 1,
    maxOrderTotal: entry.cap,
    quantity: 2,
    action: "checkout",
    fulfillmentMode: "shipping",
    enabled: true
  };
}

for (const entry of CASES) {
  test(`${entry.retailer} DOM adapter enumerates the cart and reads final-order evidence`, () => {
    const doc = fixture(entry.retailer);
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const inventory = adapter.cartInventory(doc);
    const line = adapter.findLine(doc, product);

    assert.equal(inventory.complete, true);
    assert.deepEqual(inventory.ids, [entry.sku]);
    assert.equal(line.quantity, 2);
    assert.equal(line.price, entry.unit);
    assert.equal(line.firstParty, true);
    assert.equal(adapter.orderTotal(doc), entry.total);

    const now = 100_000;
    const proof = {
      productId: product.id,
      source: "cart",
      quantityConfirmed: true,
      inventoryConfirmed: true,
      cartLineCount: 1,
      cartSku: product.sku,
      firstParty: true,
      seller: line.seller,
      price: line.price,
      cartConfirmedAt: now - 1_000
    };
    assert.equal(checkoutSafety({
      product,
      inventory,
      line,
      proof,
      orderTotal: entry.total,
      fulfillmentMode: adapter.fulfillmentMode(doc),
      now
    }).ok, true);
  });
}

test("cart enumeration fails closed for unknown and extra line items", () => {
  const doc = fixture("target");
  const adapter = getAdapter("target");
  const product = productFor(CASES[0]);
  const unknown = doc.createElement("div");
  unknown.setAttribute("data-test", "cart-item");
  unknown.innerHTML = "<span>$9.99</span><button aria-label='Remove item'>Remove</button>";
  doc.querySelector("main").append(unknown);

  const inventory = adapter.cartInventory(doc);
  assert.equal(inventory.complete, false);
  assert.equal(verifySingleProductCart(product, inventory).reason, "cart-unverified");

  unknown.setAttribute("data-tcin", "9999999999");
  const completeWithExtra = adapter.cartInventory(doc);
  assert.equal(completeWithExtra.complete, true);
  assert.equal(verifySingleProductCart(product, completeWithExtra).reason, "manual-action-required");
});

test("an extra line outside known retailer selectors is found through an independent remove control", () => {
  const doc = fixture("target");
  const adapter = getAdapter("target");
  const product = productFor(CASES[0]);
  const unknownMarkup = doc.createElement("section");
  unknownMarkup.innerHTML = `
    <a href="https://www.target.com/p/other/-/A-9999999999">Other product</a>
    <span>$4.99</span>
    <button aria-label="Remove item">Remove</button>
  `;
  doc.querySelector("main").append(unknownMarkup);

  const inventory = adapter.cartInventory(doc);
  assert.equal(inventory.complete, true);
  assert.deepEqual(inventory.ids.sort(), [product.sku, "9999999999"].sort());
  assert.equal(inventory.independentlyCounted, true);
  assert.equal(verifySingleProductCart(product, inventory).reason, "manual-action-required");
});

test("checkout workflow requires fresh cart proof and a readable capped total", () => {
  const entry = CASES[2];
  const product = productFor(entry);
  const adapter = getAdapter(entry.retailer);
  const doc = fixture(entry.retailer);
  const inventory = adapter.cartInventory(doc);
  const line = adapter.findLine(doc, product);
  const now = 500_000;
  const proof = {
    productId: product.id,
    source: "cart",
    quantityConfirmed: true,
    inventoryConfirmed: true,
    cartLineCount: 1,
    cartSku: product.sku,
    firstParty: true,
    seller: line.seller,
    price: line.price,
    cartConfirmedAt: now - 1_000
  };

  const fulfillmentMode = adapter.fulfillmentMode(doc);
  assert.equal(checkoutSafety({ product, inventory, line, proof, orderTotal: null, fulfillmentMode, now }).reason, "total-unavailable");
  assert.equal(checkoutSafety({ product, inventory, line, proof, orderTotal: product.maxOrderTotal + 0.01, fulfillmentMode, now }).reason, "over-total");
  assert.equal(checkoutSafety({
    product,
    inventory,
    line,
    proof: { ...proof, cartConfirmedAt: now - CART_PROOF_MAX_AGE_MS - 1 },
    orderTotal: entry.total,
    fulfillmentMode,
    now
  }).reason, "cart-unverified");
});

test("current cart seller and price cannot be borrowed from product-page proof", () => {
  const product = productFor(CASES[0]);
  const staleLine = { seller: "", firstParty: false, price: null, quantity: 2 };
  assert.equal(effectiveLineOffer(product, staleLine).reason, "seller-unverified");
  assert.equal(effectiveLineOffer(product, { seller: "Sold by Target", firstParty: true, price: Number.NaN, quantity: 2 }).reason, "price-unavailable");
});

test("overload pages are classified separately from stock state", () => {
  const doc = new JSDOM("<body><h1>Service temporarily unavailable</h1><p>Please try again later.</p></body>").window.document;
  assert.equal(getAdapter("target").storeError(doc), "traffic-overload");
});

test("Target overload dialogs expose only a scoped, actionable dismissal", () => {
  const adapter = getAdapter("target");
  const overload = new JSDOM(`
    <body>
      <div role="dialog">
        <p>Something went wrong. Please try again later.</p>
        <button>OK</button>
      </div>
    </body>
  `).window.document;
  assert.equal(adapter.storeErrorDismissButton(overload)?.textContent, "OK");

  const unrelated = new JSDOM(`
    <body><div role="dialog"><p>Join Target Circle today.</p><button>OK</button></div></body>
  `).window.document;
  assert.equal(adapter.storeErrorDismissButton(unrelated), null);

  const challenge = new JSDOM(`
    <body><div role="dialog"><p>Security challenge: verify you're human. Unusual traffic.</p><button>OK</button></div></body>
  `).window.document;
  assert.equal(adapter.storeErrorDismissButton(challenge), null);
});

test("submission failure requires explicit proof that the order was not placed", () => {
  const adapter = getAdapter("walmart");
  const doc = (text) => new JSDOM(`<body><main>${text}</main></body>`).window.document;
  assert.equal(adapter.storeError(doc("Something went wrong. Try again.")), "store-error");
  assert.equal(adapter.submissionFailure(doc("Something went wrong. Try again.")), false);
  assert.equal(adapter.submissionFailure(doc("Your order was not placed.")), true);
  assert.equal(adapter.submissionFailure(doc("We were unable to process your order.")), true);
  assert.equal(adapter.submissionFailure(doc("Payment declined.")), true);
  assert.equal(adapter.submissionFailure(doc(`${"Help text. ".repeat(600)} Payment declined.`)), false);
  const alert = new JSDOM(`<body>${"Help text. ".repeat(600)}<div role="alert">Payment declined.</div></body>`).window.document;
  assert.equal(adapter.submissionFailure(alert), true);
});

test("confirmation requires a retailer-specific confirmation container", () => {
  const adapter = getAdapter("walmart");
  const broadText = "<body><p>Thank you for your order. Order number 123.</p></body>";
  assert.equal(adapter.orderConfirmed(new JSDOM(broadText).window.document), false);

  const rooted = "<body><main data-automation-id='order-confirmation'>Thank you for your order. Order number 123.</main></body>";
  assert.equal(adapter.orderConfirmed(new JSDOM(rooted).window.document), true);
});

test("selected recurring and add-on choices block automatic submission", () => {
  const entry = CASES[2];
  const product = productFor(entry);
  const adapter = getAdapter("amazon");
  const doc = fixture("amazon");
  const choice = doc.createElement("label");
  choice.innerHTML = "<input type='checkbox' checked name='protection-plan'> Add a protection plan";
  doc.body.append(choice);
  const unsafeChoices = adapter.unsafeOrderChoices(doc);
  assert.equal(unsafeChoices.length, 1);

  const inventory = adapter.cartInventory(doc);
  const line = adapter.findLine(doc, product);
  const proof = {
    productId: product.id,
    source: "cart",
    quantityConfirmed: true,
    inventoryConfirmed: true,
    cartLineCount: 1,
    cartSku: product.sku,
    firstParty: true,
    seller: line.seller,
    price: line.price,
    cartConfirmedAt: 9_000
  };
  assert.equal(checkoutSafety({
    product,
    inventory,
    line,
    proof,
    orderTotal: entry.total,
    unsafeChoices,
    fulfillmentMode: adapter.fulfillmentMode(doc),
    now: 10_000
  }).reason, "manual-action-required");
});

test("automatic submission requires the configured fulfillment mode", () => {
  const entry = CASES[1];
  const product = { ...productFor(entry), fulfillmentMode: "pickup" };
  const adapter = getAdapter("walmart");
  const doc = fixture("walmart");
  const inventory = adapter.cartInventory(doc);
  const line = adapter.findLine(doc, product);
  const proof = {
    productId: product.id,
    source: "cart",
    quantityConfirmed: true,
    inventoryConfirmed: true,
    cartLineCount: 1,
    cartSku: product.sku,
    firstParty: true,
    seller: line.seller,
    price: line.price,
    cartConfirmedAt: 9_000
  };
  assert.equal(checkoutSafety({
    product,
    inventory,
    line,
    proof,
    orderTotal: entry.total,
    fulfillmentMode: adapter.fulfillmentMode(doc),
    now: 10_000
  }).reason, "fulfillment-unverified");
});
