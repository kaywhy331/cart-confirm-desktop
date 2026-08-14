"use strict";

const {
  calculateOrderTotalCap,
  normalizeStoreOrderAllowances
} = require("./item-defaults");

function migrateStoredSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const storeOrderAllowances = normalizeStoreOrderAllowances(input.storeOrderAllowances);
  const products = (Array.isArray(input.products) ? input.products : []).map((product) => {
    if (!product || typeof product !== "object" || Array.isArray(product)) return product;
    const maxOrderTotal = calculateOrderTotalCap(product, storeOrderAllowances);
    if (Number(product.maxOrderTotal) === maxOrderTotal) return product;
    return {
      ...product,
      maxOrderTotal,
      // A checkout approval is bound to its old cap. Require a fresh visible
      // preflight after converting legacy per-item caps to store allowances.
      ...(product.checkoutEvidence ? { checkoutEvidence: null } : {})
    };
  });
  const unsafeProductCheckout = products.some((product) => {
    if (!product || product.enabled === false || product.action !== "checkout") return false;
    return !["shipping", "pickup"].includes(product.fulfillmentMode)
      || Number(product.checkoutEvidence?.version) !== 2;
  });
  const unsafeLegacyCheckout = !products.length && Boolean(input.productUrl) && Boolean(input.autoOpenCart);
  const unsafeCheckout = Boolean(input.automationEnabled) && (unsafeProductCheckout || unsafeLegacyCheckout);

  let next = {
    ...input,
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
