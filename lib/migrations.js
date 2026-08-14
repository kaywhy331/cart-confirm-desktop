"use strict";

const {
  calculateOrderTotalCap,
  DEFAULT_STORE_ORDER_ALLOWANCES,
  normalizeOrderTaxPercent,
  normalizeStoreOrderAllowances
} = require("./item-defaults");

const LEGACY_DEFAULT_STORE_ALLOWANCE = 15;

function migrateStoreOrderAllowances(input) {
  const normalized = normalizeStoreOrderAllowances(input?.storeOrderAllowances);
  if (input?.orderTaxPercent !== undefined && input?.orderTaxPercent !== null) return normalized;
  const source = input?.storeOrderAllowances;
  if (!source || typeof source !== "object" || Array.isArray(source)) return normalized;
  return Object.fromEntries(Object.keys(DEFAULT_STORE_ORDER_ALLOWANCES).map((retailer) => [
    retailer,
    Number(source[retailer]) === LEGACY_DEFAULT_STORE_ALLOWANCE
      ? DEFAULT_STORE_ORDER_ALLOWANCES[retailer]
      : normalized[retailer]
  ]));
}

function migrateStoredSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const storeOrderAllowances = migrateStoreOrderAllowances(input);
  const orderTaxPercent = normalizeOrderTaxPercent(input.orderTaxPercent);
  const products = (Array.isArray(input.products) ? input.products : []).map((product) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return product;
    const maxOrderTotal = calculateOrderTotalCap(product, storeOrderAllowances, orderTaxPercent);
    if (Number(product.maxOrderTotal) === maxOrderTotal) return product;
    return {
      ...product,
      maxOrderTotal,
      // An optional checkout approval remains bound to the exact cap under
      // which it was captured. A live verified checkout does not require one.
      ...(product.checkoutEvidence ? { checkoutEvidence: null } : {})
    };
  });
  const unsafeProductCheckout = products.some((product) => {
    if (!product || product.enabled === false || product.action !== "checkout") return false;
    return !["shipping", "pickup"].includes(product.fulfillmentMode);
  });
  const unsafeLegacyCheckout = !products.length && Boolean(input.productUrl) && Boolean(input.autoOpenCart);
  const unsafeCheckout = Boolean(input.automationEnabled) && (unsafeProductCheckout || unsafeLegacyCheckout);

  let next = {
    ...input,
    orderTaxPercent,
    storeOrderAllowances,
    ...(Array.isArray(input.products) ? { products } : {}),
    ...(unsafeCheckout ? { automationEnabled: false } : {})
  };

  // The single global schedule became per-product openAt times: carry the old
  // schedule onto the enabled products of its store, then retire it.
  if (next.scheduledOpenEnabled && next.scheduledOpenAt && Array.isArray(next.products)) {
    const retailer = String(next.scheduledRetailer || "").toLowerCase();
    next = {
      ...next,
      scheduledOpenEnabled: false,
      products: next.products.map((product) => (
        product && product.enabled !== false && product.retailer === retailer && !product.openAt
          ? { ...product, openAt: next.scheduledOpenAt }
          : product
      ))
    };
  }

  return next;
}

module.exports = { migrateStoredSettings };
