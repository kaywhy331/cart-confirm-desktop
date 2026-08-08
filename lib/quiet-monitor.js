"use strict";

// Read-only background stock checks: parse a fetched product page's
// schema.org JSON-LD (plus a couple of retailer-specific JSON markers) for
// availability and price. No cookies, no cart actions — the browser opens
// only after a mission verifies in stock, and the in-tab pipeline re-verifies
// everything before acting.

const SKU_URL_PATTERNS = Object.freeze({
  target: /(?:\/|-)A-(\d{6,12})(?:[/?#]|$)/i,
  walmart: /\/ip\/(?:[^/?#]+\/)?(\d{5,20})(?:[/?#]|$)/i,
  amazon: /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i
});

function extractJsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || ""))) && blocks.length < 25) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Skip malformed blocks.
    }
  }
  return blocks;
}

function productNodes(blocks) {
  const nodes = [];
  const stack = blocks.map((block) => [block, 0]);
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== "object" || depth > 6) continue;
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 50)) stack.push([item, depth + 1]);
      continue;
    }
    const types = [node["@type"]].flat().map((type) => String(type || "").toLowerCase());
    if (types.includes("product")) nodes.push(node);
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
      if (node[key]) stack.push([node[key], depth + 1]);
    }
  }
  return nodes;
}

function flattenOffers(offers, depth = 0) {
  if (depth > 3) return [];
  const flat = [];
  for (const offer of [offers].flat().filter(Boolean).slice(0, 10)) {
    if (typeof offer !== "object") continue;
    flat.push(offer);
    if (offer.offers) flat.push(...flattenOffers(offer.offers, depth + 1));
  }
  return flat;
}

function offerAvailability(offer) {
  const text = String(offer.availability || offer.Availability || "");
  if (/InStock|LimitedAvailability|OnlineOnly|PreSale|BackOrder/i.test(text)) return "available";
  if (/OutOfStock|SoldOut|Discontinued/i.test(text)) return "unavailable";
  return "unknown";
}

function offerPrice(offer) {
  for (const raw of [offer.price, offer.lowPrice]) {
    const price = Number(raw);
    if (raw !== undefined && raw !== null && raw !== "" && Number.isFinite(price) && price >= 0 && price <= 1_000_000) {
      return Math.round(price * 100) / 100;
    }
  }
  return null;
}

function checkProductPage(html, retailer, sku) {
  const wanted = String(sku || "");
  const nodes = productNodes(extractJsonLdBlocks(html));
  const matching = nodes.filter((node) => {
    const nodeSku = String(node.sku || node.productID || "").trim();
    const url = String(node.url || node["@id"] || "");
    const urlSku = url.match(SKU_URL_PATTERNS[retailer] || /$^/)?.[1] || "";
    return wanted && (nodeSku === wanted || (retailer === "amazon" ? urlSku.toUpperCase() : urlSku) === wanted);
  });
  const usable = matching.length ? matching : (nodes.length === 1 ? nodes : []);

  let availability = "unknown";
  let price = null;
  for (const node of usable) {
    for (const offer of flattenOffers(node.offers)) {
      const state = offerAvailability(offer);
      if (state === "available") availability = "available";
      else if (state === "unavailable" && availability !== "available") availability = "unavailable";
      price ??= offerPrice(offer);
    }
  }

  // Retailer JSON markers as a fallback when JSON-LD is absent or bare.
  if (availability === "unknown") {
    if (/"availabilityStatus"\s*:\s*"IN_STOCK"/i.test(html)) availability = "available";
    else if (/"availabilityStatus"\s*:\s*"OUT_OF_STOCK"/i.test(html)) availability = "unavailable";
  }

  return { availability, price };
}

module.exports = { checkProductPage, extractJsonLdBlocks };
