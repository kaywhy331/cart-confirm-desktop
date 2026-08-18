"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const { combinedOrderStatus, normalizeSettings } = require("../lib/core");
const Safety = require("../extension/safety");
const AutomationState = require("../extension/automation-state");
const { getAdapter } = require("../extension/retailers");
const Evidence = require("../extension/evidence");

function mission(id, overrides = {}) {
  return {
    id: `target:${id}`,
    retailer: "target",
    sku: id,
    title: `Collectible Trading Card Item ${id}`,
    enabled: true,
    action: "checkout",
    quantity: 1,
    maxPrice: 40,
    maxOrderTotal: 50,
    fulfillmentMode: "shipping",
    ...overrides
  };
}

test("combinedOrderStatus: gate readiness, captain, summed cap, and exclusions", () => {
  const a = mission("111"), b = mission("222"), c = mission("333");
  const settings = { combinedOrderEnabled: true, products: [a, b, c] };
  // Nothing observed yet: not ready.
  let gate = combinedOrderStatus(settings, {});
  assert.equal(gate.stores.target.ready, false);
  assert.equal(gate.stores.target.pendingCount, 3);
  // Two carted, one observed out-of-stock: ready, captain is the first carted id.
  const statuses = {
    [a.id]: { cart: "confirmed", lastEventAt: "2026-08-18T10:00:00Z" },
    [b.id]: { cart: "confirmed", lastEventAt: "2026-08-18T10:00:01Z" },
    [c.id]: { availability: "unavailable", lastEventAt: "2026-08-18T10:00:02Z" }
  };
  gate = combinedOrderStatus(settings, statuses);
  assert.equal(gate.stores.target.ready, true);
  assert.equal(gate.stores.target.captainProductId, a.id);
  assert.equal(gate.stores.target.cartedCount, 2);
  assert.equal(gate.stores.target.combinedMaxTotal, 100);
  // An in-progress member (available but not carted) blocks readiness.
  gate = combinedOrderStatus(settings, { ...statuses, [c.id]: { availability: "available", lastEventAt: "x" } });
  assert.equal(gate.stores.target.ready, false);
  // Disabled setting yields a disabled gate; Amazon and calendar-owned are excluded.
  assert.equal(combinedOrderStatus({ combinedOrderEnabled: false, products: [a] }, {}).enabled, false);
  const amazon = mission("444", { id: "amazon:444", retailer: "amazon" });
  assert.equal(combinedOrderStatus({ combinedOrderEnabled: true, products: [amazon] }, {}).stores.amazon, undefined);
  gate = combinedOrderStatus({ combinedOrderEnabled: true, products: [a, b] }, statuses, (p) => p.id === b.id);
  assert.equal(gate.stores.target.members.length, 1);
  // The setting normalizes as a persisted boolean.
  assert.equal(normalizeSettings({ combinedOrderEnabled: true }, {}).combinedOrderEnabled, true);
  assert.equal(normalizeSettings({}, {}).combinedOrderEnabled, false);
});

test("verifyMemberCart accepts sibling member lines and refuses everything foreign", () => {
  const product = mission("111");
  const memberSkus = ["111", "222"];
  const inventory = (skus) => ({
    complete: true,
    independentlyCounted: true,
    independentLineCount: skus.length,
    items: skus.map((sku) => ({ sku }))
  });
  assert.equal(Safety.verifyMemberCart(product, inventory(["111", "222"]), memberSkus).ok, true);
  assert.equal(Safety.verifyMemberCart(product, inventory(["111"]), memberSkus).ok, true);
  assert.equal(Safety.verifyMemberCart(product, inventory(["111", "999"]), memberSkus).reason, "manual-action-required");
  assert.equal(Safety.verifyMemberCart(product, inventory(["222"]), memberSkus).reason, "manual-action-required");
  assert.equal(Safety.verifyMemberCart(product, inventory(["111", "111"]), memberSkus).reason, "manual-action-required");
});

test("combinedCheckoutSafety verifies every member and the summed cap", () => {
  const now = Date.now();
  const members = [mission("111", { quantity: 2 }), mission("222")];
  const proofs = Object.fromEntries(members.map((member) => [member.id, {
    productId: member.id, source: "cart", quantityConfirmed: true, inventoryConfirmed: true,
    cartLineCount: 2, cartSku: member.sku, firstParty: true, price: 34.99, cartConfirmedAt: now - 30_000
  }]));
  const inventory = { complete: true, independentlyCounted: true, independentLineCount: 2, items: [{ sku: "111" }, { sku: "222" }] };
  const lines = {
    "target:111": { seller: "", firstParty: false, price: null, quantity: 2 },
    "target:222": { seller: "", firstParty: false, price: null, quantity: 1 }
  };
  const base = {
    members, inventory, lines, proofs, orderTotal: 95,
    unsafeChoices: [], fulfillmentMode: "shipping", requiredFulfillmentMode: "shipping",
    combinedMaxTotal: 100, now
  };
  const ok = Safety.combinedCheckoutSafety(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.prices["target:111"], 34.99);
  assert.equal(Safety.combinedCheckoutSafety({ ...base, orderTotal: 101 }).reason, "over-total");
  assert.equal(Safety.combinedCheckoutSafety({ ...base, lines: { ...lines, "target:222": null } }).reason, "unmatched-product");
  assert.equal(Safety.combinedCheckoutSafety({ ...base, lines: { ...lines, "target:222": { ...lines["target:222"], quantity: 3 } } }).reason, "quantity-unavailable");
  // A proof carrying more lines than the batch fails closed; single missions keep the strict rule.
  assert.equal(Safety.combinedCheckoutSafety({ ...base, proofs: { ...proofs, "target:222": { ...proofs["target:222"], cartLineCount: 5 } } }).reason, "cart-unverified");
  assert.equal(Safety.recentCartProof(members[0], proofs[members[0].id], now), null);
  assert.ok(Safety.recentCartProof(members[0], proofs[members[0].id], now, { maxLineCount: 2 }));
});

test("the combined batch shares the store lane and completes members from the captain", () => {
  const runId = "run-1";
  const membersByStore = { target: ["target:111", "target:222"] };
  const a = mission("111"), b = mission("222"), outsider = mission("999");
  let state = AutomationState.normalizeState(null, runId);
  // A confirms its add: normalizing with membership yields a combined store hold.
  const recordA = state.products[a.id] = {
    attempts: 0, proof: null,
    submission: { phase: "idle", updatedAt: 0, evidenceHash: "" },
    addAction: { phase: "confirmed", ownerId: "tab:1", updatedAt: Date.now() },
    workflow: { phase: "active", ownerId: "tab:1", updatedAt: Date.now(), evidenceHash: "" },
    targetPersistence: {}
  };
  state = AutomationState.normalizeState(state, runId, Date.now(), membersByStore);
  const storeLock = state.locks["store:target"];
  assert.equal(storeLock.combined, true);
  assert.deepEqual(storeLock.memberProductIds, [a.id]);
  // Fellow member B claims through the combined hold; an outsider is refused.
  const claimB = AutomationState.claim(state, b, "tab:2", Date.now(), { combinedMemberIds: membersByStore.target });
  assert.equal(claimB.ok, true);
  const claimOutsider = AutomationState.claim(state, outsider, "tab:3", Date.now(), { combinedMemberIds: [] });
  assert.deepEqual({ ok: claimOutsider.ok, reason: claimOutsider.reason }, { ok: false, reason: "store-busy" });
  // B's live sub-claim keeps mutations serialized between members.
  const claimA = AutomationState.claim(state, a, "tab:1", Date.now(), { combinedMemberIds: membersByStore.target });
  assert.deepEqual({ ok: claimA.ok, phase: claimA.blockingPhase }, { ok: false, phase: "combined-member-active" });
  // Member completion requires the captain's own confirmed submission first.
  state.products[b.id] = { ...recordA, addAction: { phase: "confirmed", ownerId: "tab:2", updatedAt: Date.now() } };
  assert.equal(AutomationState.completeCombinedMember(state, b, a).reason, "captain-confirmation-missing");
  state.products[a.id].submission = { phase: "intent", updatedAt: Date.now(), evidenceHash: "a".repeat(64) };
  assert.equal(AutomationState.complete(state, a).ok, true);
  assert.equal(AutomationState.completeCombinedMember(state, b, a).ok, true);
  // With every member completed, the combined lane is released.
  state = AutomationState.normalizeState(state, runId, Date.now(), membersByStore);
  assert.equal(state.locks["store:target"], undefined);
});

function batchReviewDocument({ summary = "(3 items)", secondTitle = "Collectible Trading Card Item 222" } = {}) {
  const html = `<html><body><div data-test="checkout-container">
    <div data-test="STEP_SHIPPING_CONTAINER"><div data-test="cart-shipping-address">Pat Sample 123 Example Way</div></div>
    <div data-test="Item-111"><span data-test="image-card-aaa" style='--image-quantity: "2";'><img alt="Collectible Trading Card Item 111 quantity 2"></span></div>
    <div data-test="Item-222"><span data-test="image-card-bbb" style='--image-quantity: "1";'><img alt="${secondTitle} quantity 1"></span></div>
    <div data-test="IconPaymentDiscover">Discover *1234</div>
    <div data-test="cart-summary-subTotal">Subtotal ${summary} $104.97</div>
    <div data-test="cart-summary-total">Total $113.36</div>
    <button type="button" data-test="placeOrderButton">Place your order</button>
  </div></body></html>`;
  return new JSDOM(html, { url: "https://www.target.com/checkout" }).window.document;
}

test("the Target NDS batch binding maps each card to a distinct mission or fails closed", async () => {
  const adapter = getAdapter("target");
  const members = [mission("111", { title: "Collectible Trading Card Item 111", quantity: 2 }), mission("222", { title: "Collectible Trading Card Item 222" })];
  const doc = batchReviewDocument();
  const batch = adapter.combinedReviewLines(doc, members);
  assert.equal(batch.ok, true);
  assert.deepEqual(batch.inventory.ids.sort(), ["111", "222"]);
  assert.equal(batch.inventory.independentlyCounted, true);
  assert.equal(batch.lines["target:111"].quantity, 2);
  assert.equal(batch.lines["target:222"].quantity, 1);
  // Summary unit-count disagreement fails closed.
  assert.equal(adapter.combinedReviewLines(batchReviewDocument({ summary: "(4 items)" }), members).ok, false);
  // An ambiguous title (two cards matching one mission) fails closed.
  assert.equal(adapter.combinedReviewLines(batchReviewDocument({ secondTitle: "Collectible Trading Card Item 111" }), members).ok, false);
  // A missing member fails closed.
  assert.equal(adapter.combinedReviewLines(doc, [members[0]]).ok, false);

  // The combined evidence contract validates end-to-end on this page.
  const sign = async (texts) => crypto.createHash("sha256").update(JSON.stringify(texts)).digest("hex");
  const batchProduct = {
    id: "combined:target:run-1", retailer: "target", sku: "111+222", quantity: 3,
    maxOrderTotal: 150, fulfillmentMode: "shipping", combinedLineCount: 2
  };
  const captured = await Evidence.capture(batchProduct, {
    fulfillmentMode: adapter.fulfillmentMode(doc),
    destinationTexts: adapter.destinationEvidence(doc, "shipping"),
    pickupStoreTexts: [],
    paymentInstrumentTexts: adapter.paymentInstrumentEvidence(doc),
    substitutionState: adapter.substitutionState(doc, batchProduct),
    inventory: batch.inventory,
    line: null,
    orderTotal: adapter.orderTotal(doc),
    cartSummary: { independentlyCounted: true, lineCount: 2, sku: "111+222", quantity: 3 }
  }, sign);
  assert.equal(Evidence.validate(captured, batchProduct).ok, true);
  assert.equal(captured.cart.lineCount, 2);
});

test("content and renderer wire the combined flow and the missing-affiliate warning", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(content, /combinedStore\s*\?\s*Safety\.verifyMemberCart\(product, inventory, combinedStore\.members\.map/);
  assert.match(content, /if \(combinedStore\) \{\s*await handleCombinedCheckout\(product, combinedStore\);\s*return;\s*\}/);
  assert.match(content, /CART_CONFIRM_COMPLETE_COMBINED_MEMBER/);
  assert.match(content, /Evidence\.matches\(undefined, checkoutEvidence, batchProduct, config\?\.checkoutTrust\)/);
  const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  assert.match(renderer, /combinedOrderEnabled: elements\.combinedOrder\.checked/);
  assert.match(renderer, /const missingAffiliate = !product\.affiliateOpenUrl && !product\.affiliateUrl;/);
  const background = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(background, /combinedMembersByStore\(config\)/);
});
