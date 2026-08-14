"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers
    || (typeof require === "function" ? require("./retailers") : null);
  const CONTEXT_TTL_MS = 4 * 60 * 60_000;

  function cleanTabId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id >= 0 ? String(id) : "";
  }

  function entryFromUrl(retailer, value, expectedSku = "") {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:"
        || ![`${retailer}.com`, `www.${retailer}.com`].includes(host)
      ) return "";
      const path = url.pathname.replace(/\/{2,}/g, "/").toLowerCase();
      const sku = String(expectedSku || "");
      if (retailer === "walmart" && path === "/affil/cart/buynow") {
        const items = [...url.searchParams]
          .filter(([name]) => name.toLowerCase() === "items")
          .map(([, item]) => item);
        return items.length === 1 && items[0] === sku ? "walmart-buy-now" : "";
      }
      if (
        retailer === "amazon"
        && ["/gp/aws/cart/add.html", "/gp/buy/express/handlers/display.html"].includes(path)
      ) {
        const asins = [...url.searchParams]
          .filter(([name]) => ["asin", "asin.1"].includes(name.toLowerCase()))
          .map(([, asin]) => asin.toUpperCase());
        if (asins.length !== 1 || asins[0] !== sku.toUpperCase()) return "";
        return path === "/gp/aws/cart/add.html" ? "amazon-atc" : "amazon-buy-now";
      }
    } catch {
      // Invalid URLs are rejected by validateOpenRequest before context is used.
      return "";
    }
    return "product";
  }

  function signalOrderLimit(value) {
    const limit = Number(value);
    return Number.isInteger(limit) && limit > 0 && limit <= 99 ? limit : null;
  }

  function validateOpenRequest(config = {}, request = {}, now = Date.now()) {
    const productId = String(request.productId || "");
    if (!productId) {
      return request.contextRequired
        ? Object.freeze({ ok: false, reason: "product-context-required", context: null })
        : Object.freeze({ ok: true, reason: "", context: null });
    }
    const product = (config.products || []).find((candidate) => candidate?.id === productId);
    const retailer = String(request.retailer || "");
    const url = String(request.url || "");
    const sku = Retailers?.extractSkuFromUrl?.(retailer, url) || "";
    const entry = entryFromUrl(retailer, url, product?.sku);
    if (
      !product
      || product.retailer !== retailer
      || product.sku !== sku
      || Retailers?.detectRetailer?.(url) !== retailer
      || !entry
      || (request.contextRequired && entry === "product")
    ) {
      return Object.freeze({ ok: false, reason: "product-context-mismatch", context: null });
    }
    return Object.freeze({
      ok: true,
      reason: "",
      context: Object.freeze({
        productId: product.id,
        retailer: product.retailer,
        sku: product.sku,
        entry,
        signalOrderLimit: signalOrderLimit(request.signalOrderLimit),
        createdAt: now,
        expiresAt: now + CONTEXT_TTL_MS
      })
    });
  }

  function normalizeContextMap(input, now = Date.now()) {
    const output = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return output;
    for (const [tabIdValue, context] of Object.entries(input).slice(-200)) {
      const tabId = cleanTabId(tabIdValue);
      const productId = String(context?.productId || "").slice(0, 80);
      const retailer = String(context?.retailer || "");
      const sku = String(context?.sku || "").slice(0, 24);
      const entry = ["product", "walmart-buy-now", "amazon-atc", "amazon-buy-now"].includes(context?.entry)
        ? context.entry
        : "product";
      const expiresAt = Number(context?.expiresAt || 0);
      if (
        !tabId
        || !/^(?:target|walmart|amazon):/.test(productId)
        || !["target", "walmart", "amazon"].includes(retailer)
        || !sku
        || !Number.isFinite(expiresAt)
        || expiresAt <= now
      ) continue;
      output[tabId] = {
        productId,
        retailer,
        sku,
        entry,
        signalOrderLimit: signalOrderLimit(context?.signalOrderLimit),
        createdAt: Math.max(0, Number(context.createdAt || 0)),
        expiresAt
      };
    }
    return output;
  }

  function productIdForTab(config = {}, contexts = {}, tabIdValue, retailer, now = Date.now()) {
    const tabId = cleanTabId(tabIdValue);
    const context = normalizeContextMap(contexts, now)[tabId];
    if (!context || context.retailer !== retailer) return "";
    const product = (config.products || []).find((candidate) => (
      candidate?.id === context.productId
      && candidate.retailer === context.retailer
      && candidate.sku === context.sku
    ));
    return product?.id || "";
  }

  function contextForTab(config = {}, contexts = {}, tabIdValue, retailer, now = Date.now()) {
    const normalized = normalizeContextMap(contexts, now);
    const tabId = cleanTabId(tabIdValue);
    const context = normalized[tabId];
    const productId = productIdForTab(config, normalized, tabId, retailer, now);
    return productId ? { ...context, productId } : null;
  }

  const api = Object.freeze({
    CONTEXT_TTL_MS,
    contextForTab,
    normalizeContextMap,
    productIdForTab,
    signalOrderLimit,
    validateOpenRequest
  });
  globalThis.CartConfirmTabContext = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
