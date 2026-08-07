"use strict";

(() => {
  const STATE_VERSION = 3;
  const LOCK_MS = 10 * 60_000;
  const MAX_RUN_MS = 4 * 60 * 60_000;
  const MAX_PRODUCT_ATTEMPTS = 100;

  function createState(runId, now = Date.now()) {
    return {
      version: STATE_VERSION,
      runId: String(runId || ""),
      runStartedAt: now,
      locks: {},
      completed: {},
      products: {}
    };
  }

  function normalizeState(input, runId, now = Date.now()) {
    const expectedRunId = String(runId || "");
    const state = input && typeof input === "object" && input.version === STATE_VERSION && input.runId === expectedRunId
      ? input
      : createState(expectedRunId, now);
    state.locks ||= {};
    state.completed ||= {};
    state.products ||= {};
    state.runStartedAt = Number.isFinite(Number(state.runStartedAt)) ? Number(state.runStartedAt) : now;
    for (const [key, lock] of Object.entries(state.locks)) {
      if (!lock || (!lock.hold && Number(lock.expiresAt || 0) <= now)) delete state.locks[key];
    }
    return state;
  }

  function recordFor(state, productId) {
    const key = String(productId || "");
    state.products[key] ||= {
      attempts: 0,
      proof: null,
      submission: { phase: "idle", updatedAt: 0, evidenceHash: "" }
    };
    return state.products[key];
  }

  // Every product gets its own lock so duplicate tabs cannot double-process
  // it, and add-only products run in parallel. Checkout and final-review
  // products additionally take the store lane: only one purchase workflow per
  // store at a time.
  function lockKeys(product) {
    const keys = [`product:${product.id}`];
    if (product.action !== "cart") keys.push(`store:${product.retailer}`);
    return keys;
  }

  function budgetReason(state, product, now = Date.now()) {
    if (now - state.runStartedAt > MAX_RUN_MS) return "run-expired";
    if (recordFor(state, product.id).attempts >= MAX_PRODUCT_ATTEMPTS) return "attempt-budget-exhausted";
    return "";
  }

  function claim(state, product, ownerId, now = Date.now()) {
    if (state.completed[product.id]) return { ok: false, reason: "completed" };
    const budget = budgetReason(state, product, now);
    if (budget) return { ok: false, reason: budget };
    const record = recordFor(state, product.id);
    if (["intent", "uncertain"].includes(record.submission?.phase)) {
      return { ok: false, reason: "submission-uncertain" };
    }
    const keys = lockKeys(product);
    for (const key of keys) {
      const lock = state.locks[key];
      if (lock && lock.ownerId !== ownerId) {
        return {
          ok: false,
          reason: key.startsWith("store:") ? "store-busy" : "product-busy",
          activeProductId: lock.productId
        };
      }
    }
    for (const key of keys) {
      state.locks[key] = {
        productId: product.id,
        ownerId,
        expiresAt: now + LOCK_MS,
        hold: false
      };
    }
    return { ok: true };
  }

  function recordAttempt(state, product, now = Date.now()) {
    const budget = budgetReason(state, product, now);
    if (budget) return { ok: false, reason: budget, attempt: recordFor(state, product.id).attempts };
    const record = recordFor(state, product.id);
    record.attempts += 1;
    return { ok: true, attempt: record.attempts };
  }

  function saveProof(state, product, input, now = Date.now()) {
    const source = input?.source === "cart" ? "cart" : "product";
    const record = recordFor(state, product.id);
    record.proof = {
      productId: product.id,
      runId: state.runId,
      price: Number.isFinite(Number(input?.price)) ? Math.round(Number(input.price) * 100) / 100 : null,
      seller: String(input?.seller || "").replace(/\s+/g, " ").trim().slice(0, 240),
      firstParty: input?.firstParty === true,
      quantityConfirmed: source === "cart" && input?.quantityConfirmed === true,
      inventoryConfirmed: source === "cart" && input?.inventoryConfirmed === true,
      cartLineCount: source === "cart" && Number.isInteger(input?.cartLineCount) ? input.cartLineCount : 0,
      cartSku: source === "cart" ? String(input?.cartSku || "").slice(0, 24) : "",
      source,
      cartConfirmedAt: source === "cart" ? now : 0,
      verifiedAt: now
    };
    return { ok: true, proof: record.proof };
  }

  function beginSubmission(state, product, ownerId, evidenceHash, now = Date.now()) {
    if (product.action !== "checkout") return { ok: false, reason: "manual-action-required" };
    if (state.completed[product.id]) return { ok: false, reason: "completed" };
    const budget = budgetReason(state, product, now);
    if (budget) return { ok: false, reason: budget };
    const keys = lockKeys(product);
    for (const key of keys) {
      const lock = state.locks[key];
      if (!lock || lock.productId !== product.id || lock.ownerId !== ownerId) {
        return { ok: false, reason: "store-busy" };
      }
    }
    const record = recordFor(state, product.id);
    if (["intent", "uncertain"].includes(record.submission?.phase)) {
      return { ok: false, reason: "submission-uncertain" };
    }
    record.submission = {
      phase: "intent",
      updatedAt: now,
      evidenceHash: String(evidenceHash || "").slice(0, 200)
    };
    for (const key of keys) {
      state.locks[key] = { ...state.locks[key], hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
    }
    return { ok: true, submission: record.submission };
  }

  function markSubmission(state, product, ownerId, outcome, now = Date.now()) {
    const record = recordFor(state, product.id);
    const keys = lockKeys(product);
    for (const key of keys) {
      const lock = state.locks[key];
      if (lock && (lock.productId !== product.id || lock.ownerId !== ownerId)) {
        return { ok: false, reason: "store-busy" };
      }
    }
    if (outcome === "clicked") {
      if (record.submission?.phase !== "intent") return { ok: false, reason: "submission-uncertain" };
      record.submission = { ...record.submission, phase: "uncertain", updatedAt: now };
      for (const key of keys) {
        if (state.locks[key]) {
          state.locks[key] = { ...state.locks[key], hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
        }
      }
      return { ok: true, submission: record.submission };
    }
    if (["canceled", "failed"].includes(outcome)) {
      record.submission = { phase: "idle", updatedAt: now, evidenceHash: "" };
      for (const [key, lock] of Object.entries(state.locks)) {
        if (lock?.productId === product.id) delete state.locks[key];
      }
      return { ok: true, submission: record.submission };
    }
    return { ok: false, reason: "invalid-outcome" };
  }

  function complete(state, product, now = Date.now()) {
    const record = recordFor(state, product.id);
    if (state.completed[product.id]) return { ok: true, alreadyCompleted: true };
    if (product.action === "checkout" && !["intent", "uncertain"].includes(record.submission?.phase)) {
      return { ok: false, reason: "submission-intent-missing" };
    }
    state.completed[product.id] = new Date(now).toISOString();
    if (product.action === "checkout") record.submission = { ...record.submission, phase: "confirmed", updatedAt: now };
    for (const [key, lock] of Object.entries(state.locks)) {
      if (lock?.productId === product.id) delete state.locks[key];
    }
    return { ok: true };
  }

  function productState(state, product, now = Date.now()) {
    const record = recordFor(state, product.id);
    return {
      completed: Boolean(state.completed[product.id]),
      attempts: record.attempts,
      proof: record.proof,
      submission: record.submission,
      budgetReason: budgetReason(state, product, now),
      lock: state.locks[`product:${product.id}`] || null
    };
  }

  const api = Object.freeze({
    LOCK_MS,
    MAX_PRODUCT_ATTEMPTS,
    MAX_RUN_MS,
    STATE_VERSION,
    beginSubmission,
    claim,
    complete,
    createState,
    markSubmission,
    normalizeState,
    productState,
    recordAttempt,
    saveProof
  });

  globalThis.CartConfirmAutomationState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
