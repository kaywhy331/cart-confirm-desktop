"use strict";

const WALMART_HOSTS = new Set(["walmart.com", "www.walmart.com"]);
const WALMART_BUY_NOW_PATH = "/affil/cart/buynow";
const WALMART_SKU_PATTERN = /^\d{5,20}$/;

function cleanWalmartSku(value) {
  const sku = String(value || "").trim();
  return WALMART_SKU_PATTERN.test(sku) ? sku : "";
}

function buildWalmartBuyNowUrl(value) {
  const sku = cleanWalmartSku(value);
  if (!sku) return "";
  const output = new URL(`https://www.walmart.com${WALMART_BUY_NOW_PATH}`);
  output.searchParams.set("items", sku);
  return output.href;
}

function sanitizeWalmartBuyNowUrl(value, expectedSku = "") {
  let input;
  try {
    input = new URL(String(value || "").trim());
  } catch {
    return null;
  }
  if (input.protocol !== "https:" || !WALMART_HOSTS.has(input.hostname.toLowerCase())) return null;
  if (input.pathname.replace(/\/{2,}/g, "/").toLowerCase() !== WALMART_BUY_NOW_PATH) return null;
  if (input.searchParams.getAll("items").length !== 1) return null;

  const sku = cleanWalmartSku(input.searchParams.get("items"));
  const requiredSku = cleanWalmartSku(expectedSku);
  if (!sku || (requiredSku && sku !== requiredSku)) return null;

  return Object.freeze({ kind: "walmart-buy-now", url: buildWalmartBuyNowUrl(sku), sku });
}

module.exports = { buildWalmartBuyNowUrl, WALMART_BUY_NOW_PATH, sanitizeWalmartBuyNowUrl };
