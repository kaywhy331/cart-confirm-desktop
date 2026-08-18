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

function stateFixture(retailer, state, url = `https://www.${retailer}.com/${state}`) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", `${retailer}-${state}.html`), "utf8");
  return new JSDOM(html, { url }).window.document;
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

test("an unknown extra summary line without a remove control blocks checkout", () => {
  const doc = fixture("target");
  const adapter = getAdapter("target");
  const product = productFor(CASES[0]);
  const unknown = doc.createElement("section");
  unknown.setAttribute("data-testid", "order-item-extra");
  unknown.innerHTML = "<span>Unknown bonus item</span><span>$4.99</span>";
  doc.querySelector("main").append(unknown);

  const inventory = adapter.cartInventory(doc);
  assert.equal(inventory.complete, false);
  assert.equal(inventory.independentLineCount, 2);
  assert.equal(verifySingleProductCart(product, inventory).reason, "cart-unverified");
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
  for (const hiddenStyle of ["display: none", "visibility: hidden", "opacity: 0"]) {
    const stale = new JSDOM(`<body><div style="${hiddenStyle}"><div role="alert">Your order was not placed.</div></div></body>`).window.document;
    assert.equal(adapter.submissionFailure(stale), false, `${hiddenStyle} stale failures are not authoritative`);
  }
  const ariaHidden = new JSDOM(`<body><div aria-hidden="true"><div role="alert">Payment declined.</div></div></body>`).window.document;
  assert.equal(adapter.submissionFailure(ariaHidden), false);
});

test("confirmation requires a retailer-specific confirmation container", () => {
  const adapter = getAdapter("walmart");
  const broadText = "<body><p>Thank you for your order. Order number 123.</p></body>";
  assert.equal(adapter.orderConfirmed(new JSDOM(broadText).window.document), false);

  const rooted = "<body><main data-automation-id='order-confirmation'>Thank you for your order. Order number 123.</main></body>";
  assert.equal(adapter.orderConfirmed(new JSDOM(rooted).window.document), true);
  const hidden = `<body><main style="display:none" data-automation-id="order-confirmation">Thank you for your order. Order number 123.</main></body>`;
  assert.equal(adapter.orderConfirmed(new JSDOM(hidden).window.document), false);
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

for (const entry of CASES) {
  test(`${entry.retailer} sanitized product fixture proves the exact visible first-party offer`, () => {
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const doc = stateFixture(entry.retailer, "product", product.retailer === "target"
      ? `https://www.target.com/p/example/-/A-${product.sku}`
      : product.retailer === "walmart"
        ? `https://www.walmart.com/ip/example/${product.sku}`
        : `https://www.amazon.com/dp/${product.sku}`);
    const offer = adapter.offer(doc, product);
    assert.equal(offer.available, true);
    assert.equal(offer.firstParty, true);
    assert.equal(offer.price, entry.unit);
    assert.ok(offer.addButton);
  });

  test(`${entry.retailer} sanitized final checkout binds destination, complete payment set, cart, and total`, () => {
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const doc = stateFixture(entry.retailer, "checkout");
    const inventory = adapter.cartInventory(doc);
    const line = adapter.findLine(doc, product);
    assert.equal(inventory.complete, true);
    assert.equal(inventory.independentlyCounted, true);
    assert.deepEqual(inventory.ids, [product.sku]);
    assert.equal(line.quantity, product.quantity);
    assert.equal(line.price, entry.unit);
    assert.equal(line.firstParty, true);
    assert.equal(adapter.fulfillmentMode(doc), "shipping");
    assert.equal(adapter.destinationEvidence(doc, "shipping").length, 1);
    assert.equal(adapter.paymentInstrumentEvidence(doc).length, 2);
    assert.equal(adapter.substitutionState(doc, product), entry.retailer === "walmart" ? "disabled" : "not-applicable");
    assert.equal(adapter.orderTotal(doc), entry.total);
    assert.ok(adapter.submitButton(doc));
  });

  test(`${entry.retailer} substitutions fail closed without visible item-bound evidence`, () => {
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const doc = stateFixture(entry.retailer, "checkout");
    for (const control of doc.querySelectorAll("input[name*='substitut' i], [data-testid*='substitut' i], [data-automation-id*='substitut' i], [data-test*='substitut' i]")) {
      control.remove();
    }
    assert.equal(adapter.substitutionState(doc, product), "unknown");
    const line = adapter.findLine(doc, product).container;
    const hidden = doc.createElement("span");
    hidden.style.display = "none";
    hidden.textContent = "Substitutions are not available for this item.";
    line.append(hidden);
    assert.equal(adapter.substitutionState(doc, product), "unknown");
  });

  test(`${entry.retailer} checkout evidence notices destination, pickup-store, payment-set, and substitution changes`, () => {
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const doc = stateFixture(entry.retailer, "checkout");
    const originalDestination = adapter.destinationEvidence(doc, "shipping");
    const originalPayments = adapter.paymentInstrumentEvidence(doc);

    const destination = doc.querySelector("#fixture-destination");
    destination.lastChild.textContent = " Deliver to 987 Changed Avenue, Other City CA 90001";
    assert.notDeepEqual(adapter.destinationEvidence(doc, "shipping"), originalDestination);

    destination.dataset.selected = "false";
    destination.querySelector("input").checked = false;
    const pickup = doc.createElement("label");
    pickup.dataset.testid = "pickup-option";
    pickup.dataset.selected = "true";
    pickup.innerHTML = "<input type='radio' name='pickup-store' checked> Pickup at Example Store 42";
    doc.querySelector("main").append(pickup);
    assert.equal(adapter.fulfillmentMode(doc), "");
    doc.querySelector("#fixture-fulfillment input").checked = false;
    assert.equal(adapter.fulfillmentMode(doc), "pickup");
    assert.deepEqual(adapter.destinationEvidence(doc, "pickup"), ["Pickup at Example Store 42"]);

    doc.querySelector("#fixture-payment-primary input").checked = false;
    assert.notDeepEqual(adapter.paymentInstrumentEvidence(doc), originalPayments);

    if (entry.retailer === "walmart") {
      const substitution = doc.querySelector("input[name='allow-substitutions']");
      substitution.checked = true;
      assert.equal(adapter.substitutionState(doc, product), "enabled");
    }
  });

  test(`${entry.retailer} sanitized confirmation is authoritative only inside its retailer container`, () => {
    const adapter = getAdapter(entry.retailer);
    const doc = stateFixture(entry.retailer, "confirmation");
    assert.equal(adapter.orderConfirmed(doc), true);
    const root = doc.querySelector("main");
    for (const attribute of ["id", "data-test", "data-testid", "data-automation-id", "aria-label"]) root.removeAttribute(attribute);
    assert.equal(adapter.orderConfirmed(doc), false);
  });

  test(`${entry.retailer} sanitized auth, MFA, location, membership, challenge, and demand pages freeze safely`, () => {
    const adapter = getAdapter(entry.retailer);
    assert.equal(adapter.interactivePageState(stateFixture(entry.retailer, "auth")), "auth");
    assert.equal(adapter.interactivePageState(stateFixture(entry.retailer, "mfa")), "mfa");
    assert.equal(adapter.interactivePageState(stateFixture(entry.retailer, "location")), "location");
    assert.equal(adapter.interactivePageState(stateFixture(entry.retailer, "membership")), "membership");
    assert.equal(adapter.interactivePageState(stateFixture(entry.retailer, "challenge")), "challenge");
    const demand = stateFixture(entry.retailer, "queue");
    assert.match(demand.body.textContent, /high demand/i);
    assert.equal(require("../extension/retailers").unrecognizedHighDemand(demand), true);
    assert.equal(adapter.securityChallenge(demand), false);
  });

  test(`${entry.retailer} sanitized quantity-limit fixture exposes the visible limit before mutation`, () => {
    const adapter = getAdapter(entry.retailer);
    const product = productFor(entry);
    const doc = stateFixture(entry.retailer, "quantity-limit");
    assert.equal(adapter.visibleQuantityLimit(doc, product), 2);
  });
}

test("fulfillment method controls are selectable per mode but store choices and Shipt delivery never are", () => {
  const adapter = getAdapter("target");
  const doc = new JSDOM(`
    <main>
      <fieldset data-test="fulfillment-cell">
        <button aria-selected="false">Pickup<br>Ready within 2 hours</button>
        <button aria-selected="false">Delivery<br>As soon as 6pm with Shipt</button>
        <button aria-selected="false">Shipping<br>Arrives Thu, Aug 20</button>
      </fieldset>
      <button data-test="store-picker">Select a store</button>
      <button data-test="pickup-store-picker">Pick up: select a store</button>
    </main>
  `, { url: "https://www.target.com/cart" }).window.document;
  const shipping = adapter.fulfillmentOptionControl(doc, "shipping");
  assert.match(shipping.textContent, /Shipping/);
  const pickup = adapter.fulfillmentOptionControl(doc, "pickup");
  assert.match(pickup.textContent, /Ready within 2 hours/);
  assert.doesNotMatch(pickup.textContent, /select a store/i);
  assert.equal(adapter.fulfillmentOptionControl(doc, ""), null);
  assert.equal(adapter.fulfillmentOptionControl(doc, "delivery"), null);
});

test("an already-selected configured method returns no control and Shipt-flavored shipping is vetoed", () => {
  const adapter = getAdapter("target");
  const selectedDoc = new JSDOM(`
    <main>
      <fieldset>
        <button aria-selected="true">Shipping<br>Arrives Thu</button>
        <button aria-selected="false">Pickup</button>
      </fieldset>
    </main>
  `, { url: "https://www.target.com/cart" }).window.document;
  assert.equal(adapter.fulfillmentOptionControl(selectedDoc, "shipping"), null);
  const shiptDoc = new JSDOM(`
    <main>
      <button>Shipping with Shipt same-day delivery</button>
    </main>
  `, { url: "https://www.target.com/cart" }).window.document;
  assert.equal(adapter.fulfillmentOptionControl(shiptDoc, "shipping"), null);
  const radioDoc = new JSDOM(`
    <main>
      <label>Ship it<input type="radio" name="fulfillment"></label>
      <label>Pick up<input type="radio" name="fulfillment" checked></label>
    </main>
  `, { url: "https://www.walmart.com/cart" }).window.document;
  const walmart = getAdapter("walmart");
  assert.equal(walmart.fulfillmentOptionControl(radioDoc, "shipping").closest("label").textContent.trim(), "Ship it");
  assert.equal(walmart.fulfillmentOptionControl(radioDoc, "pickup"), null);
});

test("the content script resolves location prompts through the configured method before blocking", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(source, /adapter\.fulfillmentMode\(document\) === product\.fulfillmentMode/);
  assert.match(source, /await selectConfiguredFulfillment\(product\)/);
  assert.match(source, /fulfillmentOptionControl\?\.\(document, product\.fulfillmentMode\)/);
  // The manual-safety promise stays intact: no automatic store/zip/location choice.
  assert.match(source, /store, zip, and location choices are never made automatically/);
});

test("a live-DOM Target cart line with only a cartItem-deleteBtn control is independently counted", () => {
  const adapter = getAdapter("target");
  const doc = new JSDOM(`<body><main>
    <div data-test="cartItem" data-tcin="95059193">
      <a href="https://www.target.com/p/riftbound/-/A-95059193" data-test="cartItem-title">Riftbound Zed vs Shen Showdown Decks</a>
      <span data-test="cartItem-price">$34.99</span>
      <select aria-label="Quantity"><option value="2" selected>2</option></select>
      <button data-test="cartItem-deleteBtn">Delete</button>
    </div>
    <div data-test="cart-summary-total">Order total $69.98</div>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document;
  const inventory = adapter.cartInventory(doc);
  assert.deepEqual(inventory.ids, ["95059193"]);
  assert.equal(inventory.independentLineCount, 1);
  assert.equal(inventory.independentlyCounted, true);
  assert.equal(inventory.complete, true);
  const product = { id: "target:95059193", retailer: "target", sku: "95059193", quantity: 2, maxPrice: 40, maxOrderTotal: 80, action: "checkout", fulfillmentMode: "shipping", enabled: true };
  assert.equal(verifySingleProductCart(product, inventory).ok, true);
});

test("an extra unrecognized cart line still makes the independent count fail closed", () => {
  const adapter = getAdapter("target");
  const doc = new JSDOM(`<body><main>
    <div data-test="cartItem" data-tcin="95059193">
      <a href="https://www.target.com/p/riftbound/-/A-95059193">Riftbound Decks</a>
      <span data-test="cartItem-price">$34.99</span>
      <button data-test="cartItem-deleteBtn">Delete</button>
    </div>
    <div data-test="cartItem">
      <span>Mystery line without any TCIN</span>
      <span data-test="cartItem-price">$9.99</span>
      <button data-test="cartItem-deleteBtn">Delete</button>
    </div>
  </main></body>`, { url: "https://www.target.com/cart" }).window.document;
  const inventory = adapter.cartInventory(doc);
  assert.equal(inventory.complete, false);
  const product = { id: "target:95059193", retailer: "target", sku: "95059193", quantity: 2, maxPrice: 40, maxOrderTotal: 80, action: "checkout", fulfillmentMode: "shipping", enabled: true };
  assert.equal(verifySingleProductCart(product, inventory).ok, false);
});
