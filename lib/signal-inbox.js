"use strict";

const { sanitizeAmazonActionUrl } = require("./amazon-entry");
const { RETAILERS, normalizeSku } = require("./retailers");
const { sanitizeWalmartBuyNowUrl } = require("./walmart-entry");

const MAX_SIGNALS = 100;
const AUTO_OPEN_STATES = new Set(["historical", "new-product", "disabled", "notified", "opened", "failed", "stale", "pending"]);

function cleanText(value, length) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function cleanNumber(value, maximum, integer = false) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) return null;
  return integer ? Math.floor(number) : Math.round(number * 100) / 100;
}

function canonicalProductUrl(retailer, sku) {
  if (retailer === "target") return `https://www.target.com/p/-/A-${sku}`;
  if (retailer === "walmart") return `https://www.walmart.com/ip/${sku}`;
  if (retailer === "amazon") return `https://www.amazon.com/dp/${sku}`;
  return "";
}

function normalizeSignal(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const retailer = String(input.retailer || "").toLowerCase();
  if (!RETAILERS[retailer]) return null;
  let sku;
  try {
    sku = normalizeSku(retailer, input.sku);
  } catch {
    return null;
  }
  const observed = new Date(input.observedAt || Date.now());
  const observedAt = Number.isNaN(observed.getTime()) ? new Date().toISOString() : observed.toISOString();
  const productId = `${retailer}:${sku}`;
  const atc = retailer === "amazon" ? sanitizeAmazonActionUrl(input.amazonAtcUrl, sku) : null;
  const buyNow = retailer === "amazon" ? sanitizeAmazonActionUrl(input.amazonBuyNowUrl, sku) : null;
  const walmartBuyNow = retailer === "walmart" ? sanitizeWalmartBuyNowUrl(input.walmartBuyNowUrl, sku) : null;
  const autoOpenState = AUTO_OPEN_STATES.has(input.autoOpenState) ? input.autoOpenState : "pending";
  const source = ["browser", "discord", "trackalacker"].includes(input.source)
    ? input.source
    : "discord";
  return {
    id: cleanText(input.id || `${source}:${productId}:${observedAt}`, 160),
    source,
    messageId: cleanText(input.messageId, 40),
    channelId: cleanText(input.channelId, 40),
    retailer,
    sku,
    productId,
    title: cleanText(input.title || `${RETAILERS[retailer].label} ${sku}`, 120),
    price: cleanNumber(input.price, 1_000_000),
    stock: cleanNumber(input.stock, 1_000_000, true),
    orderLimit: cleanNumber(input.orderLimit, 99, true),
    seller: cleanText(input.seller, 120),
    firstParty: typeof input.firstParty === "boolean" ? input.firstParty : null,
    productUrl: canonicalProductUrl(retailer, sku),
    walmartBuyNowUrl: walmartBuyNow?.url || "",
    amazonAtcUrl: atc?.url || "",
    amazonBuyNowUrl: buyNow?.url || "",
    observedAt,
    autoOpenState,
    autoOpenedAt: cleanText(input.autoOpenedAt, 40),
    note: cleanText(input.note, 180)
  };
}

function normalizeSignals(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const output = [];
  for (const candidate of input) {
    const signal = normalizeSignal(candidate);
    if (!signal || !signal.id || seen.has(signal.id)) continue;
    seen.add(signal.id);
    output.push(signal);
    if (output.length >= MAX_SIGNALS) break;
  }
  return output;
}

function upsertSignal(signals, input) {
  const signal = normalizeSignal(input);
  if (!signal) return normalizeSignals(signals);
  return normalizeSignals([signal, ...(signals || []).filter((candidate) => candidate?.id !== signal.id)]);
}

module.exports = { MAX_SIGNALS, normalizeSignal, normalizeSignals, upsertSignal };
