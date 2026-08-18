"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const { getAdapter } = require("../extension/retailers");
const adapter = getAdapter("target");

function cartDocument(extra = "") {
  const html = `<html><body><main>
    <div data-test="cart-item"><a href="/p/thing/-/A-94693225">Riftbound decks</a></div>
    ${extra}
    <button data-test="checkout-button">Check out</button>
  </main></body></html>`;
  return new JSDOM(html, { url: "https://www.target.com/cart" }).window.document;
}

test("a location/address chooser is never mistaken for the Shipping method toggle", () => {
  // Target's NDS cart control that was being auto-clicked in the field.
  const doc = cartDocument(`<button type="button">Update shipping location</button>`);
  assert.equal(adapter.fulfillmentOptionControl(doc, "shipping"), null);
  // Other chooser phrasings stay vetoed too.
  for (const label of ["Edit shipping address", "Change delivery location", "Enter shipping address"]) {
    const other = cartDocument(`<button type="button">${label}</button>`);
    assert.equal(adapter.fulfillmentOptionControl(other, "shipping"), null, label);
  }
});

test("a genuine method toggle is still selectable and pickup vetoes still hold", () => {
  const doc = cartDocument(`
    <div role="radio" aria-checked="false"><button type="button">Shipping</button></div>
    <div role="radio" aria-checked="false"><button type="button">Pickup</button></div>
  `);
  const control = adapter.fulfillmentOptionControl(doc, "shipping");
  assert.ok(control);
  assert.match(control.textContent, /^Shipping$/);
  // Shipt-style delivery is never selected for either mode.
  const shipt = cartDocument(`<div role="radio" aria-checked="false"><button type="button">Delivery with Shipt</button></div>`);
  assert.equal(adapter.fulfillmentOptionControl(shipt, "shipping"), null);
});

test("the cart scan treats an unreadable fulfillment mode as non-contradicting", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(
    source,
    /const readFulfillmentMode = adapter\.fulfillmentMode\(document\);\s*if \(readFulfillmentMode === product\.fulfillmentMode\) \{\s*interactiveState = "";\s*\} else if \(\s*readFulfillmentMode === ""\s*&& adapter\.pageKind\(location\.href, document, product\) === "cart"\s*\) \{[\s\S]*?interactiveState = "";\s*\} else if \(await selectConfiguredFulfillment\(product\)\) \{/
  );
});
