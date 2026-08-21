"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SIGNAL_JOURNAL_VERSION = 1;
const MAX_SIGNAL_RECORDS = 2_000;
const SIGNAL_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RESOLUTION_STATES = new Set(["malformed", "unresolved", "ambiguous", "matched"]);
const MISSION_DECISIONS = new Set([
  "recorded",
  "duplicate_signal",
  "test_signal",
  "unsupported_event",
  "bridge_disabled",
  "delivery_paused",
  "unresolved_product",
  "ambiguous_product",
  "no_matching_mission",
  "signals_not_armed",
  "mission_disabled",
  "price_exceeds_limit",
  "mission_expired",
  "quantity_limit",
  "queued",
  "failed"
]);
const ACTION_STATES = new Set(["none", "pending", "opening", "opened", "failed", "cancelled"]);

function cleanText(value, maximum = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function cleanBody(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .slice(0, 4_000);
}

function timestamp(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function price(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1_000_000
    ? Math.round(number * 100) / 100
    : null;
}

function timing(input = {}) {
  return {
    sourceCreatedAt: timestamp(input.sourceCreatedAt),
    listenerReceivedAt: timestamp(input.listenerReceivedAt),
    cartcollectReceivedAt: timestamp(input.cartcollectReceivedAt),
    parseCompletedAt: timestamp(input.parseCompletedAt),
    resolvedAt: timestamp(input.resolvedAt),
    dedupeCompletedAt: timestamp(input.dedupeCompletedAt),
    missionEvaluatedAt: timestamp(input.missionEvaluatedAt),
    actionStartedAt: timestamp(input.actionStartedAt),
    acknowledgedAt: timestamp(input.acknowledgedAt)
  };
}

function normalizeSignalRecord(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const signalId = cleanText(input.signalId, 180);
  const receivedAt = timestamp(input.receivedAt || input.timing?.cartcollectReceivedAt);
  if (!signalId || !receivedAt) return null;
  const resolutionState = RESOLUTION_STATES.has(input.resolutionState) ? input.resolutionState : "unresolved";
  const missionDecision = MISSION_DECISIONS.has(input.missionDecision) ? input.missionDecision : "recorded";
  const actionState = ACTION_STATES.has(input.actionState) ? input.actionState : "none";
  return {
    id: cleanText(input.id || signalId, 180),
    signalId,
    source: ["trackalacker", "discord", "browser"].includes(input.source) ? input.source : "trackalacker",
    transport: cleanText(input.transport, 60),
    notificationId: cleanText(input.notificationId, 180),
    transportKey: /^[a-f0-9]{64}$/.test(String(input.transportKey || "")) ? String(input.transportKey) : "",
    semanticKey: /^[a-f0-9]{64}$/.test(String(input.semanticKey || "")) ? String(input.semanticKey) : "",
    receivedAt,
    observedAt: timestamp(input.observedAt),
    testSignal: input.testSignal === true,
    rawTitle: cleanText(input.rawTitle, 500),
    rawBody: cleanBody(input.rawBody),
    eventType: ["in_stock", "restock", "preorder", "unknown"].includes(input.eventType) ? input.eventType : "unknown",
    retailer: ["target", "walmart", "amazon"].includes(input.retailer) ? input.retailer : "",
    productNameRaw: cleanText(input.productNameRaw, 240),
    normalizedProductName: cleanText(input.normalizedProductName, 240),
    price: price(input.price),
    currency: input.currency === "USD" ? "USD" : "",
    msrpStatus: ["near_msrp", "at_msrp", "below_msrp", "above_msrp", "surge", "unknown"].includes(input.msrpStatus)
      ? input.msrpStatus
      : "unknown",
    resolutionState,
    matchMethod: cleanText(input.matchMethod, 60),
    itemId: cleanText(input.itemId, 180),
    productId: cleanText(input.productId, 100),
    sourceProductId: cleanText(input.sourceProductId, 30),
    sourceListingId: cleanText(input.sourceListingId, 30),
    missionDecision,
    actionState,
    reason: cleanText(input.reason, 240),
    duplicateOf: cleanText(input.duplicateOf, 180),
    occurrenceCount: Math.max(1, Math.min(1_000_000, Math.floor(Number(input.occurrenceCount) || 1))),
    timing: timing(input.timing)
  };
}

function defaultSignalJournal() {
  return { version: SIGNAL_JOURNAL_VERSION, records: [] };
}

function normalizeSignalJournal(input, now = Date.now()) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const cutoff = Number(now) - SIGNAL_RETENTION_MS;
  const records = [];
  const seen = new Set();
  for (const raw of Array.isArray(source.records) ? source.records : []) {
    const record = normalizeSignalRecord(raw);
    if (!record || seen.has(record.id) || new Date(record.receivedAt).getTime() < cutoff) continue;
    seen.add(record.id);
    records.push(record);
  }
  records.sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime());
  return { version: SIGNAL_JOURNAL_VERSION, records: records.slice(0, MAX_SIGNAL_RECORDS) };
}

function appendSignalRecord(state, input, now = Date.now()) {
  const normalized = normalizeSignalJournal(state, now);
  const record = normalizeSignalRecord(input);
  if (!record) throw new Error("Signal journal record is invalid.");
  return normalizeSignalJournal({
    version: SIGNAL_JOURNAL_VERSION,
    records: [record, ...normalized.records.filter((candidate) => candidate.id !== record.id)]
  }, now);
}

function updateSignalRecord(state, signalId, changes, now = Date.now()) {
  const normalized = normalizeSignalJournal(state, now);
  const id = cleanText(signalId, 180);
  const current = normalized.records.find((record) => record.signalId === id || record.id === id);
  if (!current) return normalized;
  return appendSignalRecord(normalized, { ...current, ...changes, id: current.id, signalId: current.signalId }, now);
}

function duplicateSignalRecord(state, keys = {}) {
  const signalId = cleanText(keys.signalId, 180);
  const transportKey = String(keys.transportKey || "");
  const semanticKey = String(keys.semanticKey || "");
  return (state?.records || []).find((record) => (
    signalId && record.signalId === signalId
    || transportKey && record.transportKey === transportKey
    || semanticKey && record.semanticKey === semanticKey
  )) || null;
}

function duplicateSemanticRecord(state, input = {}, windowSeconds = 300) {
  const observedAt = new Date(input.observedAt || "").getTime();
  const boundedWindowMs = Math.min(3_600, Math.max(30, Number(windowSeconds) || 300)) * 1_000;
  if (!Number.isFinite(observedAt) || !input.productId || !input.eventType) return null;
  const inputPrice = price(input.price);
  return (state?.records || []).find((record) => {
    const candidateAt = new Date(record.observedAt || "").getTime();
    return record.productId === input.productId
      && record.eventType === input.eventType
      && record.price === inputPrice
      && Number.isFinite(candidateAt)
      && Math.abs(observedAt - candidateAt) < boundedWindowMs;
  }) || null;
}

function recordDuplicateOccurrence(state, existing, receivedAt = new Date().toISOString(), now = Date.now()) {
  return updateSignalRecord(state, existing.id, {
    occurrenceCount: existing.occurrenceCount + 1,
    timing: { ...existing.timing, acknowledgedAt: receivedAt }
  }, now);
}

function saveSignalJournal(filePath, input) {
  const state = normalizeSignalJournal(input);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return state;
}

function loadSignalJournal(filePath) {
  try {
    return normalizeSignalJournal(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return defaultSignalJournal();
  }
}

function publicSignalJournal(state, maximum = 100) {
  return normalizeSignalJournal(state).records.slice(0, Math.min(200, Math.max(1, Number(maximum) || 100))).map((record) => ({
    ...record,
    rawBody: record.rawBody.slice(0, 500)
  }));
}

module.exports = {
  ACTION_STATES,
  MAX_SIGNAL_RECORDS,
  MISSION_DECISIONS,
  RESOLUTION_STATES,
  SIGNAL_JOURNAL_VERSION,
  SIGNAL_RETENTION_MS,
  appendSignalRecord,
  defaultSignalJournal,
  duplicateSignalRecord,
  duplicateSemanticRecord,
  loadSignalJournal,
  normalizeSignalJournal,
  normalizeSignalRecord,
  publicSignalJournal,
  recordDuplicateOccurrence,
  saveSignalJournal,
  updateSignalRecord
};
