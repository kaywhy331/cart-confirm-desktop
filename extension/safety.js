"use strict";

(() => {
  const CART_PROOF_MAX_AGE_MS = 5 * 60_000;

  function effectiveLineOffer(product, line, proof = null) {
    if (!line) return { ok: false, reason: "unmatched-product" };
    if (line.seller && line.firstParty !== true) {
      return { ok: false, reason: "third-party", seller: line.seller, firstParty: false };
    }

    const firstParty = line.firstParty === true || proof?.firstParty === true;
    const seller = line.seller || proof?.seller || "";
    if (!firstParty) return { ok: false, reason: seller ? "third-party" : "seller-unverified", seller, firstParty };

    let price = Number.isFinite(line.price) ? line.price : null;
    if (line.quantity > 1 && Number.isFinite(proof?.price) && price > product.maxPrice) {
      const expectedTotal = Math.round(proof.price * line.quantity * 100) / 100;
      if (Math.abs(price - expectedTotal) <= 0.02) price = proof.price;
    }
    if (price === null && Number.isFinite(proof?.price)) price = proof.price;
    if (!Number.isFinite(price)) return { ok: false, reason: "price-unavailable", seller, firstParty };
    if (price > product.maxPrice) return { ok: false, reason: "over-price", price, seller, firstParty };
    return { ok: true, price, seller, firstParty };
  }

  function verifySingleProductCart(product, inventory) {
    if (!inventory?.complete || !Array.isArray(inventory.items) || !inventory.items.length) {
      return { ok: false, reason: "cart-unverified" };
    }
    if (inventory.items.length !== 1 || inventory.items[0].sku !== product.sku) {
      return { ok: false, reason: "manual-action-required" };
    }
    return { ok: true };
  }

  function recentCartProof(product, proof, now = Date.now()) {
    if (
      !proof
      || proof.productId !== product.id
      || proof.source !== "cart"
      || proof.quantityConfirmed !== true
      || proof.inventoryConfirmed !== true
      || proof.cartLineCount !== 1
      || proof.cartSku !== product.sku
      || proof.firstParty !== true
      || !Number.isFinite(proof.price)
      || !Number.isFinite(proof.cartConfirmedAt)
      || now - proof.cartConfirmedAt < 0
      || now - proof.cartConfirmedAt > CART_PROOF_MAX_AGE_MS
    ) return null;
    return proof;
  }

  function checkoutSafety(input) {
    const { product, inventory, line, orderTotal } = input;
    if (product.action === "checkout" && Array.isArray(input.unsafeChoices) && input.unsafeChoices.length) {
      return { ok: false, reason: "manual-action-required" };
    }
    if (product.action === "checkout" && input.fulfillmentMode !== product.fulfillmentMode) {
      return { ok: false, reason: "fulfillment-unverified" };
    }
    const cart = verifySingleProductCart(product, inventory);
    if (!cart.ok) return cart;

    const proof = recentCartProof(product, input.proof, input.now);
    if (!proof) return { ok: false, reason: "cart-unverified" };

    const offer = effectiveLineOffer(product, line, proof);
    if (!offer.ok) return offer;
    if (line?.quantity !== null && line?.quantity !== undefined && line.quantity !== product.quantity) {
      return { ...offer, ok: false, reason: "quantity-unavailable" };
    }
    if ((line?.quantity === null || line?.quantity === undefined) && proof.quantityConfirmed !== true) {
      return { ...offer, ok: false, reason: "quantity-unavailable" };
    }
    if (orderTotal === null || orderTotal === undefined || !Number.isFinite(orderTotal)) {
      return { ...offer, ok: false, reason: "total-unavailable" };
    }
    if (orderTotal > product.maxOrderTotal) {
      return { ...offer, ok: false, reason: "over-total", orderTotal };
    }
    return { ...offer, ok: true, orderTotal };
  }

  const api = Object.freeze({
    CART_PROOF_MAX_AGE_MS,
    checkoutSafety,
    effectiveLineOffer,
    recentCartProof,
    verifySingleProductCart
  });

  globalThis.CartConfirmSafety = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
