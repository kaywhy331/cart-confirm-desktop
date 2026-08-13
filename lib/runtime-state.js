"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeSignals } = require("./signal-inbox");

const RUNTIME_STATE_VERSION = 3;
const MAX_RUNTIME_EVENTS = 250;

function defaultRuntimeState() {
  return {
    version: RUNTIME_STATE_VERSION,
    scheduleReceipt: null,
    productScheduleReceipts: {},
    productExecutionContexts: {},
    queueFanoutReceipts: {},
    queueCapture: null,
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
    if (
      context
      && typeof context === "object"
      && context.mode === "blitz"
      && typeof context.runId === "string"
    ) {
      state.productExecutionContexts[String(productId).slice(0, 100)] = {
        mode: "blitz",
        runId: context.runId.slice(0, 80),
        scheduleKey: String(context.scheduleKey || "").slice(0, 1000),
        firedAt: String(context.firedAt || "").slice(0, 40)
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
  const queueCapture = input.queueCapture;
  if (
    queueCapture
    && typeof queueCapture === "object"
    && queueCapture.retailer === "walmart"
    && typeof queueCapture.runId === "string"
    && typeof queueCapture.winnerProductId === "string"
  ) {
    state.queueCapture = {
      retailer: "walmart",
      runId: queueCapture.runId.slice(0, 80),
      winnerProductId: queueCapture.winnerProductId.slice(0, 100),
      detectedAt: String(queueCapture.detectedAt || "").slice(0, 40)
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

function activateBlitzExecution(state, products, runId, scheduleKey, now = Date.now()) {
  state.productExecutionContexts ||= {};
  const firedAt = new Date(now).toISOString();
  for (const product of products || []) {
    const productId = String(product?.id || "").slice(0, 100);
    if (!productId) continue;
    state.productExecutionContexts[productId] = {
      mode: "blitz",
      runId: String(runId || "").slice(0, 80),
      scheduleKey: String(scheduleKey || "").slice(0, 1000),
      firedAt
    };
  }
  return state.productExecutionContexts;
}

function productExecutionMode(state, productId, runId) {
  const context = state?.productExecutionContexts?.[String(productId || "")];
  return context?.mode === "blitz" && context.runId === String(runId || "")
    ? "blitz"
    : "watcher";
}

function queueCaptureForRun(state, runId) {
  const capture = state?.queueCapture;
  return capture?.retailer === "walmart" && capture.runId === String(runId || "")
    ? capture
    : null;
}

function registerQueueCapture(state, product, runId, now = Date.now()) {
  if (
    !state
    || product?.retailer !== "walmart"
    || productExecutionMode(state, product.id, runId) !== "blitz"
  ) return { capture: queueCaptureForRun(state, runId), created: false };
  const existing = queueCaptureForRun(state, runId);
  if (existing) return { capture: existing, created: false };
  state.queueCapture = {
    retailer: "walmart",
    runId: String(runId || "").slice(0, 80),
    winnerProductId: String(product.id || "").slice(0, 100),
    detectedAt: new Date(now).toISOString()
  };
  return { capture: state.queueCapture, created: true };
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
  defaultRuntimeState,
  loadRuntimeState,
  normalizeRuntimeState,
  productExecutionMode,
  queueCaptureForRun,
  reconcileProductExecutionContexts,
  registerQueueCapture,
  saveRuntimeState
};
