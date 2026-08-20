"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers
    || (typeof require === "function" ? require("./retailers") : null);
  const MAX_OPEN_REQUESTS = 100;

  function tabSku(retailer, url) {
    return Retailers?.extractSkuFromUrl?.(String(retailer || ""), String(url || "")) || "";
  }

  function shouldActivateTab(request = {}) {
    return request.background !== true;
  }

  function partitionOpenRequests(requests = []) {
    const bounded = (Array.isArray(requests) ? requests : []).slice(0, MAX_OPEN_REQUESTS);
    return {
      dedicated: bounded.filter((request) => request?.dedicatedTab === true),
      ordinary: bounded.filter((request) => request?.dedicatedTab !== true)
    };
  }

  // A tab sitting on a cart, checkout, or order-confirmation page is a live
  // purchase surface: the operator may be completing an order there right
  // now, and cart URLs carry no SKU so mission matching cannot protect them.
  // Open requests must never navigate over these pages.
  const PURCHASE_STAGE_PATHS = Object.freeze({
    target: /\/(?:cart|co-[a-z][\w-]*|checkout)(?:\/|$)|order-confirm|thank-?you|confirmation/,
    walmart: /\/cart|\/checkout|thank-?you|order-confirm|confirmation/,
    amazon: /\/gp\/cart|\/cart(?:\/|$)|\/gp\/buy|\/checkout|thank-?you|order-confirm/
  });

  function purchaseStageTab(retailer, url) {
    const pattern = PURCHASE_STAGE_PATHS[String(retailer || "")];
    if (!pattern) return false;
    try {
      return pattern.test(new URL(String(url || "")).pathname.toLowerCase());
    } catch {
      return false;
    }
  }

  function chooseReusableTab(config = {}, request = {}, tabs = []) {
    const retailer = String(request.retailer || "");
    const requestedSku = tabSku(retailer, request.url);
    const otherMissionSkus = new Set((config.products || [])
      .filter((product) => (
        product?.enabled
        && product.retailer === retailer
        && String(product.sku || "") !== requestedSku
      ))
      .map((product) => String(product.sku || ""))
      .filter(Boolean));

    const ownTab = requestedSku
      ? tabs.find((candidate) => tabSku(retailer, candidate?.url) === requestedSku)
      : null;
    if (ownTab) return ownTab;

    // Simultaneous scheduled drops must not race to reuse the same unrelated
    // store tab. Each request either keeps its exact mission tab or creates a
    // dedicated one.
    if (request.dedicatedTab === true) return null;

    const free = tabs.filter((candidate) => {
      if (purchaseStageTab(retailer, candidate?.url)) return false;
      const sku = tabSku(retailer, candidate?.url);
      return !sku || !otherMissionSkus.has(sku);
    });
    return free.find((candidate) => candidate?.active)
      || [...free].sort((a, b) => Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0))[0]
      || null;
  }

  const api = Object.freeze({
    MAX_OPEN_REQUESTS,
    chooseReusableTab,
    partitionOpenRequests,
    purchaseStageTab,
    shouldActivateTab,
    tabSku
  });
  globalThis.CartConfirmOpenRequestTabs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
