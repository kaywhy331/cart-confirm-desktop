"use strict";

(function exposeTrackalackerLinks(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CartConfirmTrackalackerLinks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function decodeBase64Url(value) {
    try {
      const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      if (typeof atob === "function") return atob(padded);
      if (typeof Buffer !== "undefined") return Buffer.from(padded, "base64").toString("utf8");
      return "";
    } catch {
      return "";
    }
  }

  function canonicalProductUrl(value, expectedRetailer, Retailers = globalThis.CartConfirmRetailers) {
    if (!Retailers || !["target", "walmart", "amazon"].includes(expectedRetailer)) return null;
    let candidate = String(value || "").trim();
    for (let depth = 0; depth < 4 && candidate; depth += 1) {
      let url;
      try {
        url = new URL(candidate, expectedRetailer === "walmart" ? "https://www.walmart.com" : undefined);
      } catch {
        return null;
      }
      const retailer = Retailers.detectRetailer(url.href);
      const sku = retailer ? Retailers.extractSkuFromUrl(retailer, url.href) : "";
      if (retailer === expectedRetailer && sku) {
        const productUrl = retailer === "amazon"
          ? `https://www.amazon.com/dp/${sku}`
          : retailer === "walmart"
            ? `https://www.walmart.com/ip/${sku}`
            : `https://www.target.com${url.pathname.replace(/\/{2,}/g, "/")}`;
        return { retailer, sku, productUrl };
      }

      const embedded = url.searchParams.get("u") || url.searchParams.get("url") || "";
      if (!embedded) return null;
      if (url.hostname.toLowerCase().endsWith("walmart.com") && url.pathname === "/blocked") {
        candidate = decodeBase64Url(embedded) || embedded;
      } else {
        candidate = embedded;
      }
    }
    return null;
  }

  function isAllowedRedirectHost(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:"
        && !url.username
        && !url.password
        && (host === "howl.link" || host.endsWith(".howl.link"));
    } catch {
      return false;
    }
  }

  return Object.freeze({ canonicalProductUrl, decodeBase64Url, isAllowedRedirectHost });
});
