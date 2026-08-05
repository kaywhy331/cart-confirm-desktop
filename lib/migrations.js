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
      || maxOrderTotal < maxPrice * quantity;
  });
  const unsafeLegacyCheckout = !products.length && Boolean(input.productUrl) && Boolean(input.autoOpenCart);
  const unsafeCheckout = Boolean(input.automationEnabled) && (unsafeProductCheckout || unsafeLegacyCheckout);

  return unsafeCheckout ? { ...input, automationEnabled: false } : input;
}

module.exports = { migrateStoredSettings };
