"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_STATE_VERSION = 1;
const MAX_RUNTIME_EVENTS = 250;

function defaultRuntimeState() {
  return {
    version: RUNTIME_STATE_VERSION,
    scheduleReceipt: null,
    storeOverloadUntil: {},
    storeActionHistory: {},
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
  if (Array.isArray(input.events)) state.events = input.events.slice(0, MAX_RUNTIME_EVENTS);
  return state;
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
  defaultRuntimeState,
  loadRuntimeState,
  normalizeRuntimeState,
  saveRuntimeState
};
