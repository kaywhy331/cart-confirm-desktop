"use strict";

(() => {
  const STATE_VERSION = 3;
  const PRE_CLICK_LEASE_MS = 15_000;
  // A plain claim has not crossed a cart boundary. Keep that lease short so a
  // crashed page cannot strand every other mission. Reserving Add below uses
  // a separate bounded pre-click lease; a clicked receipt is still held
  // indefinitely.
  const CLAIM_LOCK_MS = 30_000;
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
  const HELD_WORKFLOW_PHASES = new Set([
    "cart-confirmed",
    "awaiting-manual-outcome",
    "manual-submit-observed",
    "submission-uncertain"
  ]);
  const TERMINAL_WORKFLOW_PHASES = new Set([
    "confirmed",
    "explicitly-failed",
    "abandoned",
    "legacy-outcome-unknown"
  ]);
  const EVIDENCE_HASH_PATTERN = /^[a-f0-9]{64}$/;

  function normalizeEvidenceHash(value) {
    const normalized = String(value || "");
    return EVIDENCE_HASH_PATTERN.test(normalized) ? normalized : "";
  }

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

  function normalizeSubmission(input) {
    const phase = ["idle", "intent", "uncertain", "confirmed", "explicitly-failed", "abandoned"]
      .includes(input?.phase)
      ? input.phase
      : "idle";
    return {
      phase,
      updatedAt: Number.isFinite(Number(input?.updatedAt)) ? Number(input.updatedAt) : 0,
      evidenceHash: normalizeEvidenceHash(input?.evidenceHash)
    };
  }

  function normalizeAddAction(input) {
    const phase = ["idle", "reserved", "clicked", "confirmed"].includes(input?.phase)
      ? input.phase
      : "idle";
    return {
      phase,
      ownerId: String(input?.ownerId || "").slice(0, 100),
      updatedAt: Number.isFinite(Number(input?.updatedAt)) ? Number(input.updatedAt) : 0
    };
  }

  function inferredWorkflow(record) {
    if (["intent", "uncertain"].includes(record.submission.phase)) {
      return {
        phase: "submission-uncertain",
        ownerId: record.addAction.ownerId,
        updatedAt: record.submission.updatedAt,
        evidenceHash: record.submission.evidenceHash
      };
    }
    if (record.submission.phase === "confirmed") {
      return { phase: "confirmed", ownerId: record.addAction.ownerId, updatedAt: record.submission.updatedAt, evidenceHash: record.submission.evidenceHash };
    }
    if (record.addAction.phase === "confirmed") {
      return { phase: "cart-confirmed", ownerId: record.addAction.ownerId, updatedAt: record.addAction.updatedAt, evidenceHash: "" };
    }
    return { phase: "active", ownerId: record.addAction.ownerId, updatedAt: record.addAction.updatedAt, evidenceHash: "" };
  }

  function normalizeWorkflow(input, record) {
    const phase = [
      "active",
      "cart-confirmed",
      "review-ready",
      "awaiting-manual-outcome",
      "manual-submit-observed",
      "submission-uncertain",
      "confirmed",
      "explicitly-failed",
      "abandoned",
      "legacy-outcome-unknown"
    ].includes(input?.phase)
      ? input.phase
      : "";
    if (!phase) return inferredWorkflow(record);
    return {
      phase: phase === "review-ready" ? "awaiting-manual-outcome" : phase,
      ownerId: String(input?.ownerId || record.addAction.ownerId || "").slice(0, 100),
      updatedAt: Number.isFinite(Number(input?.updatedAt)) ? Number(input.updatedAt) : 0,
      evidenceHash: normalizeEvidenceHash(input?.evidenceHash)
    };
  }

  function ensureHeldLock(state, key, productId, ownerId) {
    const current = state.locks[key];
    if (current?.hold) {
      if (current.productId !== productId) {
        state.locks[key] = {
          productId: "conflict",
          ownerId: "manual-resolution-required",
          expiresAt: Number.MAX_SAFE_INTEGER,
          hold: true,
          conflictProductIds: [...new Set([
            ...(current.conflictProductIds || []),
            current.productId,
            productId
          ].filter((value) => value && value !== "conflict"))].slice(0, 20)
        };
      }
      return;
    }
    state.locks[key] = {
      productId,
      ownerId: String(ownerId || current?.ownerId || `recovered:${productId}`).slice(0, 100),
      expiresAt: Number.MAX_SAFE_INTEGER,
      hold: true
    };
  }

  function normalizeState(input, runId, now = Date.now()) {
    const expectedRunId = String(runId || "");
    // The storage key intentionally remains cartConfirmAutomationStateV3.
    // Accept older same-run objects and migrate them additively so a schema
    // update can never erase an uncertain add or submit receipt.
    const state = input && typeof input === "object" && !Array.isArray(input) && input.runId === expectedRunId
      ? input
      : createState(expectedRunId, now);
    state.version = STATE_VERSION;
    state.locks ||= {};
    state.completed ||= {};
    state.products ||= {};
    state.runStartedAt = Number.isFinite(Number(state.runStartedAt)) ? Number(state.runStartedAt) : now;
    for (const [key, lock] of Object.entries(state.locks)) {
      if (!lock || (!lock.hold && Number(lock.expiresAt || 0) <= now)) delete state.locks[key];
    }
    for (const [productId, inputRecord] of Object.entries(state.products)) {
      if (!inputRecord || typeof inputRecord !== "object") {
        delete state.products[productId];
        continue;
      }
      const record = inputRecord;
      record.attempts = Number.isInteger(record.attempts) && record.attempts >= 0 ? record.attempts : 0;
      record.submission = normalizeSubmission(record.submission);
      record.addAction = normalizeAddAction(record.addAction);
      record.workflow = normalizeWorkflow(record.workflow, record);
      record.targetPersistence = normalizeTargetPersistence(record.targetPersistence);
      if (
        record.addAction.phase === "reserved"
        && record.addAction.updatedAt + PRE_CLICK_LEASE_MS <= now
      ) {
        // No retailer mutation has happened at the reserved phase. Recover a
        // crashed preparation promptly, but never remove a held lock that may
        // represent a clicked Add, confirmed cart, or uncertain submission.
        record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
        record.proof = null;
        if (record.workflow.phase === "active") {
          record.workflow = { phase: "active", ownerId: "", updatedAt: now, evidenceHash: "" };
        }
        for (const [key, lock] of Object.entries(state.locks)) {
          if (lock?.productId === productId && lock.hold !== true) delete state.locks[key];
        }
      }
      if (state.completed[productId]) {
        record.workflow = { ...record.workflow, phase: "confirmed" };
        for (const [key, lock] of Object.entries(state.locks)) {
          if (lock?.productId === productId) delete state.locks[key];
        }
        continue;
      }
      if (
        ["clicked", "confirmed"].includes(record.addAction.phase)
        || ["intent", "uncertain"].includes(record.submission.phase)
        || HELD_WORKFLOW_PHASES.has(record.workflow.phase)
      ) {
        const ownerId = record.workflow.ownerId || record.addAction.ownerId;
        ensureHeldLock(state, `product:${productId}`, productId, ownerId);
        const retailer = String(productId).split(":", 1)[0];
        if (["target", "walmart", "amazon"].includes(retailer)) {
          ensureHeldLock(state, `store:${retailer}`, productId, ownerId);
        }
      }
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
      workflow: { phase: "active", ownerId: "", updatedAt: 0, evidenceHash: "" },
      targetPersistence: emptyTargetPersistence()
    };
    const record = state.products[key];
    record.submission = normalizeSubmission(record.submission);
    record.addAction = normalizeAddAction(record.addAction);
    record.workflow = normalizeWorkflow(record.workflow, record);
    record.targetPersistence = normalizeTargetPersistence(record.targetPersistence);
    return record;
  }

  // Monitoring may run in parallel, but every mission that can mutate a cart
  // owns one universal retailer lane from its first mutation through a known
  // terminal outcome.
  function lockKeys(product) {
    const keys = [`product:${product.id}`];
    if (product.action !== "watch") keys.push(`store:${product.retailer}`);
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
    if (TERMINAL_WORKFLOW_PHASES.has(record.workflow.phase) && record.workflow.phase !== "confirmed") {
      return { ok: false, reason: "manual-resolution-required" };
    }
    if (["awaiting-manual-outcome", "manual-submit-observed", "submission-uncertain"].includes(record.workflow.phase)) {
      return { ok: false, reason: "manual-outcome-pending" };
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
      const orphanedHeldLock = lock?.hold === true
        && record.addAction.phase === "idle"
        && record.workflow.phase === "active";
      if (lock && (lock.ownerId !== ownerId || lock.productId !== product.id || orphanedHeldLock)) {
        const blockingRecord = state.products[lock.productId];
        const blockingWorkflowPhase = String(blockingRecord?.workflow?.phase || "");
        const blockingAddPhase = String(blockingRecord?.addAction?.phase || "");
        return {
          ok: false,
          reason: key.startsWith("store:") ? "store-busy" : "product-busy",
          activeProductId: lock.productId,
          held: lock.hold === true,
          blockingPhase: HELD_WORKFLOW_PHASES.has(blockingWorkflowPhase)
            ? blockingWorkflowPhase
            : ["clicked", "confirmed"].includes(blockingAddPhase)
              ? `add-${blockingAddPhase}`
              : blockingWorkflowPhase || blockingAddPhase || (lock.hold ? "post-mutation-held" : "active")
        };
      }
    }
    for (const key of keys) {
      state.locks[key] = {
        productId: product.id,
        ownerId,
        expiresAt: now + CLAIM_LOCK_MS,
        hold: false
      };
    }
    if (record.addAction.phase === "idle" && record.workflow.phase === "active") {
      record.workflow = { ...record.workflow, ownerId: String(ownerId || ""), updatedAt: now };
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

  function authorizeAddClick(state, product, ownerId, now = Date.now()) {
    if (state.completed[product.id]) return { ok: false, reason: "completed" };
    const budget = budgetReason(state, product, now);
    if (budget) return { ok: false, reason: budget };
    const record = recordFor(state, product.id);
    if (record.addAction.phase !== "reserved" || record.addAction.ownerId !== ownerId) {
      return {
        ok: false,
        reason: record.addAction.phase === "idle" ? "add-reservation-expired" : "add-in-flight",
        addAction: record.addAction
      };
    }
    for (const key of lockKeys(product)) {
      const lock = state.locks[key];
      if (
        !lock
        || lock.hold === true
        || lock.productId !== product.id
        || lock.ownerId !== ownerId
      ) return { ok: false, reason: key.startsWith("store:") ? "store-busy" : "product-busy" };
    }
    record.attempts += 1;
    record.addAction = { ...record.addAction, updatedAt: now };
    for (const key of lockKeys(product)) {
      state.locks[key] = { ...state.locks[key], expiresAt: now + PRE_CLICK_LEASE_MS };
    }
    return { ok: true, attempt: record.attempts, addAction: record.addAction };
  }

  // A blocked or retrying pre-submit workflow must not starve the rest of the
  // store's missions for the full lock TTL. Durable submit intent remains a
  // hard boundary: once submission may have happened, no automatic release is
  // allowed until explicit failure or confirmation resolves it.
  function release(state, product, ownerId) {
    const record = recordFor(state, product.id);
    if (["intent", "uncertain"].includes(record.submission?.phase) || record.workflow.phase === "submission-uncertain") {
      return { ok: false, reason: "submission-uncertain", released: false };
    }
    if (record.addAction?.phase === "clicked") {
      return { ok: false, reason: "add-uncertain", released: false };
    }
    if (record.addAction?.phase === "confirmed" || HELD_WORKFLOW_PHASES.has(record.workflow.phase)) {
      return { ok: false, reason: "post-mutation-held", released: false };
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
    for (const key of lockKeys(product)) {
      if (state.locks[key]?.productId === product.id && state.locks[key]?.ownerId === ownerId) {
        state.locks[key] = { ...state.locks[key], expiresAt: now + PRE_CLICK_LEASE_MS };
      }
    }
    record.workflow = { phase: "active", ownerId: String(ownerId || ""), updatedAt: now, evidenceHash: "" };
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
      record.workflow = { phase: "cart-confirmed", ownerId: String(ownerId || ""), updatedAt: now, evidenceHash: "" };
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
    if (["canceled", "failed"].includes(outcome)) {
      if (action.phase === "clicked" && outcome !== "failed") {
        return { ok: false, reason: "add-uncertain", addAction: action };
      }
      record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
      record.workflow = { phase: "active", ownerId: "", updatedAt: now, evidenceHash: "" };
      record.proof = null;
      for (const key of lockKeys(product)) {
        if (
          state.locks[key]?.productId === product.id
          && state.locks[key]?.ownerId === ownerId
        ) delete state.locks[key];
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
    const normalizedEvidenceHash = normalizeEvidenceHash(evidenceHash);
    if (!normalizedEvidenceHash) return { ok: false, reason: "invalid-evidence-hash" };
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
      evidenceHash: normalizedEvidenceHash
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
      record.workflow = {
        phase: "submission-uncertain",
        ownerId: String(ownerId || ""),
        updatedAt: now,
        evidenceHash: record.submission.evidenceHash
      };
      for (const key of keys) {
        if (state.locks[key]) {
          state.locks[key] = { ...state.locks[key], hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
        }
      }
      return { ok: true, submission: record.submission };
    }
    if (["canceled", "failed"].includes(outcome)) {
      if (outcome === "failed" && record.addAction.phase === "confirmed") {
        record.submission = { phase: "idle", updatedAt: now, evidenceHash: "" };
        record.workflow = { phase: "cart-confirmed", ownerId: String(ownerId || ""), updatedAt: now, evidenceHash: "" };
        for (const key of keys) {
          if (state.locks[key]?.productId === product.id) {
            state.locks[key] = { ...state.locks[key], hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
          }
        }
      } else {
        record.submission = { phase: outcome === "failed" ? "explicitly-failed" : "idle", updatedAt: now, evidenceHash: "" };
        record.workflow = {
          phase: outcome === "failed" ? "explicitly-failed" : "active",
          ownerId: String(ownerId || ""),
          updatedAt: now,
          evidenceHash: ""
        };
        for (const [key, lock] of Object.entries(state.locks)) {
          if (lock?.productId === product.id) delete state.locks[key];
        }
      }
      return { ok: true, submission: record.submission };
    }
    return { ok: false, reason: "invalid-outcome" };
  }

  function beginManualReview(state, product, ownerId, evidenceHash, now = Date.now()) {
    if (product.action !== "review") return { ok: false, reason: "review-only" };
    if (state.completed[product.id]) return { ok: false, reason: "completed" };
    const normalizedEvidenceHash = normalizeEvidenceHash(evidenceHash);
    if (!normalizedEvidenceHash) return { ok: false, reason: "invalid-evidence-hash" };
    const record = recordFor(state, product.id);
    if (record.workflow.phase === "awaiting-manual-outcome") {
      if (record.workflow.evidenceHash !== normalizedEvidenceHash) {
        return { ok: false, reason: "review-evidence-changed", workflow: record.workflow };
      }
      return { ok: true, alreadyReady: true, workflow: record.workflow };
    }
    if (record.workflow.phase !== "cart-confirmed") {
      return { ok: false, reason: "cart-confirmation-missing", workflow: record.workflow };
    }
    for (const key of lockKeys(product)) {
      const lock = state.locks[key];
      if (!lock || lock.productId !== product.id || lock.ownerId !== ownerId) {
        return { ok: false, reason: key.startsWith("store:") ? "store-busy" : "product-busy" };
      }
    }
    record.workflow = {
      phase: "awaiting-manual-outcome",
      ownerId: String(ownerId || ""),
      updatedAt: now,
      evidenceHash: normalizedEvidenceHash
    };
    for (const key of lockKeys(product)) {
      state.locks[key] = { ...state.locks[key], hold: true, expiresAt: Number.MAX_SAFE_INTEGER };
    }
    return { ok: true, workflow: record.workflow };
  }

  function markManualSubmitObserved(state, product, ownerId, evidenceHash, now = Date.now()) {
    if (product.action !== "review") return { ok: false, reason: "review-only" };
    const normalizedEvidenceHash = normalizeEvidenceHash(evidenceHash);
    if (!normalizedEvidenceHash) return { ok: false, reason: "invalid-evidence-hash" };
    const record = recordFor(state, product.id);
    if (record.workflow.phase !== "awaiting-manual-outcome") {
      return { ok: false, reason: "review-not-ready", workflow: record.workflow };
    }
    if (record.workflow.ownerId && record.workflow.ownerId !== ownerId) {
      return { ok: false, reason: "product-busy", workflow: record.workflow };
    }
    if (record.workflow.evidenceHash && record.workflow.evidenceHash !== normalizedEvidenceHash) {
      return { ok: false, reason: "review-evidence-changed", workflow: record.workflow };
    }
    record.workflow = { ...record.workflow, phase: "manual-submit-observed", updatedAt: now };
    return { ok: true, workflow: record.workflow };
  }

  function operatorResolution(state, product, ownerId, acknowledged = false, now = Date.now()) {
    if (state.completed[product.id]) return { ok: false, reason: "completed", released: false };
    const record = recordFor(state, product.id);
    const submissionUncertain = ["intent", "uncertain"].includes(record.submission?.phase)
      || record.workflow.phase === "submission-uncertain";
    const postMutationHeld = HELD_WORKFLOW_PHASES.has(record.workflow.phase)
      || ["clicked", "confirmed"].includes(record.addAction?.phase);
    if (!submissionUncertain && !postMutationHeld) {
      return { ok: false, reason: "operator-resolution-not-required", released: false };
    }

    const expectedOwner = String(ownerId || "");
    if (!/^tab:\d+$/.test(expectedOwner)) {
      return { ok: false, reason: "operator-tab-required", released: false };
    }
    const keys = lockKeys(product);
    for (const key of keys) {
      const lock = state.locks[key];
      if (!lock || lock.productId !== product.id || lock.ownerId !== expectedOwner) {
        return {
          ok: false,
          reason: lock?.productId === "conflict" ? "operator-resolution-conflict" : "operator-owner-mismatch",
          released: false
        };
      }
    }
    const recordedOwners = [record.workflow.ownerId, record.addAction.ownerId].filter(Boolean);
    if (recordedOwners.some((recordedOwner) => recordedOwner !== expectedOwner)) {
      return { ok: false, reason: "operator-owner-mismatch", released: false };
    }

    const phase = submissionUncertain
      ? "submission-uncertain"
      : record.workflow.phase === "active"
        ? `add-${record.addAction.phase}`
        : record.workflow.phase;
    if (acknowledged !== true) {
      return { ok: true, resolvable: true, phase, released: false };
    }

    record.workflow = { phase: "abandoned", ownerId: "operator", updatedAt: now, evidenceHash: "" };
    record.submission = { phase: "abandoned", updatedAt: now, evidenceHash: "" };
    record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
    record.proof = null;
    let released = false;
    for (const key of keys) {
      const lock = state.locks[key];
      if (lock?.productId === product.id && lock.ownerId === expectedOwner) {
        delete state.locks[key];
        released = true;
      }
    }
    return { ok: true, resolvable: false, phase: "abandoned", released, workflow: record.workflow };
  }

  function abandon(state, product, now = Date.now()) {
    if (state.completed[product.id]) return { ok: false, reason: "completed", released: false };
    const record = recordFor(state, product.id);
    const resolutionRequired = ["clicked", "confirmed"].includes(record.addAction.phase)
      || ["intent", "uncertain"].includes(record.submission.phase)
      || HELD_WORKFLOW_PHASES.has(record.workflow.phase);
    if (!resolutionRequired) return { ok: false, reason: "resolution-not-required", released: false };
    record.workflow = { phase: "abandoned", ownerId: "operator", updatedAt: now, evidenceHash: "" };
    record.submission = { phase: "abandoned", updatedAt: now, evidenceHash: "" };
    record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
    record.proof = null;
    let released = false;
    for (const [key, lock] of Object.entries(state.locks)) {
      if (lock?.productId === product.id) {
        delete state.locks[key];
        released = true;
      }
    }
    return { ok: true, released, workflow: record.workflow };
  }

  function knownNoOrderRequired(state, product) {
    if (state.completed[product.id]) return false;
    const record = recordFor(state, product.id);
    return ["clicked", "confirmed"].includes(record.addAction.phase)
      || ["intent", "uncertain"].includes(record.submission.phase)
      || HELD_WORKFLOW_PHASES.has(record.workflow.phase);
  }

  function complete(state, product, now = Date.now()) {
    const record = recordFor(state, product.id);
    if (state.completed[product.id]) return { ok: true, alreadyCompleted: true };
    if (product.action === "checkout" && !["intent", "uncertain"].includes(record.submission?.phase)) {
      return { ok: false, reason: "submission-intent-missing" };
    }
    // The browser click observer is useful telemetry but cannot run before a
    // trusted user click. A retailer may navigate to confirmation before its
    // async message persists, so durable review readiness is also compatible
    // with an authoritative store confirmation container.
    if (product.action === "review" && !["awaiting-manual-outcome", "manual-submit-observed", "submission-uncertain"].includes(record.workflow.phase)) {
      return { ok: false, reason: "manual-submit-intent-missing" };
    }
    if (product.action === "cart" && record.addAction.phase !== "confirmed") {
      return { ok: false, reason: "cart-confirmation-missing" };
    }
    state.completed[product.id] = new Date(now).toISOString();
    if (product.action === "checkout") record.submission = { ...record.submission, phase: "confirmed", updatedAt: now };
    record.workflow = { ...record.workflow, phase: "confirmed", updatedAt: now };
    record.addAction = { phase: "idle", ownerId: "", updatedAt: now };
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
      workflow: record.workflow,
      targetPersistence: record.targetPersistence,
      budgetReason: budgetReason(state, product, now),
      lock: state.locks[`product:${product.id}`] || null
    };
  }

  const api = Object.freeze({
    EVIDENCE_HASH_PATTERN,
    CLAIM_LOCK_MS,
    LOCK_MS: PRE_CLICK_LEASE_MS,
    MAX_TARGET_PERSISTENCE_WINDOW_MS,
    MIN_TARGET_PERSISTENCE_WINDOW_MS,
    PRE_CLICK_LEASE_MS,
    STATE_VERSION,
    TARGET_PERSISTENCE_LIMITS,
    TARGET_PERSISTENCE_WINDOW_MS,
    authorizeAddClick,
    beginAddAction,
    beginManualReview,
    beginSubmission,
    abandon,
    claim,
    complete,
    createState,
    markAddAction,
    markManualSubmitObserved,
    markSubmission,
    knownNoOrderRequired,
    normalizeState,
    operatorResolution,
    productState,
    recordAttempt,
    release,
    reserveTargetPersistence,
    saveProof
  });

  globalThis.CartConfirmAutomationState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
