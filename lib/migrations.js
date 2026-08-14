"use strict";

function migrateStoredSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const products = Array.isArray(input.products) ? input.products : [];
  const unsafeProductCheckout = products.some((product) => {
    if (!product || product.enabled === false || product.action !== "checkout") return false;
    const maxPrice = Number(product.maxPrice);
    const quantity = Number(product.quantity ?? 1);
    const maxOrderTotal = Number(product.maxOrderTotal);
    return !Number.isFinite(maxOrderTotal)
      || maxOrderTotal <= 0
      || maxOrderTotal < maxPrice * quantity
      || !["shipping", "pickup"].includes(product.fulfillmentMode)
      || Number(product.checkoutEvidence?.version) !== 2;
  });
  const unsafeLegacyCheckout = !products.length && Boolean(input.productUrl) && Boolean(input.autoOpenCart);
  const unsafeCheckout = Boolean(input.automationEnabled) && (unsafeProductCheckout || unsafeLegacyCheckout);

  let next = unsafeCheckout ? { ...input, automationEnabled: false } : input;

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
