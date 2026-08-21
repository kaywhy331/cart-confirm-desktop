"use strict";

const crypto = require("node:crypto");

const TRACKALACKER_SIGNAL_SCHEMA_VERSION = 1;
const TRACKALACKER_DOMAIN = "trackalacker.com";
const MAX_NOTIFICATION_TEXT_ELEMENTS = 16;
const MAX_NOTIFICATION_TEXT_LENGTH = 4_000;
const EVENT_HEADERS = Object.freeze([
  { pattern: /^in stock\s+at\s+(walmart|amazon|target)!?$/i, eventType: "in_stock" },
  { pattern: /^(?:restock|back in stock)\s+at\s+(walmart|amazon|target)!?$/i, eventType: "restock" },
  { pattern: /^pre-?order(?: available)?\s+at\s+(walmart|amazon|target)!?$/i, eventType: "preorder" }
]);
const OFFER_PATTERN = /(?:in stock|available|back in stock|pre-?order(?: available)?)\s+(?:at|for)\s+\$?([\d,]+(?:\.\d{1,2})?)(?:\s*\(([^)]{1,80})\))?/i;

function cleanText(value, maximum = MAX_NOTIFICATION_TEXT_LENGTH) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function cleanBody(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_NOTIFICATION_TEXT_LENGTH);
}

function normalizeTimestamp(value, field) {
  const timestamp = new Date(value || "");
  if (Number.isNaN(timestamp.getTime())) throw new Error(`${field} must be a valid timestamp.`);
  return timestamp.toISOString();
}

function normalizeDomain(value) {
  const text = cleanText(value, 200).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return text === TRACKALACKER_DOMAIN ? TRACKALACKER_DOMAIN : "";
}

function normalizeTitle(value) {
  return cleanText(value, 240)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chromeApplication(value = {}) {
  const name = cleanText(value.applicationName, 160);
  const id = cleanText(value.applicationId, 240).replace(/[\\/]/g, ".");
  const approvedName = /^google chrome(?: (?:beta|dev|canary)| \([^()]{1,80}\))?$/i.test(name);
  const approvedId = /^(?:google\.)?chrome(?:[._-][a-z0-9_-]{1,80})*$/i.test(id);
  return approvedName || approvedId;
}

function normalizeTextElements(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const entry of value.slice(0, MAX_NOTIFICATION_TEXT_ELEMENTS)) {
    const text = cleanText(entry, 500);
    if (text) output.push(text);
  }
  return output;
}

function validateTrackalackerSignalEnvelope(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Signal payload must be an object.");
  if (Number(input.schemaVersion) !== TRACKALACKER_SIGNAL_SCHEMA_VERSION) {
    throw new Error(`Signal schemaVersion must be ${TRACKALACKER_SIGNAL_SCHEMA_VERSION}.`);
  }
  const testSignal = input.testSignal === true;
  const signalId = cleanText(input.signalId, 180);
  if (!/^[A-Za-z0-9:._-]{8,180}$/.test(signalId)) throw new Error("Signal ID is invalid.");
  const source = input.source && typeof input.source === "object" && !Array.isArray(input.source) ? input.source : {};
  if (cleanText(source.provider, 40).toLowerCase() !== "trackalacker") throw new Error("Signal provider must be TrackaLacker.");
  const transport = cleanText(source.transport, 60).toLowerCase();
  if (testSignal ? transport !== "synthetic_replay" : transport !== "windows_chrome_notification") {
    throw new Error("Signal transport is not allowed.");
  }
  const applicationName = cleanText(source.applicationName, 160);
  const applicationId = cleanText(source.applicationId, 240);
  const domain = normalizeDomain(source.domain);
  if (!testSignal && (!chromeApplication({ applicationName, applicationId }) || !domain)) {
    throw new Error("Only Google Chrome notifications attributed to trackalacker.com are accepted.");
  }
  const notificationId = cleanText(source.notificationId, 180);
  if (!testSignal && !notificationId) throw new Error("Windows notification ID is required.");
  const createdAt = normalizeTimestamp(source.createdAt, "source.createdAt");
  const receivedAt = normalizeTimestamp(source.receivedAt, "source.receivedAt");
  const notification = input.notification && typeof input.notification === "object" && !Array.isArray(input.notification)
    ? input.notification
    : {};
  const title = cleanText(notification.title, 500);
  const body = cleanBody(notification.body);
  const textElements = normalizeTextElements(notification.textElements);
  if (!title && !body && !textElements.length) throw new Error("Notification text is empty.");
  return Object.freeze({
    schemaVersion: TRACKALACKER_SIGNAL_SCHEMA_VERSION,
    signalId,
    testSignal,
    source: Object.freeze({
      provider: "trackalacker",
      transport,
      notificationId,
      applicationName,
      applicationId,
      domain: testSignal ? normalizeDomain(source.domain) || TRACKALACKER_DOMAIN : domain,
      createdAt,
      receivedAt
    }),
    notification: Object.freeze({ title, body, textElements: Object.freeze(textElements) })
  });
}

function notificationLines(envelope) {
  const ordered = [
    envelope.notification.title,
    ...envelope.notification.textElements,
    ...String(envelope.notification.body || "").split(/\r?\n/)
  ];
  const seen = new Set();
  const output = [];
  for (const raw of ordered) {
    const line = cleanText(raw, 500);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(line);
  }
  return output;
}

function headerFromLines(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    for (const header of EVENT_HEADERS) {
      const match = lines[index].match(header.pattern);
      if (match) return { index, eventType: header.eventType, retailer: match[1].toLowerCase() };
    }
  }
  return null;
}

function msrpStatus(value) {
  const text = cleanText(value, 100).toLowerCase();
  if (!text) return "unknown";
  if (/price surge|surge|scalper/.test(text)) return "surge";
  if (/above msrp|greater than|over msrp/.test(text)) return "above_msrp";
  if (/below msrp|less than/.test(text)) return "below_msrp";
  if (/~\s*msrp|near msrp|close to/.test(text)) return "near_msrp";
  if (/at msrp|equal to msrp|^msrp$/.test(text)) return "at_msrp";
  return "unknown";
}

function offerFromLines(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(OFFER_PATTERN);
    if (!match) continue;
    const price = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) continue;
    return { index, price: Math.round(price * 100) / 100, msrpStatus: msrpStatus(match[2] || lines[index]) };
  }
  return null;
}

function metadataLine(line) {
  const normalized = cleanText(line, 500).toLowerCase().replace(/^www\./, "").replace(/\/$/, "");
  return normalized === TRACKALACKER_DOMAIN
    || /^affiliate$/i.test(line)
    || EVENT_HEADERS.some((header) => header.pattern.test(line))
    || OFFER_PATTERN.test(line);
}

function titleFromLines(lines, header, offer) {
  const between = header && offer && offer.index > header.index
    ? lines.slice(header.index + 1, offer.index)
    : [];
  const candidates = [...between, ...lines].filter((line) => !metadataLine(line));
  return cleanText(candidates[0], 240);
}

function parseTrackalackerNotification(input) {
  const envelope = validateTrackalackerSignalEnvelope(input);
  const lines = notificationLines(envelope);
  const header = headerFromLines(lines);
  const offer = offerFromLines(lines);
  const title = titleFromLines(lines, header, offer);
  const normalizedProductName = normalizeTitle(title);
  const testNotification = lines.some((line) => /\btest notification\b|\bthis is a test\b/i.test(line));
  const parseState = header && normalizedProductName ? "parsed" : "malformed";
  const observedAt = envelope.source.createdAt;
  return Object.freeze({
    envelope,
    parseState,
    eventType: header?.eventType || "unknown",
    retailer: header?.retailer || "",
    productNameRaw: title,
    normalizedProductName,
    price: offer?.price ?? null,
    currency: offer ? "USD" : "",
    msrpStatus: offer?.msrpStatus || "unknown",
    observedAt,
    testNotification,
    actionable: parseState === "parsed" && !testNotification && ["in_stock", "restock", "preorder"].includes(header.eventType),
    lines: Object.freeze(lines)
  });
}

function transportDedupeKey(parsed) {
  const source = parsed?.envelope?.source || {};
  return crypto.createHash("sha256").update([
    "trackalacker-transport-v1",
    source.applicationId || source.applicationName,
    source.notificationId,
    source.createdAt
  ].join("|")).digest("hex");
}

function semanticDedupeKey(parsed, resolution, windowSeconds = 300) {
  const observedAt = new Date(parsed?.observedAt || "").getTime();
  const boundedWindow = Number.isInteger(Number(windowSeconds))
    ? Math.min(3_600, Math.max(30, Number(windowSeconds)))
    : 300;
  const bucket = Number.isFinite(observedAt) ? Math.floor(observedAt / (boundedWindow * 1000)) : 0;
  const cents = Number.isFinite(Number(parsed?.price)) ? Math.round(Number(parsed.price) * 100) : "unknown";
  return crypto.createHash("sha256").update([
    "stock-semantic-v1",
    resolution?.productId || `${parsed?.retailer || "unknown"}:${parsed?.normalizedProductName || "unknown"}`,
    parsed?.eventType || "unknown",
    cents,
    bucket
  ].join("|")).digest("hex");
}

module.exports = {
  MAX_NOTIFICATION_TEXT_ELEMENTS,
  TRACKALACKER_DOMAIN,
  TRACKALACKER_SIGNAL_SCHEMA_VERSION,
  normalizeTitle,
  parseTrackalackerNotification,
  semanticDedupeKey,
  transportDedupeKey,
  validateTrackalackerSignalEnvelope
};
