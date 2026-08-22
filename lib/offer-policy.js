"use strict";

(() => {
  function cleanSeller(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function normalizeSellerIdentity(value) {
    return cleanSeller(value)
      .toLocaleLowerCase("en-US")
      .replace(/^(?:sold\s+(?:and\s+shipped\s+)?by|seller\s*:?|merchant\s*:?)\s*/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeBinding(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const maximumPrice = Number(input.maximumPrice);
    if (!Number.isFinite(maximumPrice) || maximumPrice <= 0 || maximumPrice > 1_000_000) return null;
    return {
      maximumPrice: Math.round(maximumPrice * 100) / 100,
      seller: cleanSeller(input.seller),
      firstParty: typeof input.firstParty === "boolean" ? input.firstParty : null,
      allowThirdPartySeller: input.allowThirdPartySeller === true
    };
  }

  function bindingForProduct(product = {}) {
    return normalizeBinding(product.signalOffer);
  }

  function maximumPriceForProduct(product = {}) {
    const missionMaximum = Number(product.maxPrice);
    const binding = bindingForProduct(product);
    if (!Number.isFinite(missionMaximum) || missionMaximum <= 0) return null;
    return binding ? Math.min(missionMaximum, binding.maximumPrice) : missionMaximum;
  }

  function validateSeller(product, offer, binding = bindingForProduct(product)) {
    const seller = cleanSeller(offer?.seller);
    const firstParty = offer?.firstParty === true;
    if (!binding) {
      return firstParty
        ? { ok: true, seller, firstParty }
        : { ok: false, reason: seller ? "third-party" : "seller-unverified", seller, firstParty };
    }

    if (binding.firstParty !== null && binding.firstParty !== firstParty) {
      return { ok: false, reason: "signal-seller-mismatch", seller, firstParty };
    }
    if (!firstParty && !binding.allowThirdPartySeller) {
      return { ok: false, reason: seller ? "third-party" : "seller-unverified", seller, firstParty };
    }
    if (!firstParty && !seller) {
      return { ok: false, reason: "seller-unverified", seller, firstParty };
    }

    // First-party identity is already retailer-bound by the adapter. Named
    // marketplace sellers require a strict normalized identity match so a
    // different merchant cannot inherit another seller's signal.
    if (binding.seller && binding.firstParty !== true) {
      const expected = normalizeSellerIdentity(binding.seller);
      const actual = normalizeSellerIdentity(seller);
      if (!actual) return { ok: false, reason: "seller-unverified", seller, firstParty };
      if (!expected || actual !== expected) {
        return { ok: false, reason: "signal-seller-mismatch", seller, firstParty };
      }
    }
    return { ok: true, seller, firstParty };
  }

  function validateOffer(product = {}, offer = {}) {
    if (offer.available !== true) return { ok: false, reason: "out-of-stock" };
    // Verify the seller before price so an offer with no live seller proof
    // cannot be diagnosed (or treated) as merely a transient price read.
    const binding = bindingForProduct(product);
    const seller = validateSeller(product, offer, binding);
    if (!seller.ok) return seller;
    const price = Number(offer.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, reason: "price-unavailable" };
    }
    const normalizedPrice = Math.round(price * 100) / 100;
    const missionMaximum = Number(product.maxPrice);
    if (!Number.isFinite(missionMaximum) || missionMaximum <= 0 || normalizedPrice > missionMaximum + 0.005) {
      return { ok: false, reason: "over-price", price: normalizedPrice };
    }
    if (binding && normalizedPrice > binding.maximumPrice + 0.005) {
      return { ok: false, reason: "signal-price-mismatch", price: normalizedPrice };
    }
    return { ok: true, reason: "eligible", price: normalizedPrice, seller: seller.seller, firstParty: seller.firstParty };
  }

  const api = Object.freeze({
    bindingForProduct,
    cleanSeller,
    maximumPriceForProduct,
    normalizeBinding,
    normalizeSellerIdentity,
    validateOffer,
    validateSeller
  });

  globalThis.CartConfirmOfferPolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
