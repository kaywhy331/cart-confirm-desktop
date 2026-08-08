"use strict";

const { matchSignalProduct } = require("./restock-signal");

const SIGNAL_FRESH_MS = 2 * 60_000;

function firstPartyAmazonSeller(value) {
  return /^amazon(?:\.com)?$/i.test(String(value || "").trim());
}

function entryAllowedForProduct(entry, product = {}) {
  if (entry === "product") return true;
  if (entry === "walmart-buy-now") {
    return product.retailer === "walmart" && ["review", "checkout"].includes(product.action);
  }
  if (entry === "amazon-atc") {
    return product.retailer === "amazon" && ["cart", "review", "checkout"].includes(product.action);
  }
  if (entry === "amazon-buy-now") {
    return product.retailer === "amazon" && ["review", "checkout"].includes(product.action);
  }
  return false;
}

function planSignalRoute(options = {}) {
  const signal = options.signal || {};
  const settings = options.settings || {};
  const product = matchSignalProduct(signal, settings.products || []);
  if (options.historical) {
    return Object.freeze({ state: "historical", product, url: "", entry: "none", note: "History imported without opening a page." });
  }
  if (settings.monitoringPaused) {
    return Object.freeze({ state: "disabled", product, url: "", entry: "none", note: "Stop is active; the signal was recorded without opening a page." });
  }
  if (!product) {
    return Object.freeze({ state: "new-product", product: null, url: "", entry: "none", note: "New product — add it as a desired mission to react automatically next time." });
  }
  if (!settings.discordAutoOpen || !product.enabled || !product.signalAutoOpen) {
    return Object.freeze({ state: "disabled", product, url: "", entry: "none", note: "Matched, but automatic signal opening is disabled." });
  }
  const observedAt = new Date(signal.observedAt).getTime();
  const now = Number(options.now ?? Date.now());
  if (!Number.isFinite(observedAt) || !Number.isFinite(now) || now - observedAt > SIGNAL_FRESH_MS) {
    return Object.freeze({ state: "stale", product, url: "", entry: "none", note: "The signal is older than two minutes and was not opened automatically." });
  }

  let entry = "product";
  let url = product.productUrl;
  let note = "Desired product matched; opening its verified product flow.";
  const signalPrice = Number(signal.price);
  const underCap = Number.isFinite(signalPrice) && signalPrice > 0 && signalPrice <= product.maxPrice;
  const directAllowed = settings.automationEnabled && underCap;
  const amazonDirectAllowed = directAllowed && firstPartyAmazonSeller(signal.seller);
  if (
    product.signalEntry === "walmart-buy-now"
    && entryAllowedForProduct(product.signalEntry, product)
    && signal.walmartBuyNowUrl
    && directAllowed
  ) {
    entry = "walmart-buy-now";
    url = signal.walmartBuyNowUrl;
    note = "Desired Walmart item matched the price cap; opening its sanitized Buy Now entry for in-browser verification.";
  } else if (
    product.signalEntry === "amazon-atc"
    && entryAllowedForProduct(product.signalEntry, product)
    && signal.amazonAtcUrl
    && amazonDirectAllowed
  ) {
    entry = "amazon-atc";
    url = signal.amazonAtcUrl;
    note = "Desired Amazon offer matched the seller and price cap; opening its sanitized Add to Cart entry.";
  } else if (
    product.signalEntry === "amazon-buy-now"
    && entryAllowedForProduct(product.signalEntry, product)
    && signal.amazonBuyNowUrl
    && amazonDirectAllowed
  ) {
    entry = "amazon-buy-now";
    url = signal.amazonBuyNowUrl;
    note = "Desired Amazon offer matched the seller and price cap; opening its sanitized Buy Now entry for in-browser verification.";
  } else if (product.signalEntry !== "product") {
    note = product.retailer === "amazon"
      ? "The direct Amazon signal did not prove an under-cap Amazon.com offer, so Cart Confirm is opening the canonical product page instead."
      : "The direct Walmart signal did not prove a fresh under-cap item link, so Cart Confirm is opening the canonical product page instead.";
  }
  return Object.freeze({ state: "pending", product, url, entry, note });
}

module.exports = { SIGNAL_FRESH_MS, entryAllowedForProduct, firstPartyAmazonSeller, planSignalRoute };
