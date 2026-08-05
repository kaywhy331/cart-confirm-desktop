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
      firstParty: true,
      seller: line.seller,
      price: line.price,
      cartConfirmedAt: now - 1_000
    };
    assert.equal(checkoutSafety({ product, inventory, line, proof, orderTotal: entry.total, now }).ok, true);
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
    firstParty: true,
    seller: line.seller,
    price: line.price,
    cartConfirmedAt: now - 1_000
  };

  assert.equal(checkoutSafety({ product, inventory, line, proof, orderTotal: null, now }).reason, "total-unavailable");
  assert.equal(checkoutSafety({ product, inventory, line, proof, orderTotal: product.maxOrderTotal + 0.01, now }).reason, "over-total");
  assert.equal(checkoutSafety({
    product,
    inventory,
    line,
    proof: { ...proof, cartConfirmedAt: now - CART_PROOF_MAX_AGE_MS - 1 },
    orderTotal: entry.total,
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
