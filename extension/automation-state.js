"use strict";

(() => {
  const STATE_VERSION = 3;
  const LOCK_MS = 10 * 60_000;
  const TARGET_PERSISTENCE_WINDOW_MS = 20_000;
  const MIN_TARGET_PERSISTENCE_WINDOW_MS = 5_000;
  const MAX_TARGET_PERSISTENCE_WINDOW_MS = 120_000;
  const TARGET_PERSISTENCE_LIMITS = Object.freeze({
    add: 16,
    quantity: 12,
    cart: 10,
    checkout: 8,
    submit: 3
  });

  function emptyTargetPersistence() {
    return Object.fromEntries(
      Object.keys(TARGET_PERSISTENCE_LIMITS).map((kind) => [kind, {
        attempts: 0,
        startedAt: 0,
        updatedAt: 0
      }])
    );
  }

  function normalizeTargetPersistence(input) {
    const normalized = emptyTargetPersistence();
    for (const kind of Object.keys(TARGET_PERSISTENCE_LIMITS)) {
      const value = input?.[kind] || {};
      normalized[kind] = {
        attempts: Number.isInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
        startedAt: Number.isFinite(Number(value.startedAt)) && Number(value.startedAt) >= 0
          ? Number(value.startedAt)
          : 0,
        updatedAt: Number.isFinite(Number(value.updatedAt)) && Number(value.updatedAt) >= 0
          ? Number(value.updatedAt)
          : 0
      };
    }
    return normalized;
  }

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
      submission: { phase: "idle", updatedAt: 0, evidenceHash: "" },
      addAction: { phase: "idle", ownerId: "", updatedAt: 0 },
      targetPersistence: emptyTargetPersistence()
    };
    const record = state.products[key];
    record.addAction ||= { phase: "idle", ownerId: "", updatedAt: 0 };
    record.targetPersistence = normalizeTargetPersistence(record.targetPersistence);
    return record;
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

  // An explicitly armed watcher has no wall-clock or per-product attempt
  // expiry. Stop/disarm is its termination boundary; the separate rolling
  // per-store action budget still governs every retailer mutation/navigation.
  function budgetReason() {
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
    if (["reserved", "clicked"].includes(record.addAction?.phase)) {
      return { ok: false, reason: "add-in-flight" };
    }
    if (record.addAction?.phase === "confirmed" && record.addAction.ownerId !== ownerId) {
      return { ok: false, reason: "cart-confirmed" };
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

  // A blocked or retrying pre-submit workflow must not starve the rest of the
  // store's missions for the full lock TTL. Durable submit intent remains a
  // hard boundary: once submission may have happened, no automatic release is
  // allowed until explicit failure or confirmation resolves it.
  function release(state, product, ownerId) {
    const record = recordFor(state, product.id);
    if (["intent", "uncertain"].includes(record.submission?.phase)) {
      return { ok: false, reason: "submission-uncertain", released: false };
    }
    if (record.addAction?.phase === "clicked") {
      return { ok: false, reason: "add-uncertain", released: false };
    }
    let released = false;
    for (const [key, lock] of Object.entries(state.locks)) {
      if (lock?.productId === product.id && lock.ownerId === ownerId) {
        delete state.locks[key];
        released = true;
      }
    }
    return { ok: true, released };
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

  function reserveTargetPersistence(state, product, ownerId, kind, policyOrNow = {}, requestedNow = Date.now()) {
    const legacyNow = typeof policyOrNow === "number" ? policyOrNow : requestedNow;
    const policy = typeof policyOrNow === "number" ? {} : policyOrNow;
    const configuredWindowMs = Number(policy?.windowMs);
    const windowMs = Number.isFinite(configuredWindowMs)
      && configuredWindowMs >= MIN_TARGET_PERSISTENCE_WINDOW_MS
      && configuredWindowMs <= MAX_TARGET_PERSISTENCE_WINDOW_MS
      ? configuredWindowMs
      : TARGET_PERSISTENCE_WINDOW_MS;
    const now = Number(legacyNow);
    const normalizedKind = String(kind || "");
    const limit = TARGET_PERSISTENCE_LIMITS[normalizedKind];
    if (product.retailer !== "target") return { ok: false, reason: "target-only" };
    if (product.executionMode !== "blitz") return { ok: false, reason: "blitz-required" };
    if (!limit) return { ok: false, reason: "invalid-persistence-kind" };
    if (state.completed[product.id]) return { ok: false, reason: "completed" };
    const budget = budgetReason(state, product, now);
    if (budget) return { ok: false, reason: budget };

    const record = recordFor(state, product.id);
    const lock = state.locks[`product:${product.id}`];
    const knownOwner = String(record.addAction?.ownerId || lock?.ownerId || "");
    if (knownOwner && knownOwner !== ownerId) {
      return { ok: false, reason: "product-busy" };
    }

    const current = record.targetPersistence[normalizedKind];
    const startedAt = current.attempts > 0 ? current.startedAt : now;
    if (now - startedAt > windowMs || current.attempts >= limit) {
      return {
        ok: false,
        reason: "target-persistence-exhausted",
        kind: normalizedKind,
        attempts: current.attempts,
        limit,
        expiresAt: startedAt + windowMs
      };
    }

    record.targetPersistence[normalizedKind] = {
      attempts: current.attempts + 1,
      startedAt,
      updatedAt: now
    };
    return {
      ok: true,
      kind: normalizedKind,
      attempt: current.attempts + 1,
      remaining: limit - current.attempts - 1,
      expiresAt: startedAt + windowMs,
      windowMs,
      targetPersistence: record.targetPersistence
    };
  }

  function beginAddAction(state, product, ownerId, now = Date.now()) {
    const record = recordFor(state, product.id);
    if (record.addAction.phase !== "idle") {
      return {
        ok: false,
        reason: record.addAction.phase === "confirmed" ? "cart-confirmed" : "add-in-flight",
        addAction: record.addAction
      };
    }
    for (const key of lockKeys(product)) {
      const lock = state.locks[key];
      if (!lock || lock.productId !== product.id || lock.ownerId !== ownerId) {
        return { ok: false, reason: key.startsWith("store:") ? "store-busy" : "product-busy" };
      }
    }
    record.addAction = {
      phase: "reserved",
      ownerId: String(ownerId || ""),
      updatedAt: now
    };
    return { ok: true, addAction: record.addAction };
  }

  function markAddAction(state, product, ownerId, outcome, now = Date.now()) {
    const record = recordFor(state, product.id);
    const action = record.addAction;
    if (action.ownerId && action.ownerId !== ownerId) {
      return { ok: false, reason: "product-busy", addAction: action };
    }
    if (outcome === "clicked") {
      if (action.phase !== "reserved") return { ok: false, reason: "add-in-flight", addAction: action };
      record.addAction = { ...action, phase: "clicked", updatedAt: now };
      for (const key of lockKeys(product)) {
        if (state.locks[key]?.productId === product.id) {
          state.locks[key] = {
            ...state.locks[key],
            hold: true,
            expiresAt: Number.MAX_SAFE_INTEGER
          };
        }
      }
      return { ok: true, addAction: record.addAction };
    }
    if (outcome === "confirmed") {
      if (action.phase !== "clicked") return { ok: false, reason: "add-not-clicked", addAction: action };
      record.addAction = { ...action, phase: "confirmed", updatedAt: now };
      for (const key of lockKeys(product)) {
        if (state.locks[key]?.productId === product.id) {
          state.locks[key] = {
            ...state.locks[key],
            hold: false,
            expiresAt: now + LOCK_MS
          };
        }
      }
      return { ok: true, addAction: record.addAction };
    }
    if (["canceled", "failed"].includes(outcome)) {
      if (action.phase === "clicked" && outcome !== "failed") {
        return { ok: false, reason: "add-uncertain", addAction: action };
      }
      record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
      record.proof = null;
      for (const key of lockKeys(product)) {
        if (state.locks[key]?.productId === product.id) {
          state.locks[key] = {
            ...state.locks[key],
            hold: false,
            expiresAt: now + LOCK_MS
          };
        }
      }
      return { ok: true, addAction: record.addAction };
    }
    return { ok: false, reason: "invalid-outcome", addAction: action };
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
      addAction: record.addAction,
      targetPersistence: record.targetPersistence,
      budgetReason: budgetReason(state, product, now),
      lock: state.locks[`product:${product.id}`] || null
    };
  }

  const api = Object.freeze({
    LOCK_MS,
    MAX_TARGET_PERSISTENCE_WINDOW_MS,
    MIN_TARGET_PERSISTENCE_WINDOW_MS,
    STATE_VERSION,
    TARGET_PERSISTENCE_LIMITS,
    TARGET_PERSISTENCE_WINDOW_MS,
    beginAddAction,
    beginSubmission,
    claim,
    complete,
    createState,
    markAddAction,
    markSubmission,
    normalizeState,
    productState,
    recordAttempt,
    release,
    reserveTargetPersistence,
    saveProof
  });

  globalThis.CartConfirmAutomationState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
