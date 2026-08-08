"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers
    || (typeof require === "function" ? require("./retailers") : null);

  function tabSku(retailer, url) {
    return Retailers?.extractSkuFromUrl?.(String(retailer || ""), String(url || "")) || "";
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

    const free = tabs.filter((candidate) => {
      const sku = tabSku(retailer, candidate?.url);
      return !sku || !otherMissionSkus.has(sku);
    });
    return free.find((candidate) => candidate?.active)
      || [...free].sort((a, b) => Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0))[0]
      || null;
  }

  const api = Object.freeze({ chooseReusableTab, tabSku });
  globalThis.CartConfirmOpenRequestTabs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
