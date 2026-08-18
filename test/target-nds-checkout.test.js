"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const { getAdapter } = require("../extension/retailers");
const { checkoutSafety } = require("../extension/safety");

// Sanitized capture of Target's NDS checkout review (rolled out 2026-08):
// no TCIN/SKU anywhere in the DOM, static fulfillment/destination/payment
// sections, one item card with a quantity badge.
function reviewDocument() {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "target-checkout-nds.html"), "utf8");
  return new JSDOM(html, { url: "https://www.target.com/checkout" }).window.document;
}

const adapter = getAdapter("target");
const product = {
  id: "target:94693225",
  retailer: "target",
  sku: "94693225",
  title: "Riftbound League Of Legends Trading Card Game Zed Vs Shen Showdown Decks",
  quantity: 2,
  maxPrice: 39.99,
  maxOrderTotal: 100,
  action: "checkout",
  fulfillmentMode: "shipping"
};

function freshProof(now) {
  return {
    productId: product.id,
    source: "cart",
    quantityConfirmed: true,
    inventoryConfirmed: true,
    cartLineCount: 1,
    cartSku: product.sku,
    firstParty: true,
    price: 34.99,
    cartConfirmedAt: now - 30_000
  };
}

test("the NDS review page classifies and reads statically rendered order facts", () => {
  const doc = reviewDocument();
  assert.equal(adapter.pageKind("https://www.target.com/checkout", doc, product), "checkout");
  // No false interactive wall or store error on the real review DOM.
  assert.equal(adapter.interactivePageState(doc), "");
  assert.equal(adapter.storeError(doc), "");
  assert.equal(adapter.fulfillmentMode(doc), "shipping");
  assert.equal(adapter.orderTotal(doc), 77.33);
  assert.ok(adapter.submitButton(doc), "place-order control");
  const destination = adapter.destinationEvidence(doc, "shipping");
  assert.equal(destination.length, 1);
  assert.match(destination[0], /123 Example Way/);
  const payment = adapter.paymentInstrumentEvidence(doc);
  assert.deepEqual(payment, ["Discover *1234"]);
  assert.equal(adapter.substitutionState(doc, product), "not-applicable");
});

test("the single bound item card yields a complete SKU-attributed inventory and line", () => {
  const doc = reviewDocument();
  const inventory = adapter.cartInventory(doc, product);
  assert.equal(inventory.items.length, 1);
  assert.equal(inventory.items[0].sku, product.sku);
  assert.equal(inventory.independentlyCounted, true);
  assert.equal(inventory.independentLineCount, 1);
  assert.equal(inventory.complete, true);
  const line = adapter.findLine(doc, product);
  assert.ok(line);
  assert.equal(line.quantity, 2);
  // Unit price is derived from the order summary's "(2 items) $69.98" and
  // first-party from the absence of any marketplace-seller marker, so the
  // disarmed preflight lock (which has no cart proof) can verify the offer.
  assert.equal(line.price, 34.99);
  assert.equal(line.firstParty, true);
  assert.equal(line.seller, "");
});

test("the disarmed preflight lock verifies the offer without any cart proof", () => {
  const doc = reviewDocument();
  const { effectiveLineOffer } = require("../extension/safety");
  const offer = effectiveLineOffer(product, adapter.findLine(doc, product));
  assert.deepEqual({ ok: offer.ok, price: offer.price, firstParty: offer.firstParty }, { ok: true, price: 34.99, firstParty: true });

  // A subtotal that prices the unit above the cap still fails closed.
  const expensive = reviewDocument();
  const subtotal = expensive.querySelector("[data-test='cart-summary-subTotal']");
  subtotal.innerHTML = subtotal.innerHTML.replace("$69.98", "$84.00");
  const overOffer = effectiveLineOffer(product, adapter.findLine(expensive, product));
  assert.deepEqual({ ok: overOffer.ok, reason: overOffer.reason }, { ok: false, reason: "over-price" });
});

test("checkoutSafety passes end-to-end on the NDS review with a fresh cart proof", () => {
  const doc = reviewDocument();
  const now = Date.now();
  const review = checkoutSafety({
    product,
    inventory: adapter.cartInventory(doc, product),
    line: adapter.findLine(doc, product),
    proof: freshProof(now),
    orderTotal: adapter.orderTotal(doc),
    unsafeChoices: adapter.unsafeOrderChoices(doc),
    fulfillmentMode: adapter.fulfillmentMode(doc),
    now
  });
  assert.equal(review.ok, true);
  assert.equal(review.price, 34.99);
  assert.equal(review.orderTotal, 77.33);
});

test("binding fails closed on any mismatch: title, quantity, unit count, or missing proof", () => {
  const now = Date.now();
  // Title mismatch: the card is never attributed the mission SKU.
  const otherProduct = { ...product, title: "Magic The Gathering | The Hobbit Gift Bundle" };
  const doc = reviewDocument();
  const inventory = adapter.cartInventory(doc, otherProduct);
  assert.equal(inventory.items[0].sku, "");
  assert.equal(inventory.complete, false);
  assert.equal(adapter.findLine(doc, otherProduct), null);

  // Quantity mismatch against the mission stops in checkoutSafety.
  const wrongQuantity = { ...product, quantity: 1 };
  const review = checkoutSafety({
    product: wrongQuantity,
    inventory: adapter.cartInventory(doc, wrongQuantity),
    line: adapter.findLine(doc, wrongQuantity),
    proof: { ...freshProof(now), quantityConfirmed: true },
    orderTotal: adapter.orderTotal(doc),
    unsafeChoices: [],
    fulfillmentMode: "shipping",
    now
  });
  assert.equal(review.ok, false);

  // Summary unit-count disagreement removes the independent corroboration.
  const tampered = reviewDocument();
  const subtotal = tampered.querySelector("[data-test='cart-summary-subTotal']");
  subtotal.textContent = subtotal.textContent.replace("(2 items)", "(3 items)");
  assert.equal(adapter.findLine(tampered, product), null);
  assert.equal(adapter.cartInventory(tampered, product).independentlyCounted, false);

  // A stale or absent cart proof stops checkoutSafety even with a bound card.
  const fresh = reviewDocument();
  const stale = checkoutSafety({
    product,
    inventory: adapter.cartInventory(fresh, product),
    line: adapter.findLine(fresh, product),
    proof: { ...freshProof(now), cartConfirmedAt: now - 6 * 60_000 },
    orderTotal: adapter.orderTotal(fresh),
    unsafeChoices: [],
    fulfillmentMode: "shipping",
    now
  });
  assert.deepEqual({ ok: stale.ok, reason: stale.reason }, { ok: false, reason: "cart-unverified" });
});

test("the legacy selected-control checkout DOM keeps working unchanged", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "target-checkout.html"), "utf8");
  const doc = new JSDOM(html, { url: "https://www.target.com/checkout" }).window.document;
  assert.ok(adapter.submitButton(doc));
  assert.equal(adapter.fulfillmentMode(doc), "shipping");
});
