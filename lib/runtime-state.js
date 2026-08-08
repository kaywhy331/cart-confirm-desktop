"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeSignals } = require("./signal-inbox");

const RUNTIME_STATE_VERSION = 1;
const MAX_RUNTIME_EVENTS = 250;

function defaultRuntimeState() {
  return {
    version: RUNTIME_STATE_VERSION,
    scheduleReceipt: null,
    productScheduleReceipts: {},
    queueFanoutReceipts: {},
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
