"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeSignals } = require("./signal-inbox");

const RUNTIME_STATE_VERSION = 5;
const MAX_RUNTIME_EVENTS = 250;
const DEFAULT_SCHEDULED_BLITZ_DURATION_SECONDS = 120;

function defaultRuntimeState() {
  return {
    version: RUNTIME_STATE_VERSION,
    scheduleReceipt: null,
    productScheduleReceipts: {},
    productExecutionContexts: {},
    queueFanoutReceipts: {},
    queueCaptures: {},
    walmartPrepObservations: {},
    storeOverloadUntil: {},
    storeActionHistory: {},
    discord: {
      channelId: "",
      channelName: "",
      lastMessageId: "",
      baselineAt: "",
      lastPollAt: "",
      lastSignalAt: "",
      lastError: ""
    },
    signals: [],
    events: []
  };
}

function normalizeRuntimeState(input) {
  const state = defaultRuntimeState();
  if (!input || typeof input !== "object" || Array.isArray(input)) return state;
  const receipt = input.scheduleReceipt;
  if (
    receipt
    && typeof receipt === "object"
    && typeof receipt.key === "string"
    && ["firing", "fired", "missed"].includes(receipt.status)
  ) {
    state.scheduleReceipt = {
      key: receipt.key.slice(0, 1000),
      status: receipt.status,
      recordedAt: String(receipt.recordedAt || "").slice(0, 40)
    };
  }
  for (const [key, receipt] of Object.entries(input.productScheduleReceipts || {}).slice(-200)) {
    if (
      receipt
      && typeof receipt === "object"
      && ["firing", "fired", "missed"].includes(receipt.status)
    ) {
      state.productScheduleReceipts[String(key).slice(0, 1000)] = {
        status: receipt.status,
        recordedAt: String(receipt.recordedAt || "").slice(0, 40)
      };
    }
  }
  for (const [productId, context] of Object.entries(input.productExecutionContexts || {}).slice(-200)) {
    const expiresAt = Number(context?.expiresAt);
    const cohortId = String(context?.cohortId || "").slice(0, 80);
    const participantProductIds = Array.isArray(context?.participantProductIds)
      ? [...new Set(context.participantProductIds.map((value) => String(value || "").slice(0, 100)).filter(Boolean))].slice(0, 50)
      : [];
    if (
      context
      && typeof context === "object"
      && context.mode === "blitz"
      && typeof context.runId === "string"
      && Number.isFinite(expiresAt)
      && expiresAt > 0
      && cohortId
      && participantProductIds.includes(String(productId))
    ) {
      state.productExecutionContexts[String(productId).slice(0, 100)] = {
        mode: "blitz",
        runId: context.runId.slice(0, 80),
        scheduleKey: String(context.scheduleKey || "").slice(0, 1000),
        firedAt: String(context.firedAt || "").slice(0, 40),
        expiresAt,
        cohortId,
        participantProductIds
      };
    }
  }
  for (const [key, receipt] of Object.entries(input.queueFanoutReceipts || {}).slice(-50)) {
    if (
      receipt
      && typeof receipt === "object"
      && ["firing", "fired", "partial"].includes(receipt.status)
    ) {
      state.queueFanoutReceipts[String(key).slice(0, 200)] = {
        status: receipt.status,
        recordedAt: String(receipt.recordedAt || "").slice(0, 40)
      };
    }
  }
  // Legacy singleton captures had no immutable cohort membership, so they
  // intentionally receive no reload authority during migration.
  for (const [cohortKey, capture] of Object.entries(input.queueCaptures || {}).slice(-100)) {
    const cohortId = String(capture?.cohortId || cohortKey || "").slice(0, 80);
    const participantProductIds = Array.isArray(capture?.participantProductIds)
      ? [...new Set(capture.participantProductIds.map((value) => String(value || "").slice(0, 100)).filter(Boolean))].slice(0, 50)
      : [];
    const expiresAt = Number(capture?.expiresAt);
    if (
      !capture
      || typeof capture !== "object"
      || capture.retailer !== "walmart"
      || typeof capture.runId !== "string"
      || !cohortId
      || !participantProductIds.length
      || !participantProductIds.includes(String(capture.winnerProductId || ""))
      || !Number.isFinite(expiresAt)
      || expiresAt <= 0
    ) continue;
    const attempts = {};
    for (const [productId, attempt] of Object.entries(capture.attempts || {})) {
      if (!participantProductIds.includes(productId)) continue;
      const count = Number(attempt?.count);
      if (!Number.isInteger(count) || count < 0 || count > 20) continue;
      attempts[productId] = {
        count,
        lastReservationId: String(attempt?.lastReservationId || "").slice(0, 180),
        updatedAt: Number.isFinite(Number(attempt?.updatedAt)) ? Number(attempt.updatedAt) : 0
      };
    }
    state.queueCaptures[cohortId] = {
      retailer: "walmart",
      runId: capture.runId.slice(0, 80),
      cohortId,
      winnerProductId: String(capture.winnerProductId || "").slice(0, 100),
      participantProductIds,
      detectedAt: String(capture.detectedAt || "").slice(0, 40),
      expiresAt,
      attempts
    };
  }
  for (const [productId, observation] of Object.entries(input.walmartPrepObservations || {}).slice(-50)) {
    if (!observation || typeof observation !== "object") continue;
    const status = Number(observation.status);
    if (!String(productId).startsWith("walmart:") || !Number.isInteger(status) || status < 0 || status > 599) continue;
    state.walmartPrepObservations[String(productId).slice(0, 100)] = {
      status,
      availability: ["available", "unavailable", "unknown"].includes(observation.availability)
        ? observation.availability
        : "unknown",
      price: Number.isFinite(Number(observation.price)) ? Number(observation.price) : null,
      queue: observation.queue === true,
      etag: String(observation.etag || "").slice(0, 200),
      lastModified: String(observation.lastModified || "").slice(0, 100),
      observedAt: String(observation.observedAt || "").slice(0, 40),
      fingerprint: String(observation.fingerprint || "").slice(0, 300)
    };
  }
  for (const [retailer, deadline] of Object.entries(input.storeOverloadUntil || {})) {
    const value = Number(deadline);
    if (["target", "walmart", "amazon"].includes(retailer) && Number.isFinite(value) && value >= 0) {
      state.storeOverloadUntil[retailer] = value;
    }
  }
  for (const [retailer, timestamps] of Object.entries(input.storeActionHistory || {})) {
    if (!["target", "walmart", "amazon"].includes(retailer) || !Array.isArray(timestamps)) continue;
    state.storeActionHistory[retailer] = timestamps
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0)
      .slice(-500);
  }
  const discord = input.discord;
  if (discord && typeof discord === "object" && !Array.isArray(discord)) {
    state.discord = {
      channelId: String(discord.channelId || "").slice(0, 40),
      channelName: String(discord.channelName || "").replace(/\s+/g, " ").trim().slice(0, 100),
      lastMessageId: String(discord.lastMessageId || "").slice(0, 40),
      baselineAt: String(discord.baselineAt || "").slice(0, 40),
      lastPollAt: String(discord.lastPollAt || "").slice(0, 40),
      lastSignalAt: String(discord.lastSignalAt || "").slice(0, 40),
      lastError: String(discord.lastError || "").replace(/\s+/g, " ").trim().slice(0, 240)
    };
  }
  state.signals = normalizeSignals(input.signals);
  if (Array.isArray(input.events)) state.events = input.events.slice(0, MAX_RUNTIME_EVENTS);
  return state;
}

function cohortIdFor(runId, scheduleKey, participantProductIds) {
  const canonical = JSON.stringify({
    runId: String(runId || ""),
    scheduleKey: String(scheduleKey || ""),
    participantProductIds: [...participantProductIds].sort()
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function activateBlitzExecution(
  state,
  products,
  runId,
  scheduleKey,
  now = Date.now(),
  durationSeconds = DEFAULT_SCHEDULED_BLITZ_DURATION_SECONDS
) {
  state.productExecutionContexts ||= {};
  const firedAt = new Date(now).toISOString();
  const participantProductIds = [...new Set((products || [])
    .map((product) => String(product?.id || "").slice(0, 100))
    .filter(Boolean))].sort();
  const boundedDuration = Number.isInteger(Number(durationSeconds))
    ? Math.min(900, Math.max(15, Number(durationSeconds)))
    : DEFAULT_SCHEDULED_BLITZ_DURATION_SECONDS;
  const expiresAt = now + boundedDuration * 1000;
  const cohortId = cohortIdFor(runId, scheduleKey, participantProductIds);
  for (const productId of participantProductIds) {
    state.productExecutionContexts[productId] = {
      mode: "blitz",
      runId: String(runId || "").slice(0, 80),
      scheduleKey: String(scheduleKey || "").slice(0, 1000),
      firedAt,
      expiresAt,
      cohortId,
      participantProductIds
    };
  }
  return state.productExecutionContexts;
}

function productExecutionContext(state, productId, runId, now = Date.now()) {
  const context = state?.productExecutionContexts?.[String(productId || "")];
  if (
    context?.mode !== "blitz"
    || context.runId !== String(runId || "")
    || !Number.isFinite(Number(context.expiresAt))
    || now >= Number(context.expiresAt)
    || !context.cohortId
    || !Array.isArray(context.participantProductIds)
    || !context.participantProductIds.includes(String(productId || ""))
  ) return null;
  return context;
}

function productExecutionMode(state, productId, runId, now = Date.now()) {
  return productExecutionContext(state, productId, runId, now) ? "blitz" : "watcher";
}

function queueCaptureForProduct(state, productId, runId, now = Date.now()) {
  const context = productExecutionContext(state, productId, runId, now);
  if (!context) return null;
  const capture = state?.queueCaptures?.[context.cohortId];
  return capture?.retailer === "walmart"
    && capture.runId === String(runId || "")
    && capture.cohortId === context.cohortId
    && capture.participantProductIds.includes(String(productId || ""))
    && now < Number(capture.expiresAt)
    ? capture
    : null;
}

function registerQueueCapture(state, product, runId, now = Date.now()) {
  const context = productExecutionContext(state, product?.id, runId, now);
  if (
    !state
    || product?.retailer !== "walmart"
    || !context
  ) return { capture: null, created: false };
  state.queueCaptures ||= {};
  const existing = state.queueCaptures[context.cohortId];
  if (existing) return { capture: existing, created: false };
  state.queueCaptures[context.cohortId] = {
    retailer: "walmart",
    runId: String(runId || "").slice(0, 80),
    cohortId: context.cohortId,
    winnerProductId: String(product.id || "").slice(0, 100),
    participantProductIds: [...context.participantProductIds],
    detectedAt: new Date(now).toISOString(),
    expiresAt: Number(context.expiresAt),
    attempts: {}
  };
  return { capture: state.queueCaptures[context.cohortId], created: true };
}

function reserveQueueCaptureAttempt(state, options = {}) {
  const now = Number(options.now ?? Date.now());
  const limit = Number(options.limit);
  const productId = String(options.productId || "");
  const runId = String(options.runId || "");
  const reservationId = String(options.reservationId || "").slice(0, 180);
  if (!Number.isInteger(limit) || limit < 0 || limit > 20 || !reservationId) {
    return { ok: false, reason: "invalid-reservation" };
  }
  if (limit === 0) return { ok: false, reason: "reloads-disabled", attempts: 0, limit };
  const capture = queueCaptureForProduct(state, productId, runId, now);
  if (!capture || capture.winnerProductId === productId) {
    return { ok: false, reason: capture?.winnerProductId === productId ? "queued-winner" : "capture-inactive" };
  }
  capture.attempts ||= {};
  const current = capture.attempts[productId] || { count: 0, lastReservationId: "", updatedAt: 0 };
  if (current.lastReservationId === reservationId) {
    return { ok: true, deduped: true, attempts: current.count, limit, capture };
  }
  if (current.count >= limit) return { ok: false, reason: "attempts-exhausted", attempts: current.count, limit };
  capture.attempts[productId] = {
    count: current.count + 1,
    lastReservationId: reservationId,
    updatedAt: now
  };
  return { ok: true, attempts: current.count + 1, limit, capture };
}

function reconcileProductExecutionContexts(state, previousProducts, nextProducts, runId) {
  state.productExecutionContexts ||= {};
  const previousById = new Map((previousProducts || []).map((product) => [product?.id, product]));
  const nextById = new Map((nextProducts || []).map((product) => [product?.id, product]));
  for (const [productId, context] of Object.entries(state.productExecutionContexts)) {
    const previous = previousById.get(productId);
    const next = nextById.get(productId);
    if (
      context?.runId !== String(runId || "")
      || !previous
      || !next?.enabled
      || String(previous.openAt || "") !== String(next.openAt || "")
    ) {
      delete state.productExecutionContexts[productId];
    }
  }
  return state.productExecutionContexts;
}

function loadRuntimeState(filePath) {
  try {
    return normalizeRuntimeState(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return defaultRuntimeState();
  }
}

function saveRuntimeState(filePath, input) {
  const state = normalizeRuntimeState(input);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return state;
}

module.exports = {
  MAX_RUNTIME_EVENTS,
  RUNTIME_STATE_VERSION,
  activateBlitzExecution,
  cohortIdFor,
  defaultRuntimeState,
  loadRuntimeState,
  normalizeRuntimeState,
  productExecutionMode,
  productExecutionContext,
  queueCaptureForProduct,
  reconcileProductExecutionContexts,
  registerQueueCapture,
  reserveQueueCaptureAttempt,
  saveRuntimeState
};
