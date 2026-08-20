"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const State = require("../extension/automation-state");

const PRODUCT = {
  id: "walmart:123456789",
  retailer: "walmart",
  action: "checkout"
};

test("store options for one item race safely and stop after the first completion", () => {
  const state = State.createState("run", 1_000);
  const walmart = { ...PRODUCT, itemId: "item:console", action: "cart" };
  const target = {
    id: "target:1011960739",
    retailer: "target",
    itemId: "item:console",
    action: "cart"
  };
  assert.equal(State.claim(state, walmart, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, target, "tab:2", 1_001).reason, "item-busy");
  assert.equal(State.beginAddAction(state, walmart, "tab:1", 1_010).ok, true);
  assert.equal(State.markAddAction(state, walmart, "tab:1", "clicked", 1_020).ok, true);
  assert.equal(State.markAddAction(state, walmart, "tab:1", "confirmed", 1_030).ok, true);
  assert.equal(State.complete(state, walmart, 1_040).ok, true);
  const sibling = State.claim(state, target, "tab:2", 1_050);
  assert.equal(sibling.reason, "item-completed");
  assert.equal(sibling.activeProductId, walmart.id);
});

test("normalization restores an item hold for an uncertain route", () => {
  const product = { ...PRODUCT, itemId: "item:console" };
  const state = State.createState("run", 1_000);
  State.claim(state, product, "tab:1", 1_000);
  State.beginSubmission(state, product, "tab:1", "a".repeat(64), 1_010);
  State.markSubmission(state, product, "tab:1", "clicked", 1_020);
  delete state.locks[`item:${product.itemId}`];
  const restored = State.normalizeState(structuredClone(state), "run", 9_000, null, [product]);
  assert.equal(restored.locks[`item:${product.itemId}`].hold, true);
});

test("one store workflow is serialized even across different products", () => {
  const state = State.createState("run", 1_000);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, { ...PRODUCT, id: "walmart:987654321" }, "tab:2", 1_001).reason, "store-busy");
  assert.equal(State.claim(state, { ...PRODUCT, id: "walmart:222222222" }, "tab:1", 1_002).reason, "store-busy");
});

test("submit intent and an explicitly armed watcher survive indefinitely", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  assert.equal(State.beginSubmission(state, PRODUCT, "tab:1", "a".repeat(64), 1_100).ok, true);
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
  State.beginSubmission(state, PRODUCT, "tab:1", "a".repeat(64), 1_070);
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

test("every cart-mutating mission shares one universal retailer lane", () => {
  const state = State.createState("run", 1_000);
  const addA = { id: "walmart:1000001", retailer: "walmart", action: "cart" };
  const addB = { id: "walmart:1000002", retailer: "walmart", action: "cart" };
  const checkoutC = { id: "walmart:1000003", retailer: "walmart", action: "checkout" };
  const reviewD = { id: "walmart:1000004", retailer: "walmart", action: "review" };

  assert.equal(State.claim(state, addA, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, addB, "tab:2", 1_001).reason, "store-busy");
  assert.equal(State.claim(state, addA, "tab:9", 1_002).reason, "product-busy");
  assert.equal(State.claim(state, checkoutC, "tab:3", 1_003).reason, "store-busy");
  assert.equal(State.release(state, addA, "tab:1").released, true);
  assert.equal(State.claim(state, checkoutC, "tab:3", 1_004).ok, true);
  assert.equal(State.claim(state, reviewD, "tab:4", 1_005).reason, "store-busy");
  assert.equal(State.beginSubmission(state, checkoutC, "tab:3", "a".repeat(64), 1_010).ok, true);
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

test("an orphaned pre-mutation claim expires quickly without weakening held receipts", () => {
  const state = State.createState("run", 1_000);
  const next = { ...PRODUCT, id: "walmart:987654321" };
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, next, "tab:2", 1_001).reason, "store-busy");

  const restored = State.normalizeState(
    structuredClone(state),
    "run",
    1_000 + State.CLAIM_LOCK_MS + 1
  );
  assert.equal(State.claim(restored, next, "tab:2", 1_000 + State.CLAIM_LOCK_MS + 2).ok, true);
});

test("an orphaned pre-click Add reservation expires without stranding its proof or store lane", () => {
  const state = State.createState("run", 1_000);
  const next = { ...PRODUCT, id: "walmart:987654321" };
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.saveProof(state, PRODUCT, {
    source: "product",
    price: 12.34,
    seller: "Walmart.com",
    firstParty: true
  }, 1_005);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);

  const restored = State.normalizeState(
    structuredClone(state),
    "run",
    1_010 + State.PRE_CLICK_LEASE_MS + 1
  );
  const productState = State.productState(restored, PRODUCT, 1_010 + State.PRE_CLICK_LEASE_MS + 1);
  assert.equal(productState.addAction.phase, "idle");
  assert.equal(productState.addAction.ownerId, "");
  assert.equal(productState.proof, null);
  assert.equal(productState.workflow.ownerId, "");
  assert.equal(restored.locks[`product:${PRODUCT.id}`], undefined);
  assert.equal(restored.locks[`store:${PRODUCT.retailer}`], undefined);
  assert.equal(State.claim(restored, next, "tab:2", 1_010 + State.PRE_CLICK_LEASE_MS + 2).ok, true);
});

test("a held post-mutation store blocker is reported explicitly and never expires", () => {
  const state = State.createState("run", 1_000);
  const next = { ...PRODUCT, id: "walmart:987654321" };
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);

  const restored = State.normalizeState(structuredClone(state), "run", 99_000_000);
  const blocked = State.claim(restored, next, "tab:2", 99_000_001);
  assert.equal(blocked.reason, "store-busy");
  assert.equal(blocked.held, true);
  assert.equal(blocked.activeProductId, PRODUCT.id);
  assert.equal(blocked.blockingPhase, "add-clicked");
  assert.equal(restored.locks[`store:${PRODUCT.retailer}`].hold, true);
});

test("a possible order submission can never be released automatically", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginSubmission(state, PRODUCT, "tab:1", "a".repeat(64), 1_010);
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

test("the final Add authorization validates its owner and records the attempt atomically", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);

  assert.equal(State.authorizeAddClick(state, PRODUCT, "tab:2", 1_020).reason, "add-in-flight");
  const authorized = State.authorizeAddClick(state, PRODUCT, "tab:1", 1_030);
  assert.equal(authorized.ok, true);
  assert.equal(authorized.attempt, 1);
  assert.equal(State.productState(state, PRODUCT, 1_030).attempts, 1);
  assert.equal(State.productState(state, PRODUCT, 1_030).addAction.updatedAt, 1_030);
  assert.equal(state.locks[`store:${PRODUCT.retailer}`].expiresAt, 1_030 + State.PRE_CLICK_LEASE_MS);

  const expired = State.normalizeState(
    structuredClone(state),
    "run",
    1_030 + State.PRE_CLICK_LEASE_MS + 1
  );
  assert.equal(
    State.authorizeAddClick(expired, PRODUCT, "tab:1", 1_030 + State.PRE_CLICK_LEASE_MS + 2).reason,
    "add-reservation-expired"
  );
});

test("cart verification resolves the add boundary without allowing a second add", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "confirmed", 1_030).ok, true);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_040).ok, true, "the owning tab may continue from cart to checkout");
  assert.equal(State.claim(state, PRODUCT, "tab:2", 1_041).reason, "cart-confirmed");
  assert.equal(State.release(state, PRODUCT, "tab:1").reason, "post-mutation-held");
});

test("add-only releases the retailer lane only through confirmed cart completion", () => {
  const product = { id: "walmart:1000001", retailer: "walmart", action: "cart" };
  const next = { id: "walmart:1000002", retailer: "walmart", action: "cart" };
  const state = State.createState("run", 1_000);
  State.claim(state, product, "tab:1", 1_000);
  State.beginAddAction(state, product, "tab:1", 1_010);
  State.markAddAction(state, product, "tab:1", "clicked", 1_020);
  State.markAddAction(state, product, "tab:1", "confirmed", 1_030);
  assert.equal(State.release(state, product, "tab:1").reason, "post-mutation-held");
  assert.equal(State.claim(state, next, "tab:2", 1_040).reason, "store-busy");
  assert.equal(State.complete(state, product, 1_050).ok, true);
  assert.equal(State.claim(state, next, "tab:2", 1_060).ok, true);
});

test("review readiness, manual intent, confirmation, and abandonment are durable", () => {
  const review = { id: "target:1011960739", retailer: "target", action: "review" };
  const next = { id: "target:1011483406", retailer: "target", action: "cart" };
  const state = State.createState("run", 1_000);
  State.claim(state, review, "tab:1", 1_000);
  State.beginAddAction(state, review, "tab:1", 1_010);
  State.markAddAction(state, review, "tab:1", "clicked", 1_020);
  State.markAddAction(state, review, "tab:1", "confirmed", 1_030);
  assert.equal(State.beginManualReview(state, review, "tab:1", "a".repeat(64), 1_040).ok, true);
  assert.equal(State.complete(state, review, 1_050).ok, true, "authoritative confirmation may race the async click receipt");
  const completedRestart = State.normalizeState(structuredClone(state), "run", 99_000_000);
  assert.equal(completedRestart.locks["store:target"], undefined, "completed workflows never reconstruct a held lane");

  const pending = State.createState("run", 1_000);
  State.claim(pending, review, "tab:1", 1_000);
  State.beginAddAction(pending, review, "tab:1", 1_010);
  State.markAddAction(pending, review, "tab:1", "clicked", 1_020);
  State.markAddAction(pending, review, "tab:1", "confirmed", 1_030);
  State.beginManualReview(pending, review, "tab:1", "a".repeat(64), 1_040);
  assert.equal(State.beginManualReview(pending, review, "tab:1", "b".repeat(64), 1_045).reason, "review-evidence-changed");
  assert.equal(State.release(pending, review, "tab:1").reason, "post-mutation-held");
  assert.equal(State.claim(pending, next, "tab:2", 1_060).reason, "store-busy");

  const restored = State.normalizeState(structuredClone(pending), "run", 99_000_000);
  assert.equal(State.productState(restored, review).workflow.phase, "awaiting-manual-outcome");
  assert.equal(State.markManualSubmitObserved(restored, review, "tab:1", "b".repeat(64), 1_070).reason, "review-evidence-changed");
  assert.equal(State.markManualSubmitObserved(restored, review, "tab:1", "a".repeat(64), 1_080).ok, true);
  assert.equal(State.complete(restored, review, 1_090).ok, true);

  const abandoned = State.createState("run", 2_000);
  State.claim(abandoned, review, "tab:1", 2_000);
  State.beginAddAction(abandoned, review, "tab:1", 2_010);
  State.markAddAction(abandoned, review, "tab:1", "clicked", 2_020);
  State.markAddAction(abandoned, review, "tab:1", "confirmed", 2_030);
  State.beginManualReview(abandoned, review, "tab:1", "c".repeat(64), 2_040);
  assert.equal(State.abandon(abandoned, review, 2_050).released, true);
  assert.equal(State.claim(abandoned, next, "tab:2", 2_060).ok, true);
});

test("same-run legacy uncertain receipts migrate additively and restore the store lane", () => {
  const legacy = {
    version: 2,
    runId: "run",
    runStartedAt: 1,
    locks: {},
    completed: {},
    products: {
      [PRODUCT.id]: {
        attempts: 2,
        proof: null,
        submission: { phase: "uncertain", updatedAt: 10, evidenceHash: "receipt" },
        addAction: { phase: "clicked", ownerId: "tab:9", updatedAt: 9 }
      }
    }
  };
  const state = State.normalizeState(legacy, "run", 10_000);
  assert.equal(state.version, State.STATE_VERSION);
  assert.equal(state.products[PRODUCT.id].submission.phase, "uncertain");
  assert.equal(state.locks["store:walmart"].hold, true);
  assert.equal(State.claim(state, { ...PRODUCT, id: "walmart:2" }, "tab:2", 10_001).reason, "store-busy");
});

test("conflicting same-store legacy uncertainty quarantines the retailer lane", () => {
  const first = PRODUCT.id;
  const second = "walmart:987654321";
  const uncertain = (ownerId) => ({
    attempts: 1,
    proof: null,
    submission: { phase: "uncertain", updatedAt: 10, evidenceHash: "receipt" },
    addAction: { phase: "clicked", ownerId, updatedAt: 9 }
  });
  const state = State.normalizeState({
    version: 2,
    runId: "run",
    runStartedAt: 1,
    locks: {},
    completed: {},
    products: { [first]: uncertain("tab:1"), [second]: uncertain("tab:2") }
  }, "run", 10_000);
  assert.equal(state.locks["store:walmart"].productId, "conflict");
  assert.deepEqual(state.locks["store:walmart"].conflictProductIds.sort(), [first, second].sort());
  assert.equal(State.claim(state, { ...PRODUCT, id: "walmart:3" }, "tab:3", 10_001).reason, "store-busy");
});

test("an explicit checkout rejection rewinds only to held cart-confirmed state", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);
  State.markAddAction(state, PRODUCT, "tab:1", "confirmed", 1_030);
  State.beginSubmission(state, PRODUCT, "tab:1", "a".repeat(64), 1_040);
  State.markSubmission(state, PRODUCT, "tab:1", "clicked", 1_050);
  assert.equal(State.markSubmission(state, PRODUCT, "tab:1", "failed", 1_060).ok, true);
  assert.equal(State.productState(state, PRODUCT).workflow.phase, "cart-confirmed");
  assert.equal(state.locks["store:walmart"].hold, true);
  const restored = State.normalizeState(structuredClone(state), "run", 99_000_000);
  assert.equal(restored.locks["store:walmart"].productId, PRODUCT.id);
});

test("a definitively missing cart line clears the add boundary for a bounded retry", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);
  State.markAddAction(state, PRODUCT, "tab:1", "clicked", 1_020);

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "canceled", 1_030).reason, "add-uncertain");
  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "failed", 1_040).ok, true);
  assert.equal(state.locks[`store:${PRODUCT.retailer}`], undefined);
  assert.equal(State.claim(state, PRODUCT, "tab:1", 1_050).ok, true);
});

test("a canceled pre-click Add reservation releases the store lane immediately", () => {
  const state = State.createState("run", 1_000);
  const next = { ...PRODUCT, id: "walmart:987654321" };
  State.claim(state, PRODUCT, "tab:1", 1_000);
  State.beginAddAction(state, PRODUCT, "tab:1", 1_010);

  assert.equal(State.markAddAction(state, PRODUCT, "tab:1", "canceled", 1_020).ok, true);
  assert.equal(State.claim(state, next, "tab:2", 1_021).ok, true);
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

test("review and submission evidence hashes are exactly lowercase SHA-256 hex", () => {
  const checkout = State.createState("run", 1_000);
  State.claim(checkout, PRODUCT, "tab:1", 1_000);
  for (const invalid of ["", "a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(65)]) {
    assert.equal(State.beginSubmission(checkout, PRODUCT, "tab:1", invalid, 1_010).reason, "invalid-evidence-hash");
  }
  assert.equal(State.beginSubmission(checkout, PRODUCT, "tab:1", "a".repeat(64), 1_020).ok, true);

  const review = { id: "target:1011960739", retailer: "target", action: "review" };
  const state = State.createState("run", 2_000);
  State.claim(state, review, "tab:2", 2_000);
  State.beginAddAction(state, review, "tab:2", 2_010);
  State.markAddAction(state, review, "tab:2", "clicked", 2_020);
  State.markAddAction(state, review, "tab:2", "confirmed", 2_030);
  assert.equal(State.beginManualReview(state, review, "tab:2", "B".repeat(64), 2_040).reason, "invalid-evidence-hash");
  assert.equal(State.beginManualReview(state, review, "tab:2", "b".repeat(64), 2_050).ok, true);
  assert.equal(State.markManualSubmitObserved(state, review, "tab:2", "b".repeat(63), 2_060).reason, "invalid-evidence-hash");
});

test("normalization removes stale locks for completed products", () => {
  const state = State.createState("run", 1_000);
  state.completed[PRODUCT.id] = new Date(1_100).toISOString();
  state.products[PRODUCT.id] = {
    attempts: 1,
    proof: null,
    submission: { phase: "uncertain", updatedAt: 1_050, evidenceHash: "a".repeat(64) },
    addAction: { phase: "clicked", ownerId: "tab:1", updatedAt: 1_040 },
    workflow: { phase: "submission-uncertain", ownerId: "tab:1", updatedAt: 1_050, evidenceHash: "a".repeat(64) }
  };
  state.locks[`product:${PRODUCT.id}`] = { productId: PRODUCT.id, ownerId: "tab:1", hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
  state.locks["store:walmart"] = { productId: PRODUCT.id, ownerId: "tab:1", hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
  const normalized = State.normalizeState(state, "run", 2_000);
  assert.equal(normalized.locks[`product:${PRODUCT.id}`], undefined);
  assert.equal(normalized.locks["store:walmart"], undefined);
});

test("known-no-order resolution is explicit and only available for held outcomes", () => {
  const state = State.createState("run", 1_000);
  assert.equal(State.knownNoOrderRequired(state, PRODUCT), false);
  assert.equal(State.abandon(state, PRODUCT, 1_010).reason, "resolution-not-required");
  State.claim(state, PRODUCT, "tab:1", 1_020);
  State.beginSubmission(state, PRODUCT, "tab:1", "a".repeat(64), 1_030);
  State.markSubmission(state, PRODUCT, "tab:1", "clicked", 1_040);
  assert.equal(State.knownNoOrderRequired(state, PRODUCT), true);
  assert.equal(State.abandon(state, PRODUCT, 1_050).released, true);
  assert.equal(State.knownNoOrderRequired(state, PRODUCT), false);
});

test("operator resolution requires the exact owning tab and an explicit acknowledgment", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:7", 1_000);
  State.beginSubmission(state, PRODUCT, "tab:7", "a".repeat(64), 1_010);
  State.markSubmission(state, PRODUCT, "tab:7", "clicked", 1_020);

  assert.equal(State.operatorResolution(state, PRODUCT, "tab:other", false, 1_030).reason, "operator-tab-required");
  assert.equal(State.operatorResolution(state, PRODUCT, "tab:8", false, 1_030).reason, "operator-owner-mismatch");
  const inspected = State.operatorResolution(state, PRODUCT, "tab:7", false, 1_030);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.phase, "submission-uncertain");
  assert.ok(state.locks["store:walmart"]);
  const resolved = State.operatorResolution(state, PRODUCT, "tab:7", true, 1_040);
  assert.equal(resolved.released, true);
  assert.equal(state.locks["store:walmart"], undefined);
});

test("operator resolution cannot clear a conflicted legacy store lane", () => {
  const state = State.createState("run", 1_000);
  State.claim(state, PRODUCT, "tab:7", 1_000);
  State.beginSubmission(state, PRODUCT, "tab:7", "a".repeat(64), 1_010);
  State.markSubmission(state, PRODUCT, "tab:7", "clicked", 1_020);
  state.locks["store:walmart"] = {
    productId: "conflict",
    ownerId: "manual-resolution-required",
    expiresAt: Number.MAX_SAFE_INTEGER,
    hold: true,
    conflictProductIds: [PRODUCT.id, "walmart:987654321"]
  };
  assert.equal(State.operatorResolution(state, PRODUCT, "tab:7", true, 1_030).reason, "operator-resolution-conflict");
});

test("the extension exposes operator resolution only through its exact popup and owning active tab", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  assert.match(background, /sender\?\.url === chrome\.runtime\.getURL\("popup\.html"\)/);
  assert.match(background, /operatorTabBinding[\s\S]*?TabContext\.contextForTab/);
  assert.match(background, /missions\/operator-resolution\/authorize[\s\S]*?X-Cart-Assist-Token/);
  assert.match(background, /checkedOrderHistory !== true \|\| input\?\.abandonMission !== true/);
  assert.doesNotMatch(content, /RESOLVE_OPERATOR_UNCERTAINTY/);
  assert.match(popup, /CART_CONFIRM_RESOLVE_OPERATOR_UNCERTAINTY[\s\S]*?checkedOrderHistory: true[\s\S]*?abandonMission: true/);
});

test("different retailer lanes can proceed while one retailer is held", () => {
  const state = State.createState("run", 1_000);
  const target = { id: "target:1011960739", retailer: "target", action: "cart" };
  const amazon = { id: "amazon:B0ABC12345", retailer: "amazon", action: "checkout" };
  assert.equal(State.claim(state, target, "tab:1", 1_000).ok, true);
  assert.equal(State.claim(state, amazon, "tab:2", 1_001).ok, true);
});

test("a stranded confirmed cart mission can be finalized to free the store lane", () => {
  const cartA = { id: "target:1111111111", retailer: "target", action: "cart" };
  const cartB = { id: "target:2222222222", retailer: "target", action: "cart" };
  const state = State.createState("run", 1_000);
  State.claim(state, cartA, "tab:A", 1_000);
  State.beginAddAction(state, cartA, "tab:A", 1_100);
  State.markAddAction(state, cartA, "tab:A", "clicked", 1_200);
  State.markAddAction(state, cartA, "tab:A", "confirmed", 1_300);

  // Without completion bookkeeping the held lane blocks B indefinitely, even
  // after a state reload half an hour later.
  const blocked = State.claim(state, cartB, "tab:B", 1_000 + 30 * 60_000);
  assert.equal(blocked.reason, "store-busy");
  assert.equal(blocked.held, true);
  assert.equal(blocked.blockingPhase, "cart-confirmed");
  assert.equal(blocked.activeProductId, cartA.id);

  // The heal is exactly the interrupted flow's own completion call: for a
  // cart-action mission, addAction "confirmed" IS the achieved deliverable.
  assert.equal(State.complete(state, cartA, 1_000 + 30 * 60_000 + 1).ok, true);
  assert.equal(State.claim(state, cartB, "tab:B", 1_000 + 30 * 60_000 + 2).ok, true);

  // A held checkout/review mission is NOT completable this way — complete()
  // itself refuses without a submission or manual-outcome intent.
  const checkoutA = { id: "walmart:333333333", retailer: "walmart", action: "checkout" };
  const other = State.createState("run", 1_000);
  State.claim(other, checkoutA, "tab:A", 1_000);
  State.beginAddAction(other, checkoutA, "tab:A", 1_100);
  State.markAddAction(other, checkoutA, "tab:A", "clicked", 1_200);
  State.markAddAction(other, checkoutA, "tab:A", "confirmed", 1_300);
  assert.equal(State.complete(other, checkoutA, 1_400).ok, false);
  assert.equal(State.complete(other, checkoutA, 1_400).reason, "submission-intent-missing");
});
