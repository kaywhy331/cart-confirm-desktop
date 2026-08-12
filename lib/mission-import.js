"use strict";

const {
  MAX_PRODUCTS,
  normalizeProduct
} = require("./core");
const {
  detectRetailer,
  extractSku,
  normalizeProductUrl
} = require("./retailers");

const URL_PATTERN = /https:\/\/[^\s<>"']+/gi;

function deriveTitleFromUrl(value) {
  try {
    const segments = new URL(String(value || "")).pathname.split("/").filter(Boolean);
    const candidates = segments.filter((segment) => (
      !["p", "ip", "dp", "gp", "product"].includes(segment.toLowerCase())
      && !/^A-\d+$/i.test(segment)
      && !/^\d+$/.test(segment)
      && !/^[A-Z0-9]{10}$/i.test(segment)
      && segment !== "-"
    ));
    const slug = candidates.sort((a, b) => b.length - a.length)[0] || "";
    return decodeURIComponent(slug)
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .slice(0, 80);
  } catch {
    return "";
  }
}

function trimUrlPunctuation(value) {
  return String(value || "").replace(/[\])},.;]+$/g, "");
}

function urlEntries(text) {
  const entries = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const matches = line.match(URL_PATTERN) || [];
    if (!matches.length) {
      entries.push({ line: index + 1, url: "", reason: "No HTTPS URL was found." });
      continue;
    }
    for (const match of matches) {
      entries.push({ line: index + 1, url: trimUrlPunctuation(match), reason: "" });
    }
  }
  return entries;
}

function bulkMissionFromUrl(value) {
  const productUrl = normalizeProductUrl(value);
  return normalizeProduct({
    retailer: detectRetailer(productUrl),
    title: deriveTitleFromUrl(productUrl),
    productUrl,
    maxPrice: 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "watch",
    alertLevel: "standard",
    fulfillmentMode: "manual",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    // A URL alone cannot establish a safe price ceiling. Imported missions
    // therefore remain inert until the operator reviews and enables them.
    enabled: false
  });
}

function planBulkImport(text, existingProducts = [], maximum = MAX_PRODUCTS) {
  const entries = urlEntries(text);
  const existingIds = new Set(existingProducts.map((product) => String(product?.id || "")));
  const plannedIds = new Set();
  const additions = [];
  const issues = [];
  let duplicates = 0;
  let invalid = 0;
  let overCapacity = 0;

  for (const entry of entries) {
    if (!entry.url) {
      invalid += 1;
      issues.push({ line: entry.line, reason: entry.reason });
      continue;
    }
    let product;
    try {
      product = bulkMissionFromUrl(entry.url);
    } catch {
      invalid += 1;
      issues.push({ line: entry.line, reason: "Not a supported Target, Walmart, or Amazon product URL." });
      continue;
    }
    if (existingIds.has(product.id) || plannedIds.has(product.id)) {
      duplicates += 1;
      continue;
    }
    if (existingProducts.length + additions.length >= maximum) {
      overCapacity += 1;
      continue;
    }
    plannedIds.add(product.id);
    additions.push(product);
  }

  return {
    additions,
    issues: issues.slice(0, 10),
    summary: {
      candidates: entries.length,
      imported: additions.length,
      duplicates,
      invalid,
      overCapacity
    }
  };
}

function quickAddMission(input = {}) {
  const productUrl = normalizeProductUrl(input.productUrl);
  const retailer = detectRetailer(productUrl);
  const urlSku = extractSku(retailer, productUrl);
  const requestedRetailer = String(input.retailer || retailer).toLowerCase();
  const requestedSku = retailer === "amazon"
    ? String(input.sku || urlSku).trim().toUpperCase()
    : String(input.sku || urlSku).trim();
  if (requestedRetailer !== retailer || !urlSku || requestedSku !== urlSku) {
    throw new Error("The captured store and item ID do not match the product page.");
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    throw new Error("The retailer page must expose a current price before Quick add can create a mission.");
  }

  return normalizeProduct({
    retailer,
    title: String(input.title || "").trim() || deriveTitleFromUrl(productUrl),
    productUrl,
    sku: urlSku,
    maxPrice: price,
    maxOrderTotal: 0,
    quantity: 1,
    action: "watch",
    alertLevel: "standard",
    fulfillmentMode: "manual",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    enabled: true
  });
}

module.exports = {
  bulkMissionFromUrl,
  deriveTitleFromUrl,
  planBulkImport,
  quickAddMission,
  urlEntries
};
