"use strict";

(() => {
  const TITLE_SELECTORS = Object.freeze({
    target: ["h1[data-test='product-title']", "h1[data-test*='product-title' i]", "h1"],
    walmart: ["h1[data-automation-id='product-title']", "h1[itemprop='name']", "h1"],
    amazon: ["#productTitle", "h1"]
  });
  const IMAGE_SELECTORS = Object.freeze({
    target: [
      "[data-test='product-image'] img",
      "[data-test*='product-image' i] img",
      "[data-testid*='product-image' i] img"
    ],
    walmart: [
      "img[data-testid='hero-image']",
      "[data-testid='hero-image-container'] img",
      "[data-automation-id='product-image'] img"
    ],
    amazon: ["#landingImage", "#imgBlkFront", "#main-image img"]
  });

  function cleanTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s+(?:[-|:]\s*)?(?:Target|Walmart(?:\.com)?|Amazon(?:\.com)?)\s*$/i, "")
      .trim()
      .slice(0, 80);
  }

  function hasUsablePrice(value) {
    if (typeof value !== "number" && typeof value !== "string") return false;
    if (typeof value === "string" && !value.trim()) return false;
    const price = Number(value);
    return Number.isFinite(price) && price > 0;
  }

  function pageTitle(doc, retailer, Retailers) {
    for (const selector of TITLE_SELECTORS[retailer] || []) {
      const element = doc.querySelector(selector);
      const title = cleanTitle(Retailers.textOf(element));
      if (title) return title;
    }
    const meta = doc.querySelector("meta[property='og:title'], meta[name='title']");
    return cleanTitle(meta?.getAttribute("content") || doc.title);
  }

  function affiliateCaptureUrl(value) {
    // A product page opened through an affiliate link carries its tracking
    // parameters in the query string. Capture the full HTTPS URL so the
    // mission keeps affiliate credit; the canonical query-free URL remains
    // the mission's base product link.
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.search ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeImageCandidate(value, pageUrl) {
    if (!String(value || "").trim()) return "";
    try {
      const url = new URL(String(value || ""), String(pageUrl || ""));
      if (url.protocol !== "https:" || url.username || url.password) return "";
      url.hash = "";
      return url.href.length <= 2_048 ? url.href : "";
    } catch {
      return "";
    }
  }

  function dynamicAmazonImage(element) {
    try {
      const entries = Object.entries(JSON.parse(element?.getAttribute("data-a-dynamic-image") || "{}"));
      entries.sort((left, right) => {
        const leftSize = Array.isArray(left[1]) ? Number(left[1][0]) * Number(left[1][1]) : 0;
        const rightSize = Array.isArray(right[1]) ? Number(right[1][0]) * Number(right[1][1]) : 0;
        return rightSize - leftSize;
      });
      return entries[0]?.[0] || "";
    } catch {
      return "";
    }
  }

  function imageElementUrl(element, pageUrl) {
    if (!element) return "";
    const candidates = [
      element.getAttribute("data-old-hires"),
      dynamicAmazonImage(element),
      element.currentSrc,
      element.getAttribute("src"),
      element.getAttribute("data-src")
    ];
    for (const candidate of candidates) {
      const normalized = normalizeImageCandidate(candidate, pageUrl);
      if (normalized) return normalized;
    }
    return "";
  }

  function pageImageUrl(doc, value, retailer = globalThis.CartConfirmRetailers?.detectRetailer(value)) {
    for (const selector of IMAGE_SELECTORS[retailer] || []) {
      const imageUrl = imageElementUrl(doc.querySelector(selector), value);
      if (imageUrl) return imageUrl;
    }
    for (const selector of [
      "meta[property='og:image']",
      "meta[property='og:image:secure_url']",
      "meta[name='twitter:image']",
      "link[rel='image_src']"
    ]) {
      const element = doc.querySelector(selector);
      const imageUrl = normalizeImageCandidate(
        element?.getAttribute("content") || element?.getAttribute("href"),
        value
      );
      if (imageUrl) return imageUrl;
    }
    return "";
  }

  function canonicalProductUrl(retailer, sku, value) {
    if (retailer === "walmart") return `https://www.walmart.com/ip/${sku}`;
    if (retailer === "amazon") return `https://www.amazon.com/dp/${sku}`;
    const url = new URL(String(value || ""));
    const path = (url.pathname || "/").replace(/\/{2,}/g, "/");
    return `https://www.target.com${path}`;
  }

  function inspectProductPage(doc, value, Retailers = globalThis.CartConfirmRetailers) {
    if (!Retailers) throw new Error("Retailer helpers are unavailable on this page.");
    const retailer = Retailers.detectRetailer(value);
    const adapter = Retailers.getAdapter(retailer);
    const sku = Retailers.extractSkuFromUrl(retailer, value);
    if (!adapter || !sku || adapter.pageKind(value) !== "product") {
      throw new Error("Open a Target, Walmart, or Amazon product page before using Quick add.");
    }
    const offer = adapter.offer(doc, { retailer, sku });
    const price = Number(offer?.price);
    return {
      retailer,
      sku,
      title: pageTitle(doc, retailer, Retailers) || `${adapter.label} ${sku}`,
      imageUrl: pageImageUrl(doc, value, retailer),
      productUrl: canonicalProductUrl(retailer, sku, value),
      affiliateOpenUrl: affiliateCaptureUrl(value),
      price: hasUsablePrice(offer?.price) ? Math.round(price * 100) / 100 : null,
      seller: String(offer?.seller || "").replace(/\s+/g, " ").trim().slice(0, 160),
      firstParty: offer?.firstParty === true,
      available: offer?.available === true,
      observedAt: new Date().toISOString()
    };
  }

  const api = Object.freeze({ affiliateCaptureUrl, canonicalProductUrl, cleanTitle, hasUsablePrice, inspectProductPage, pageImageUrl, pageTitle });
  globalThis.CartConfirmQuickAdd = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
