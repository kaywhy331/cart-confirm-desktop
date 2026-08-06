"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const State = require("../extension/automation-state");

const PRODUCT = {
  id: "walmart:123456789",
  retailer: "walmart",
  action: "checkout"
};

test("one store workflow is serialized even across different products", () => {
  const state = State.createState("run", 1_000);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, { ...PRODUCT, id: "walmart:987654321" }, "tab:2", 1_001).reason, "store-busy");
});

test("submit intent survives indefinitely until explicit failure or confirmation", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  assert.equal(State.beginSubmission(state, PRODUCT, "tab:1", "evidence", 1_100).ok, true);
  assert.equal(State.markSubmission(state, PRODUCT, "tab:1", "clicked", 1_101).ok, true);
  const reloaded = State.normalizeState(structuredClone(state), "run", 99_000_000);
  assert.equal(State.productState(reloaded, PRODUCT, 99_000_000).submission.phase, "uncertain");
  assert.equal(State.claim(reloaded, PRODUCT, "tab:1", 99_000_000).reason, "run-expired");
});

test("completion is keyed by run and product rather than mutable caps", () => {
  const state = State.createState("run", 1_000);
  assert.equal(State.complete(state, PRODUCT, 1_050).reason, "submission-intent-missing");
  State.claim(state, PRODUCT, "tab:1", 1_060);
  State.beginSubmission(state, PRODUCT, "tab:1", "evidence", 1_070);
  State.markSubmission(state, PRODUCT, "tab:1", "clicked", 1_080);
  assert.equal(State.complete(state, PRODUCT, 1_100).ok, true);
  assert.equal(State.complete(state, PRODUCT, 1_150).alreadyCompleted, true);
  const changedCaps = { ...PRODUCT, maxPrice: 999, quantity: 4 };
  assert.equal(State.claim(state, changedCaps, "tab:2", 1_200).reason, "completed");
});

test("proof timestamps are minted in extension-owned state", () => {
  const state = State.createState("run", 1_000);
  const saved = State.saveProof(state, PRODUCT, {
    source: "cart",
    price: 12.34,
    seller: "Walmart.com",
    firstParty: true,
    quantityConfirmed: true,
    inventoryConfirmed: true,
    cartLineCount: 1,
    cartSku: PRODUCT.id.split(":")[1],
    verifiedAt: 1
  }, 5_000);
  assert.equal(saved.proof.verifiedAt, 5_000);
  assert.equal(saved.proof.cartConfirmedAt, 5_000);
  assert.equal(saved.proof.inventoryConfirmed, true);
});
