"use strict";

const RETAILERS = Object.freeze({
  target: Object.freeze({
    id: "target",
    label: "Target",
    canonicalHost: "www.target.com",
    hosts: Object.freeze(["target.com", "www.target.com"]),
    skuLabel: "TCIN",
    skuPattern: /^\d{6,12}$/,
    cartUrl: "https://www.target.com/cart",
    ordersUrl: "https://www.target.com/account/orders"
  }),
  walmart: Object.freeze({
    id: "walmart",
    label: "Walmart",
    canonicalHost: "www.walmart.com",
    hosts: Object.freeze(["walmart.com", "www.walmart.com"]),
    skuLabel: "item ID",
    skuPattern: /^\d{5,20}$/,
    cartUrl: "https://www.walmart.com/cart",
    ordersUrl: "https://www.walmart.com/orders"
  }),
  amazon: Object.freeze({
    id: "amazon",
    label: "Amazon",
    canonicalHost: "www.amazon.com",
    hosts: Object.freeze(["amazon.com", "www.amazon.com"]),
    skuLabel: "ASIN",
    skuPattern: /^[A-Z0-9]{10}$/,
    cartUrl: "https://www.amazon.com/gp/cart/view.html",
    ordersUrl: "https://www.amazon.com/gp/css/order-history"
  })
});

const HOST_TO_RETAILER = new Map(
  Object.values(RETAILERS).flatMap((retailer) => (
    retailer.hosts.map((host) => [host, retailer.id])
  ))
);

function parseRetailUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("Enter a valid Target, Walmart, or Amazon product URL.");
  }

  const retailer = HOST_TO_RETAILER.get(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" || !retailer) {
    throw new Error("Only HTTPS Target.com, Walmart.com, and Amazon.com URLs are allowed.");
  }

  return { parsed, retailer };
}

function detectRetailer(rawUrl) {
  try {
    return parseRetailUrl(rawUrl).retailer;
  } catch {
    return "";
  }
}

function extractSku(retailer, value) {
  const text = String(value || "").trim();
  const normalizedRetailer = String(retailer || "").toLowerCase();
  const config = RETAILERS[normalizedRetailer];
  if (!config) return "";

  const direct = normalizedRetailer === "amazon" ? text.toUpperCase() : text;
  if (config.skuPattern.test(direct)) return direct;

  const patterns = {
    target: [
      /(?:\/|-)A-(\d{6,12})(?:[/?#]|$)/i,
      /addToCartButtonOrTextIdFor(\d{6,12})/i,
      /\bTCIN\D{0,8}(\d{6,12})\b/i
    ],
    walmart: [
      /\/ip\/(?:[^/?#]+\/)?(\d{5,20})(?:[/?#]|$)/i,
      /[?&](?:itemId|productId)=(\d{5,20})(?:&|$)/i,
      /\b(?:item\s*id|Walmart\s*#)\D{0,8}(\d{5,20})\b/i
    ],
    amazon: [
      /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
      /[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:&|$)/,
      /\bASIN\D{0,8}([A-Z0-9]{10})\b/i
    ]
  };

  for (const pattern of patterns[normalizedRetailer]) {
    const match = text.match(pattern);
    if (match) {
      return normalizedRetailer === "amazon" ? match[1].toUpperCase() : match[1];
    }
  }

  return "";
}

function normalizeSku(retailer, value) {
  const normalizedRetailer = String(retailer || "").toLowerCase();
  const config = RETAILERS[normalizedRetailer];
  const sku = normalizedRetailer === "amazon"
    ? String(value || "").trim().toUpperCase()
    : String(value || "").trim();

  if (!config || !config.skuPattern.test(sku)) {
    const label = config?.skuLabel || "SKU";
    throw new Error(`Enter a valid ${label} for ${config?.label || "this store"}.`);
  }

  return sku;
}

function normalizeProductUrl(rawUrl) {
  const { parsed, retailer } = parseRetailUrl(rawUrl);
  const sku = extractSku(retailer, parsed.href);
  const config = RETAILERS[retailer];

  if (retailer === "amazon" && sku) {
    return `https://${config.canonicalHost}/dp/${sku}`;
  }
  if (retailer === "walmart" && sku) {
    return `https://${config.canonicalHost}/ip/${sku}`;
  }

  const pathname = parsed.pathname.replace(/\/{2,}/g, "/") || "/";
  return `https://${config.canonicalHost}${pathname}`;
}

function retailerFromPage(rawUrl) {
  return detectRetailer(rawUrl);
}

function retailerLabel(retailer) {
  return RETAILERS[retailer]?.label || "Retailer";
}

function storeUrl(retailer, type) {
  const config = RETAILERS[retailer];
  if (!config || !["cartUrl", "ordersUrl"].includes(type)) return "";
  return config[type];
}

module.exports = {
  RETAILERS,
  detectRetailer,
  extractSku,
  normalizeProductUrl,
  normalizeSku,
  parseRetailUrl,
  retailerFromPage,
  retailerLabel,
  storeUrl
};
