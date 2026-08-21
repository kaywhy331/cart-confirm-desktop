"use strict";

const { matchSignalProduct } = require("./restock-signal");
const { productCalendarOwned } = require("./schedule");
const { matchSignalStrategy } = require("./signal-strategies");

const SIGNAL_FRESH_MS = 2 * 60_000;

function firstPartyAmazonSeller(value) {
  return /^amazon(?:\.com)?$/i.test(String(value || "").trim());
}

function positiveOrderLimit(signal) {
  const value = Number(signal?.orderLimit);
  return Number.isInteger(value) && value > 0 && value <= 99 ? value : null;
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
  const configuredProduct = matchSignalProduct(signal, settings.products || []);
  if (options.historical) {
    return Object.freeze({ state: "historical", product: configuredProduct, url: "", entry: "none", note: "History imported without opening a page." });
  }
  if (settings.monitoringPaused) {
    return Object.freeze({ state: "disabled", product: configuredProduct, url: "", entry: "none", note: "Stop is active; the signal was recorded without opening a page." });
  }
  if (!configuredProduct) {
    return Object.freeze({ state: "new-product", product: null, url: "", entry: "none", note: "New product — add it as a desired mission to react automatically next time." });
  }
  const strategyDecision = matchSignalStrategy({ signal, product: configuredProduct, settings });
  if (strategyDecision.state === "unmatched") {
    return Object.freeze({
      state: "disabled",
      product: configuredProduct,
      url: "",
      entry: "none",
      reason: "no-strategy",
      strategyDecision,
      note: "The mission matched, but none of the enabled signal strategies matched its store, MSRP band, and keyword rules."
    });
  }
  const product = strategyDecision.product;
  if (productCalendarOwned(settings, product)) {
    return Object.freeze({
      state: "disabled",
      product,
      url: "",
      entry: "none",
      strategyDecision,
      note: "Matched, but this mission belongs to its calendar time and was not opened early."
    });
  }
  const automaticOpeningEnabled = options.autoOpenEnabled !== undefined
    ? Boolean(options.autoOpenEnabled)
    : Boolean(settings.discordAutoOpen);
  const notifyOnly = strategyDecision.state === "matched"
    && (strategyDecision.strategy.action === "notify" || strategyDecision.effectiveAction === "watch");
  if (!product.enabled || (!notifyOnly && (!automaticOpeningEnabled || !product.signalAutoOpen))) {
    return Object.freeze({ state: "disabled", product, url: "", entry: "none", strategyDecision, note: "Matched, but automatic signal opening is disabled." });
  }
  const observedAt = new Date(signal.observedAt).getTime();
  const now = Number(options.now ?? Date.now());
  if (!Number.isFinite(observedAt) || !Number.isFinite(now) || now - observedAt > SIGNAL_FRESH_MS) {
    return Object.freeze({ state: "stale", product, url: "", entry: "none", strategyDecision, note: "The signal is older than two minutes and no strategy action was taken." });
  }
  if (observedAt > now + 30_000) {
    return Object.freeze({ state: "stale", product, url: "", entry: "none", strategyDecision, note: "The signal timestamp is in the future and was not trusted." });
  }
  if (notifyOnly) {
    const capped = strategyDecision.actionCapped
      ? " The mission's configured action capped this rule at Notify."
      : "";
    return Object.freeze({
      state: "notified",
      product,
      url: "",
      entry: "none",
      reason: "notify-only",
      strategyDecision,
      note: `Signal strategy “${strategyDecision.strategy.name}” matched.${capped} Notification only; no store page was opened.`
    });
  }
  const orderLimit = Number(signal.orderLimit);
  if (Number.isInteger(orderLimit) && orderLimit > 0 && orderLimit < Number(product.quantity)) {
    return Object.freeze({
      state: "disabled",
      product,
      url: "",
      entry: "none",
      reason: "order-limit",
      strategyDecision,
      note: `The fresh signal limit of ${orderLimit} is below configured quantity ${product.quantity}; quantity was not changed and no page was opened.`
    });
  }

  const signalPrice = Number(signal.price);
  if (
    settings.signalsEnabled
    && Number.isFinite(signalPrice)
    && signalPrice > 0
    && signalPrice > product.maxPrice
  ) {
    return Object.freeze({
      state: "disabled",
      product,
      url: "",
      entry: "none",
      reason: "over-price",
      strategyDecision,
      note: `The signaled price of $${signalPrice.toFixed(2)} is above this mission's $${product.maxPrice.toFixed(2)} unit cap.`
    });
  }
  if (
    settings.signalsEnabled
    && product.retailer === "amazon"
    && signal.seller
    && !firstPartyAmazonSeller(signal.seller)
  ) {
    return Object.freeze({
      state: "disabled",
      product,
      url: "",
      entry: "none",
      reason: "seller-unverified",
      strategyDecision,
      note: "The Amazon signal named a non-Amazon seller, so Signals did not authorize a purchase attempt."
    });
  }

  let entry = "product";
  let url = product.productUrl;
  let note = strategyDecision.state === "matched"
    ? `Signal strategy “${strategyDecision.strategy.name}” matched; opening its verified product flow.`
    : "Desired product matched; opening its verified product flow.";
  const underCap = Number.isFinite(signalPrice) && signalPrice > 0 && signalPrice <= product.maxPrice;
  const directAllowed = Boolean(settings.automationEnabled || settings.signalsEnabled) && underCap;
  const amazonDirectAllowed = directAllowed && firstPartyAmazonSeller(signal.seller);
  const signalOrderLimit = positiveOrderLimit(signal);
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
  return Object.freeze({ state: "pending", product, url, entry, note, signalOrderLimit, strategyDecision });
}

module.exports = { SIGNAL_FRESH_MS, entryAllowedForProduct, firstPartyAmazonSeller, planSignalRoute, positiveOrderLimit };
