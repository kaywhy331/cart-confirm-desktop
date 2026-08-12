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

test("submit intent and an explicitly armed watcher survive indefinitely", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  assert.equal(State.beginSubmission(state, PRODUCT, "tab:1", "evidence", 1_100).ok, true);
  assert.equal(State.markSubmission(state, PRODUCT, "tab:1", "clicked", 1_101).ok, true);
  const reloaded = State.normalizeState(structuredClone(state), "run", 99_000_000);
  assert.equal(State.productState(reloaded, PRODUCT, 99_000_000).submission.phase, "uncertain");
  assert.equal(State.claim(reloaded, PRODUCT, "tab:1", 99_000_000).reason, "submission-uncertain");
  assert.equal(State.productState(reloaded, PRODUCT, 99_000_000).budgetReason, "");
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

test("add-only products run in parallel while checkout keeps the store lane exclusive", () => {
  const state = State.createState("run", 1_000);
  const addA = { id: "walmart:1000001", retailer: "walmart", action: "cart" };
  const addB = { id: "walmart:1000002", retailer: "walmart", action: "cart" };
  const checkoutC = { id: "walmart:1000003", retailer: "walmart", action: "checkout" };
  const reviewD = { id: "walmart:1000004", retailer: "walmart", action: "review" };

  assert.equal(State.claim(state, addA, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, addB, "tab:2", 1_001).ok, true, "a second add-only product must not be blocked");
  assert.equal(State.claim(state, addA, "tab:9", 1_002).reason, "product-busy");
  assert.equal(State.claim(state, checkoutC, "tab:3", 1_003).ok, true);
  assert.equal(State.claim(state, reviewD, "tab:4", 1_004).reason, "store-busy");
  assert.equal(State.claim(state, addB, "tab:2", 1_005).ok, true, "adds continue while a checkout holds the store lane");
  assert.equal(State.beginSubmission(state, checkoutC, "tab:3", "evidence", 1_010).ok, true);
  assert.equal(State.markSubmission(state, checkoutC, "tab:3", "clicked", 1_020).ok, true);
  assert.equal(State.complete(state, checkoutC, 1_050).ok, true);
  assert.equal(State.claim(state, checkoutC, "tab:3", 1_060).reason, "completed");
  assert.equal(State.claim(state, reviewD, "tab:4", 1_061).ok, true, "completing the checkout releases the store lane");
});

test("a blocked pre-submit workflow releases its store lane for the next mission", () => {
  const state = State.createState("run", 1_000);
  const next = { ...PRODUCT, id: "walmart:987654321" };
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, next, "tab:2", 1_001).reason, "store-busy");
  assert.equal(State.release(state, PRODUCT, "tab:wrong").released, false);
  assert.equal(State.release(state, PRODUCT, "tab:1").released, true);
  assert.equal(State.claim(state, next, "tab:2", 1_002).ok, true);
});

test("a possible order submission can never be released automatically", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginSubmission(state, PRODUCT, "tab:1", "evidence", 1_010);
  const released = State.release(state, PRODUCT, "tab:1");
  assert.equal(released.ok, false);
  assert.equal(released.reason, "submission-uncertain");
  assert.ok(state.locks[`store:${PRODUCT.retailer}`]);
});

test("one durable add boundary rejects duplicate scans from the same tab", () => {
  const state = State.createState("run", 1_000);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_000).ok, true);
  assert.equal(State.beginAddAction(state, PRODUCT, "tab:1", 1_010).ok, true);
  assert.equal(State.beginAddAction(state, PRODUCT, "tab:1", 1_011).reason, "add-in-flight");
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_012).reason, "add-in-flight");

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020).ok, true);
  const locked = State.release(state, PRODUCT, "tab:1");
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, "add-uncertain");
  assert.equal(State.productState(state, PRODUCT, 1_030).addAction.phase, "clicked");
});

test("cart verification resolves the add boundary without allowing a second add", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "confirmed", 1_030).ok, true);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_040).ok, true, "the owning tab may continue from cart to checkout");
  assert.equal(State.claim(state, PRODUCT, "tab:2", 1_041).reason, "cart-confirmed");
  assert.equal(State.release(state, PRODUCT, "tab:1").released, true);
});

test("a definitively missing cart line clears the add boundary for a bounded retry", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "canceled", 1_030).reason, "add-uncertain");
  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "failed", 1_040).ok, true);
  assert.equal(State.release(state, PRODUCT, "tab:1").released, true);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_050).ok, true);
});

test("Target blitz persistence bursts are durable, stage-specific, and bounded", () => {
  const target = { id: "target:1011209279", retailer: "target", action: "checkout", executionMode: "blitz" };
  const state = State.createState("run", 1_000);
  State.claim(state, target, "tab:1", 1_000);

  for (let index = 0; index < State.TARGET_PERSISTENCE_LIMITS.add; index += 1) {
    const reserved = State.reserveTargetPersistence(state, target, "tab:1", "add", 1_100 + index);
    assert.equal(reserved.ok, true);
    assert.equal(reserved.attempt, index + 1);
  }
  assert.equal(
    State.reserveTargetPersistence(state, target, "tab:1", "add", 2_000).reason,
    "target-persistence-exhausted"
  );
  assert.equal(State.reserveTargetPersistence(state, target, "tab:1", "cart", 2_001).ok, true);

  const restored = State.normalizeState(structuredClone(state), "run", 2_100);
  assert.equal(
    State.productState(restored, target, 2_100).targetPersistence.add.attempts,
    State.TARGET_PERSISTENCE_LIMITS.add
  );
  assert.equal(State.reserveTargetPersistence(restored, target, "tab:2", "cart", 2_101).reason, "product-busy");
});

test("Target persistence uses its configured window and never applies outside blitz", () => {
  const target = { id: "target:95163305", retailer: "target", action: "cart", executionMode: "blitz" };
  const state = State.createState("run", 1_000);
  State.claim(state, target, "tab:1", 1_000);
  assert.equal(State.reserveTargetPersistence(
    state,
    target,
    "tab:1",
    "quantity",
    { windowMs: 5_000 },
    1_100
  ).ok, true);
  assert.equal(
    State.reserveTargetPersistence(
      state,
      target,
      "tab:1",
      "quantity",
      { windowMs: 5_000 },
      6_101
    ).reason,
    "target-persistence-exhausted"
  );
  assert.equal(State.reserveTargetPersistence(state, PRODUCT, "tab:1", "add", 1_200).reason, "target-only");
  assert.equal(State.reserveTargetPersistence(state, target, "tab:1", "unknown", 1_200).reason, "invalid-persistence-kind");
  assert.equal(
    State.reserveTargetPersistence(
      state,
      { ...target, id: "target:1008581387", executionMode: "watcher" },
      "tab:1",
      "add",
      1_200
    ).reason,
    "blitz-required"
  );
});

test("purchase attempt accounting does not expire a watcher that remains armed", () => {
  const state = State.createState("run", 1_000);
  for (let index = 0; index < 125; index += 1) {
    assert.equal(State.recordAttempt(state, PRODUCT, 1_000 + index).ok, true);
  }
  assert.equal(State.productState(state, PRODUCT, 7 * 24 * 60 * 60_000).attempts, 125);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 7 * 24 * 60 * 60_000).ok, true);
});
