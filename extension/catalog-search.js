"use strict";

(() => {
  const MAX_RESULTS_PER_RETAILER = 20;
  const SEARCH_URLS = Object.freeze({
    target: (query) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
    walmart: (query) => `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
    amazon: (query) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
  });

  const CARD_SELECTORS = Object.freeze({
    target: "[data-test*='ProductCard'], [data-test*='product-card'], article, li",
    walmart: "[data-item-id], [data-testid*='item'], [data-automation-id*='product'], article, li",
    amazon: "[data-component-type='s-search-result'], [data-asin], .s-result-item"
  });

  const ANCHOR_SELECTORS = Object.freeze({
    target: "a[href*='/-/A-'], a[href*='/p/'][href*='A-']",
    walmart: "a[href*='/ip/']",
    amazon: "a[href*='/dp/'], a[href*='/gp/product/']"
  });

  const TITLE_SELECTORS = Object.freeze({
    target: ["[data-test='product-title']", "[data-test*='product-title' i]", "h3", "h2"],
    walmart: ["[data-automation-id='product-title']", "[data-testid='product-title']", "h2", "h3"],
    amazon: ["h2 a span", "h2 span", ".a-size-medium", ".a-size-base-plus"]
  });

  const PRICE_SELECTORS = Object.freeze({
    target: ["[data-test='current-price']", "[data-test='product-price']", "[data-test*='current-price' i]"],
    walmart: ["[data-automation-id='product-price']", "[data-testid='price-wrap']", "[itemprop='price']"],
    amazon: [".a-price .a-offscreen", ".a-price", "[data-a-color='price'] .a-offscreen"]
  });

  function cleanText(value, maximum = 120) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function normalizeQuery(value) {
    const query = cleanText(value, 80);
    if (query.length < 2) throw new Error("Enter a keyword search from 2 to 80 characters.");
    return query;
  }

  function buildSearchUrl(retailer, value) {
    const builder = SEARCH_URLS[String(retailer || "").toLowerCase()];
    if (!builder) throw new Error("Choose Target, Walmart, or Amazon for this catalog search.");
    return builder(normalizeQuery(value));
  }

  function searchPageContext(value, Retailers = globalThis.CartConfirmRetailers) {
    if (!Retailers) return null;
    let url;
    try {
      url = new URL(String(value || ""));
    } catch {
      return null;
    }
    const retailer = Retailers.detectRetailer(url.href);
    let rawQuery = "";
    if (retailer === "target" && url.pathname === "/s") rawQuery = url.searchParams.get("searchTerm") || "";
    if (retailer === "walmart" && url.pathname === "/search") rawQuery = url.searchParams.get("q") || "";
    if (retailer === "amazon" && url.pathname === "/s") rawQuery = url.searchParams.get("k") || "";
    const query = cleanText(rawQuery, 80);
    return retailer && query.length >= 2 ? { retailer, query } : null;
  }

  function visibleInDocument(element) {
    if (!element?.isConnected) return false;
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
      const style = current.getAttribute("style") || "";
      if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style)) return false;
      const computed = current.ownerDocument?.defaultView?.getComputedStyle?.(current);
      if (computed?.display === "none" || computed?.visibility === "hidden") return false;
    }
    return true;
  }

  function firstText(root, selectors, Retailers) {
    for (const selector of selectors || []) {
      const element = root.querySelector(selector);
      if (!visibleInDocument(element)) continue;
      const text = cleanText(Retailers.textOf(element), 120);
      if (text) return text;
    }
    return "";
  }

  function canonicalProductUrl(retailer, sku, href) {
    if (retailer === "walmart") return `https://www.walmart.com/ip/${sku}`;
    if (retailer === "amazon") return `https://www.amazon.com/dp/${sku}`;
    const url = new URL(href);
    const pathname = (url.pathname || "/").replace(/\/{2,}/g, "/");
    return `https://www.target.com${pathname}`;
  }

  function listingPrice(card, retailer, Retailers) {
    for (const selector of PRICE_SELECTORS[retailer] || []) {
      const element = card.querySelector(selector);
      if (!visibleInDocument(element)) continue;
      const attributePrice = element?.getAttribute("content") || element?.getAttribute("value") || "";
      const numericAttribute = /^\d{1,7}(?:\.\d{1,2})?$/.test(attributePrice) ? Number(attributePrice) : null;
      const parsed = Retailers.parsePrice(attributePrice)
        ?? Retailers.parsePrice(Retailers.textOf(element))
        ?? numericAttribute;
      if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
    }
    return null;
  }

  function listingTitle(card, anchor, retailer, Retailers) {
    const selected = firstText(card, TITLE_SELECTORS[retailer], Retailers);
    if (selected) return cleanText(selected, 80);
    return cleanText(
      anchor.getAttribute("aria-label") || anchor.getAttribute("title") || Retailers.textOf(anchor),
      80
    );
  }

  function inspectSearchPage(doc, value, Retailers = globalThis.CartConfirmRetailers, now = Date.now()) {
    if (!Retailers) throw new Error("Retailer helpers are unavailable on this page.");
    const context = searchPageContext(value, Retailers);
    if (!context) throw new Error("Open an official Target, Walmart, or Amazon search-results page.");
    const anchors = [...doc.querySelectorAll(ANCHOR_SELECTORS[context.retailer])];
    const results = [];
    const seen = new Set();

    for (const anchor of anchors) {
      if (results.length >= MAX_RESULTS_PER_RETAILER) break;
      if (!visibleInDocument(anchor)) continue;
      let href;
      try {
        href = new URL(anchor.getAttribute("href") || "", value).href;
      } catch {
        continue;
      }
      const sku = Retailers.extractSkuFromUrl(context.retailer, href);
      if (!sku || seen.has(sku)) continue;
      const card = anchor.closest(CARD_SELECTORS[context.retailer]) || anchor.parentElement;
      if (!card || !visibleInDocument(card)) continue;
      const title = listingTitle(card, anchor, context.retailer, Retailers);
      if (!title) continue;
      seen.add(sku);
      results.push({
        id: `${context.retailer}:${sku}`,
        retailer: context.retailer,
        sku,
        title,
        productUrl: canonicalProductUrl(context.retailer, sku, href),
        price: listingPrice(card, context.retailer, Retailers),
        observedAt: new Date(now).toISOString()
      });
    }

    return { ...context, results };
  }

  function resultsFingerprint(capture = {}) {
    return JSON.stringify((capture.results || []).map((item) => [item.id, item.title, item.price]));
  }

  const api = Object.freeze({
    MAX_RESULTS_PER_RETAILER,
    buildSearchUrl,
    cleanText,
    inspectSearchPage,
    normalizeQuery,
    resultsFingerprint,
    searchPageContext,
    visibleInDocument
  });
  globalThis.CartConfirmCatalogSearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
