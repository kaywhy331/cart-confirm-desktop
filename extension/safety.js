"use strict";

(() => {
  const CART_PROOF_MAX_AGE_MS = 5 * 60_000;

  function effectiveLineOffer(product, line, proof = null, priceAnchor = null) {
    if (!line) return { ok: false, reason: "unmatched-product" };
    if (line.seller && line.firstParty !== true) {
      return { ok: false, reason: "third-party", seller: line.seller, firstParty: false };
    }

    const firstParty = line.firstParty === true || proof?.firstParty === true;
    const seller = line.seller || proof?.seller || "";
    if (!firstParty) return { ok: false, reason: seller ? "third-party" : "seller-unverified", seller, firstParty };

    let price = Number.isFinite(line.price) ? line.price : null;
    // The quantity-subtotal correction may use an aged price anchor: proving
    // the visible number equals a previously VERIFIED unit price times the
    // quantity (within 2¢) is pure arithmetic corroboration, so a price that
    // changed since verification breaks the match and still fails closed.
    // Seller/first-party backfill and the missing-price fallback stay bound
    // to the fresh proof above.
    const anchorUnitPrice = Number.isFinite(proof?.price)
      ? proof.price
      : Number.isFinite(priceAnchor?.price) ? priceAnchor.price : null;
    if (line.quantity > 1 && Number.isFinite(anchorUnitPrice) && price > product.maxPrice) {
      const expectedTotal = Math.round(anchorUnitPrice * line.quantity * 100) / 100;
      if (Math.abs(price - expectedTotal) <= 0.02) price = anchorUnitPrice;
    }
    if (price === null && Number.isFinite(proof?.price)) price = proof.price;
    if (!Number.isFinite(price)) return { ok: false, reason: "price-unavailable", seller, firstParty };
    if (price > product.maxPrice) return { ok: false, reason: "over-price", price, seller, firstParty };
    return { ok: true, price, seller, firstParty };
  }

  function verifySingleProductCart(product, inventory) {
    if (
      !inventory?.complete
      || inventory.independentlyCounted !== true
      || !Array.isArray(inventory.items)
      || !inventory.items.length
      || Number(inventory.independentLineCount) !== inventory.items.length
    ) {
      return { ok: false, reason: "cart-unverified" };
    }
    if (inventory.items.length !== 1 || inventory.items[0].sku !== product.sku) {
      return { ok: false, reason: "manual-action-required" };
    }
    return { ok: true };
  }

  function recentCartProof(product, proof, now = Date.now(), options = {}) {
    // A combined batch confirms each member while sibling member lines are
    // already in the cart, so its proofs legitimately carry more than one
    // line. Single-mission flows keep the strict one-line requirement.
    const maxLineCount = Number.isInteger(options.maxLineCount) && options.maxLineCount >= 1
      ? options.maxLineCount
      : 1;
    if (
      !proof
      || proof.productId !== product.id
      || proof.source !== "cart"
      || proof.quantityConfirmed !== true
      || proof.inventoryConfirmed !== true
      || !Number.isInteger(proof.cartLineCount)
      || proof.cartLineCount < 1
      || proof.cartLineCount > maxLineCount
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

  // Combined-order cart scope: the cart may hold exactly the mission's own
  // line plus lines belonging to other batch members — nothing else, and no
  // duplicates. Everything foreign still stops for manual review.
  function verifyMemberCart(product, inventory, memberSkus) {
    const allowed = new Set((memberSkus || []).map((sku) => String(sku)));
    allowed.add(String(product.sku));
    if (
      !inventory?.complete
      || inventory.independentlyCounted !== true
      || !Array.isArray(inventory.items)
      || !inventory.items.length
      || Number(inventory.independentLineCount) !== inventory.items.length
    ) {
      return { ok: false, reason: "cart-unverified" };
    }
    const skus = inventory.items.map((item) => String(item.sku));
    if (new Set(skus).size !== skus.length) return { ok: false, reason: "manual-action-required" };
    if (!skus.includes(String(product.sku))) return { ok: false, reason: "manual-action-required" };
    if (skus.some((sku) => !allowed.has(sku))) return { ok: false, reason: "manual-action-required" };
    return { ok: true };
  }

  // Combined final review: every carted member's line must be present at its
  // exact quantity with a fresh member proof proving first-party under its
  // unit cap, the cart must contain exactly the member set, and the combined
  // total must stay under the sum of the included missions' caps.
  function combinedCheckoutSafety(input) {
    const { members, inventory, lines, proofs, orderTotal, combinedMaxTotal, now } = input;
    if (Array.isArray(input.unsafeChoices) && input.unsafeChoices.length) {
      return { ok: false, reason: "manual-action-required" };
    }
    if (input.fulfillmentMode !== input.requiredFulfillmentMode) {
      return { ok: false, reason: "fulfillment-unverified" };
    }
    if (!Array.isArray(members) || !members.length) return { ok: false, reason: "cart-unverified" };
    if (
      !inventory?.complete
      || inventory.independentlyCounted !== true
      || !Array.isArray(inventory.items)
      || inventory.items.length !== members.length
    ) {
      return { ok: false, reason: "cart-unverified" };
    }
    const cartSkus = inventory.items.map((item) => String(item.sku)).sort();
    const memberSkus = members.map((member) => String(member.sku)).sort();
    if (cartSkus.join("|") !== memberSkus.join("|") || new Set(cartSkus).size !== cartSkus.length) {
      return { ok: false, reason: "manual-action-required" };
    }
    const prices = {};
    for (const member of members) {
      const line = lines?.[member.id];
      if (!line) return { ok: false, reason: "unmatched-product", memberId: member.id };
      const proof = recentCartProof(member, proofs?.[member.id], now, { maxLineCount: members.length });
      if (!proof) return { ok: false, reason: "cart-unverified", memberId: member.id };
      const offer = effectiveLineOffer(member, line, proof);
      if (!offer.ok) return { ...offer, memberId: member.id };
      if (line.quantity !== null && line.quantity !== undefined && line.quantity !== member.quantity) {
        return { ok: false, reason: "quantity-unavailable", memberId: member.id };
      }
      if ((line.quantity === null || line.quantity === undefined) && proof.quantityConfirmed !== true) {
        return { ok: false, reason: "quantity-unavailable", memberId: member.id };
      }
      prices[member.id] = offer.price;
    }
    if (orderTotal === null || orderTotal === undefined || !Number.isFinite(orderTotal)) {
      return { ok: false, reason: "total-unavailable" };
    }
    if (!Number.isFinite(combinedMaxTotal) || combinedMaxTotal <= 0 || orderTotal > combinedMaxTotal) {
      return { ok: false, reason: "over-total", orderTotal };
    }
    return { ok: true, orderTotal, prices };
  }

  const api = Object.freeze({
    CART_PROOF_MAX_AGE_MS,
    checkoutSafety,
    combinedCheckoutSafety,
    effectiveLineOffer,
    recentCartProof,
    verifyMemberCart,
    verifySingleProductCart
  });

  globalThis.CartConfirmSafety = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
