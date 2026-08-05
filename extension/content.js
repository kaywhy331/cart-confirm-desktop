"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers;
  if (!Retailers) return;

  const ACTIVE_PRODUCT_KEY = "cartConfirmActiveProductId";
  const PROOF_KEY = "cartConfirmVerifiedOffer";
  const ATTEMPT_PREFIX = "cartConfirmAttempts:";
  const SUBMITTED_PREFIX = "cartConfirmSubmittedAt:";
  const CONFIG_REFRESH_MS = 5_000;
  const HEARTBEAT_MS = 10_000;
  const PROOF_MAX_AGE_MS = 20 * 60_000;
  const SUBMIT_SETTLE_MS = 30_000;
  const seen = new Map();
  let config = null;
  let configFingerprint = "";
  let scanTimer = null;
  let retryTimer = null;
  let scanning = false;

  const retailer = Retailers.detectRetailer(location.href);
  const adapter = Retailers.getAdapter(retailer);
  if (!adapter) return;

  const pageAddress = () => `${location.origin}${location.pathname}`;
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function runtimeMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, reason: "extension-error" });
          else resolve(response || { ok: false });
        });
      } catch {
        resolve({ ok: false, reason: "extension-error" });
      }
    });
  }

  function pruneSeen() {
    if (seen.size < 500) return;
    const cutoff = Date.now() - 30 * 60_000;
    for (const [key, timestamp] of seen) {
      if (timestamp < cutoff) seen.delete(key);
    }
    if (seen.size >= 500) {
      for (const key of [...seen.keys()].slice(0, seen.size - 350)) seen.delete(key);
    }
  }

  function send(eventType, product, details = {}, dedupeKey = "", dedupeMs = 1_500) {
    const key = dedupeKey || `${product?.id || "global"}:${eventType}:${JSON.stringify(details)}`;
    const previous = seen.get(key) || 0;
    if (Date.now() - previous < dedupeMs) return Promise.resolve({ ok: true, deduped: true });
    seen.set(key, Date.now());
    pruneSeen();

    return runtimeMessage({
      type: "CART_CONFIRM_EVENT",
      payload: {
        eventType,
        productId: product?.id || "",
        retailer: product?.retailer || retailer,
        sku: product?.sku || "",
        page: pageAddress(),
        timestamp: new Date().toISOString(),
        ...details
      }
    });
  }

  async function requestConfig(force = false) {
    const response = await runtimeMessage({ type: "CART_CONFIRM_GET_CONFIG", force });
    return response.ok ? response.config : null;
  }

  function storeProducts() {
    return (config?.products || []).filter((product) => product.retailer === retailer);
  }

  function activeProduct() {
    const direct = storeProducts().find((product) => adapter.productMatches(product, location.href));
    if (direct) return direct;
    const activeId = sessionStorage.getItem(ACTIVE_PRODUCT_KEY);
    return storeProducts().find((product) => product.id === activeId) || null;
  }

  function setActiveProduct(product) {
    sessionStorage.setItem(ACTIVE_PRODUCT_KEY, product.id);
  }

  function clearActiveProduct(product) {
    if (sessionStorage.getItem(ACTIVE_PRODUCT_KEY) === product.id) {
      sessionStorage.removeItem(ACTIVE_PRODUCT_KEY);
      sessionStorage.removeItem(PROOF_KEY);
    }
  }

  function proofFor(product) {
    try {
      const proof = JSON.parse(sessionStorage.getItem(PROOF_KEY) || "null");
      if (
        !proof
        || proof.productId !== product.id
        || proof.runId !== config?.automationRunId
        || Date.now() - proof.verifiedAt > PROOF_MAX_AGE_MS
      ) return null;
      return proof;
    } catch {
      return null;
    }
  }

  function saveProof(product, offer, quantityConfirmed = false) {
    const existing = proofFor(product);
    const proof = {
      productId: product.id,
      runId: config?.automationRunId || "",
      price: Number.isFinite(offer?.price) ? offer.price : existing?.price,
      seller: offer?.seller || existing?.seller || "",
      firstParty: offer?.firstParty === true || existing?.firstParty === true,
      quantityConfirmed: quantityConfirmed || existing?.quantityConfirmed === true,
      verifiedAt: Date.now()
    };
    sessionStorage.setItem(PROOF_KEY, JSON.stringify(proof));
    return proof;
  }

  function attemptKey(product) {
    return `${ATTEMPT_PREFIX}${config?.automationRunId || "run"}:${product.id}`;
  }

  function nextAttempt(product) {
    const key = attemptKey(product);
    const next = Math.min(1_000_000, Number(sessionStorage.getItem(key) || 0) + 1);
    sessionStorage.setItem(key, String(next));
    return next;
  }

  function currentAttempt(product) {
    return Number(sessionStorage.getItem(attemptKey(product)) || 0);
  }

  function submittedKey(product) {
    return `${SUBMITTED_PREFIX}${config?.automationRunId || "run"}:${product.id}`;
  }

  function clearRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  async function productAutomationState(product) {
    return runtimeMessage({ type: "CART_CONFIRM_PRODUCT_STATE", productId: product.id });
  }

  async function claimProduct(product) {
    return runtimeMessage({ type: "CART_CONFIRM_CLAIM_PRODUCT", productId: product.id });
  }

  async function completeProduct(product) {
    clearRetry();
    const result = await runtimeMessage({ type: "CART_CONFIRM_COMPLETE_PRODUCT", productId: product.id });
    clearActiveProduct(product);
    return result;
  }

  function eligibility(product, offer) {
    if (!offer.available) return { eligible: false, reason: "out-of-stock" };
    if (offer.price === null || offer.price === undefined) return { eligible: false, reason: "price-unavailable" };
    if (offer.firstParty !== true) {
      return { eligible: false, reason: offer.seller ? "third-party" : "seller-unverified" };
    }
    if (offer.price > product.maxPrice) return { eligible: false, reason: "over-price" };
    return { eligible: true, reason: "eligible" };
  }

  function effectiveLineOffer(product, line) {
    if (!line) return { ok: false, reason: "unmatched-product" };
    const proof = proofFor(product);
    if (line.seller && line.firstParty !== true) return { ok: false, reason: "third-party" };
    const firstParty = line.firstParty === true || proof?.firstParty === true;
    const seller = line.seller || proof?.seller || "";
    if (!firstParty) return { ok: false, reason: seller ? "third-party" : "seller-unverified" };

    let price = line.price;
    if (line.quantity > 1 && proof?.price && price > product.maxPrice) {
      const expectedTotal = Math.round(proof.price * line.quantity * 100) / 100;
      if (Math.abs(price - expectedTotal) <= 0.02) price = proof.price;
    }
    if (price === null || price === undefined) price = proof?.price;
    if (price === null || price === undefined) return { ok: false, reason: "price-unavailable" };
    if (price > product.maxPrice) return { ok: false, reason: "over-price", price, seller, firstParty };
    return { ok: true, price, seller, firstParty, proof };
  }

  function extraCartItems(product) {
    const ids = adapter.cartProductIds(document);
    return ids.filter((sku) => sku !== product.sku);
  }

  async function scheduleRetry(product, message, destination = "reload", errorBackoff = false) {
    if (!config?.automationEnabled || !product.enabled || retryTimer) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed || !state.armed) return;

    const attempt = nextAttempt(product);
    const baseSeconds = Math.max(5, Number(config.retryIntervalSeconds || 15));
    const multiplier = errorBackoff ? Math.min(8, 2 ** Math.min(3, Math.floor((attempt - 1) / 3))) : Math.min(3, 1 + Math.floor(attempt / 20));
    const jitter = Math.floor(Math.random() * Math.max(1, baseSeconds * 0.2));
    const delayMs = (baseSeconds * multiplier + jitter) * 1000;
    await send("retry-scheduled", product, {
      attempt,
      reason: "retrying",
      message
    }, `retry:${product.id}:${attempt}`, 0);

    retryTimer = setTimeout(async () => {
      retryTimer = null;
      const nextConfig = await requestConfig(true);
      if (!nextConfig?.automationEnabled) return;
      config = nextConfig;
      const nextState = await productAutomationState(product);
      if (!nextState.ok || nextState.completed || adapter.securityChallenge(document)) return;
      if (destination === "product") location.assign(product.productUrl);
      else if (destination === "cart") location.assign(adapter.cartUrl);
      else location.reload();
    }, delayMs);
  }

  async function clickAction(element) {
    if (!Retailers.isActionable(element)) return false;
    element.scrollIntoView?.({ block: "center", inline: "nearest" });
    element.focus?.({ preventScroll: true });
    await sleep(180);
    if (!Retailers.isActionable(element) || adapter.securityChallenge(document)) return false;
    element.click();
    return true;
  }

  function setNativeValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function ensureQuantity(product, line) {
    const desired = product.quantity;
    if (line.quantity === desired) return { ok: true };
    const { select, input, increase, decrease } = line.controls || {};

    if (select) {
      const option = [...select.options].find((candidate) => Number.parseInt(candidate.value || candidate.textContent, 10) === desired);
      if (!option) return { ok: false, reason: "quantity-unavailable" };
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(900);
      return { ok: Number.parseInt(select.value, 10) === desired, pending: true, reason: "quantity-unavailable" };
    }

    if (input) {
      setNativeValue(input, String(desired));
      input.blur?.();
      await sleep(900);
      return { ok: Number.parseInt(input.value, 10) === desired, pending: true, reason: "quantity-unavailable" };
    }

    if (Number.isInteger(line.quantity) && line.quantity < desired && increase) {
      await clickAction(increase);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }
    if (Number.isInteger(line.quantity) && line.quantity > desired && decrease) {
      await clickAction(decrease);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }
    return { ok: false, reason: "quantity-unavailable" };
  }

  async function handleChallenge(product) {
    if (!adapter.securityChallenge(document)) return false;
    clearRetry();
    await runtimeMessage({ type: "CART_CONFIRM_SECURITY_CHALLENGE" });
    if (product) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "A store security challenge needs manual completion. Fast-load blocking is paused for ten minutes."
      }, `challenge:${product.id}:${pageAddress()}`, 30_000);
    }
    return true;
  }

  async function handleConfirmation(product) {
    if (!adapter.orderConfirmed(document)) return false;
    await send("order-confirmed", product, {
      attempt: currentAttempt(product)
    }, `order-confirmed:${product.id}`, Number.MAX_SAFE_INTEGER);
    await completeProduct(product);
    return true;
  }

  async function handleProductPage(product) {
    const offer = adapter.offer(document, product);
    const result = eligibility(product, offer);
    await send("availability", product, {
      availability: offer.available ? "available" : "unavailable"
    }, `availability:${product.id}:${offer.available}`, 10_000);
    await send("offer-observed", product, {
      availability: offer.available ? "available" : "unavailable",
      price: offer.price === null ? undefined : offer.price,
      seller: offer.seller,
      firstParty: offer.firstParty,
      eligible: result.eligible,
      reason: result.reason,
      attempt: currentAttempt(product)
    }, `offer:${product.id}:${offer.price}:${offer.seller}:${result.reason}`, 10_000);

    if (!config.automationEnabled || !product.enabled) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed) return;

    if (!result.eligible) {
      if (result.reason !== "out-of-stock") {
        await send("automation-blocked", product, {
          price: offer.price === null ? undefined : offer.price,
          seller: offer.seller,
          firstParty: offer.firstParty,
          eligible: false,
          reason: result.reason,
          message: result.reason === "over-price"
            ? `Observed unit price is above the $${product.maxPrice.toFixed(2)} cap.`
            : "The offer does not have a verifiable first-party seller and readable eligible price."
        }, `blocked:${product.id}:${result.reason}:${offer.price}:${offer.seller}`, 30_000);
      }
      await scheduleRetry(product, `Waiting for an eligible ${adapter.label} first-party offer.`);
      return;
    }

    const claim = await claimProduct(product);
    if (!claim.ok) {
      if (claim.reason !== "completed") {
        await scheduleRetry(product, claim.reason === "store-busy"
          ? `${adapter.label} checkout is busy with another configured product.`
          : "Another tab is already processing this configured product.");
      }
      return;
    }

    setActiveProduct(product);
    saveProof(product, offer);
    const attempt = nextAttempt(product);
    const clicked = await clickAction(offer.addButton);
    if (!clicked) {
      await send("store-error", product, {
        attempt,
        reason: "store-error",
        message: "The eligible Add to cart control was no longer actionable."
      }, `add-failed:${product.id}:${attempt}`, 0);
      await scheduleRetry(product, "Add to cart changed before it could be selected.", "reload", true);
      return;
    }

    await send("add-clicked", product, {
      attempt,
      price: offer.price,
      seller: offer.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `add-clicked:${product.id}:${attempt}`, 0);
    await sleep(2_200);
    if (await handleChallenge(product)) return;
    location.assign(adapter.cartUrl);
  }

  async function handleCartPage(product) {
    const error = adapter.storeError(document);
    if (error) {
      await send("store-error", product, {
        attempt: currentAttempt(product),
        reason: error,
        message: error === "out-of-stock"
          ? "The store reports that the item became unavailable in the cart."
          : "The store reported a cart error."
      }, `cart-error:${product.id}:${error}:${currentAttempt(product)}`, 5_000);
      if (config.automationEnabled) {
        await scheduleRetry(product, "Returning to the product after a cart error.", error === "out-of-stock" ? "product" : "reload", true);
      }
      return;
    }

    const line = adapter.findLine(document, product);
    if (!line) {
      await send("automation-blocked", product, {
        reason: "unmatched-product",
        message: "The exact configured SKU is not yet visible as a cart line item."
      }, `missing-cart-line:${product.id}`, 10_000);
      if (config.automationEnabled) await scheduleRetry(product, "The exact cart line was not found; returning to the product.", "product");
      return;
    }

    const safeLine = effectiveLineOffer(product, line);
    if (!safeLine.ok) {
      await send("automation-blocked", product, {
        price: safeLine.price,
        seller: safeLine.seller,
        firstParty: safeLine.firstParty,
        eligible: false,
        reason: safeLine.reason,
        message: "The cart line failed the first-party seller or unit-price safety check. Manual review is required."
      }, `unsafe-cart-line:${product.id}:${safeLine.reason}`, 30_000);
      return;
    }

    const quantity = await ensureQuantity(product, line);
    if (!quantity.ok) {
      if (quantity.pending) {
        scheduleScan(1_200);
        return;
      }
      await send("automation-blocked", product, {
        price: safeLine.price,
        seller: safeLine.seller,
        firstParty: true,
        eligible: false,
        reason: "quantity-unavailable",
        message: `The cart cannot verify quantity ${product.quantity}.`
      }, `quantity-blocked:${product.id}:${product.quantity}`, 15_000);
      return;
    }

    saveProof(product, safeLine, true);
    await send("quantity-updated", product, {
      quantity: product.quantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `quantity-confirmed:${product.id}:${product.quantity}`, 10_000);
    await send("cart-item-confirmed", product, {
      quantity: product.quantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `cart-confirmed:${product.id}:${product.quantity}`, 10_000);

    if (!config.automationEnabled) return;
    if (product.action === "cart") {
      await completeProduct(product);
      return;
    }

    if (extraCartItems(product).length) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "Checkout stopped because this store cart contains another product. Remove or purchase it manually first."
      }, `extra-cart-items:${product.id}`, 30_000);
      return;
    }

    const claim = await claimProduct(product);
    if (!claim.ok) return;
    const checkoutButton = adapter.checkoutButton(document);
    if (!checkoutButton) {
      await scheduleRetry(product, "Waiting for the store checkout control.", "reload", true);
      return;
    }
    const attempt = nextAttempt(product);
    if (await clickAction(checkoutButton)) {
      await send("checkout-clicked", product, { attempt }, `checkout-clicked:${product.id}:${attempt}`, 0);
    } else {
      await scheduleRetry(product, "Checkout was not actionable.", "reload", true);
    }
  }

  async function handleCheckoutPage(product) {
    await send("checkout-reached", product, {
      attempt: currentAttempt(product)
    }, `checkout-reached:${product.id}:${pageAddress()}`, 10_000);

    if (!config.automationEnabled || product.action !== "checkout") return;
    const claim = await claimProduct(product);
    if (!claim.ok) return;

    const error = adapter.storeError(document);
    if (error) {
      sessionStorage.removeItem(submittedKey(product));
      await send("store-error", product, {
        attempt: currentAttempt(product),
        reason: error,
        message: error === "out-of-stock"
          ? "The item became unavailable during checkout."
          : "The store returned a checkout error."
      }, `checkout-error:${product.id}:${error}:${currentAttempt(product)}`, 5_000);
      await scheduleRetry(product, "Retrying after an explicit checkout error.", error === "out-of-stock" ? "product" : "reload", true);
      return;
    }

    const line = adapter.findLine(document, product);
    const safeLine = effectiveLineOffer(product, line);
    const proof = proofFor(product);
    if (!safeLine.ok || (!line?.quantity && !proof?.quantityConfirmed) || (line?.quantity && line.quantity !== product.quantity)) {
      await send("automation-blocked", product, {
        price: safeLine.price,
        seller: safeLine.seller,
        firstParty: safeLine.firstParty,
        eligible: false,
        reason: safeLine.ok ? "quantity-unavailable" : safeLine.reason,
        message: "Final order review could not re-verify the exact SKU, first-party offer, unit cap, and quantity."
      }, `review-blocked:${product.id}:${safeLine.reason || "quantity"}`, 20_000);
      return;
    }

    const submittedAt = Number(sessionStorage.getItem(submittedKey(product)) || 0);
    if (submittedAt && Date.now() - submittedAt < SUBMIT_SETTLE_MS) return;
    if (submittedAt) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "Order submission was sent but no confirmation or explicit failure appeared. Automatic resubmission is paused to prevent a duplicate order."
      }, `submit-uncertain:${product.id}:${submittedAt}`, 60_000);
      return;
    }

    const submitButton = adapter.submitButton(document);
    if (!submitButton) {
      scheduleScan(1_500);
      return;
    }

    const attempt = nextAttempt(product);
    sessionStorage.setItem(submittedKey(product), String(Date.now()));
    if (await clickAction(submitButton)) {
      await send("order-submit-clicked", product, {
        attempt,
        quantity: product.quantity,
        price: safeLine.price,
        seller: safeLine.seller,
        firstParty: true,
        eligible: true,
        reason: "eligible"
      }, `order-submit:${product.id}:${attempt}`, 0);
      scheduleScan(2_000);
    } else {
      sessionStorage.removeItem(submittedKey(product));
      await scheduleRetry(product, "The final order control was not actionable.", "reload", true);
    }
  }

  async function scan() {
    if (scanning || !config) return;
    scanning = true;
    try {
      const product = activeProduct();
      if (await handleChallenge(product)) return;
      if (!product) return;

      await send("page-observed", product, {}, `page:${product.id}:${pageAddress()}`, 30_000);
      const kind = adapter.pageKind(location.href);
      if (["checkout", "confirmation"].includes(kind) && await handleConfirmation(product)) return;
      if (kind === "product") await handleProductPage(product);
      else if (kind === "cart") await handleCartPage(product);
      else if (kind === "checkout" || kind === "confirmation") await handleCheckoutPage(product);
    } finally {
      scanning = false;
    }
  }

  function scheduleScan(delay = 350) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => void scan(), delay);
  }

  async function refreshConfig(force = false) {
    const next = await requestConfig(force);
    if (!next) return;
    const fingerprint = JSON.stringify({
      run: next.automationRunId,
      armed: next.automationEnabled,
      version: next.configVersion,
      products: next.products
    });
    const changed = fingerprint !== configFingerprint;
    config = next;
    configFingerprint = fingerprint;
    if (changed) {
      seen.clear();
      if (!config.automationEnabled) clearRetry();
    }
    scheduleScan(0);
  }

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target.closest("button, input, a[role='button']") : null;
    const product = activeProduct();
    if (!target || !product) return;
    const label = `${target.getAttribute("aria-label") || ""} ${target.getAttribute("value") || ""} ${Retailers.textOf(target)}`;
    if (/add to cart/i.test(label)) {
      setActiveProduct(product);
      void send("add-clicked", product, { attempt: currentAttempt(product) }, `manual-add:${product.id}:${Date.now()}`, 0);
    } else if (/proceed to checkout|continue to checkout|check\s*out/i.test(label)) {
      void send("checkout-clicked", product, { attempt: currentAttempt(product) }, `manual-checkout:${product.id}:${Date.now()}`, 0);
    }
  }, true);

  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "aria-label", "href", "value"]
  });

  void refreshConfig(true);
  setInterval(() => void refreshConfig(false), CONFIG_REFRESH_MS);
  setInterval(() => {
    const product = activeProduct();
    void send("heartbeat", product, {}, `heartbeat:${Date.now()}`, 0);
    if (!config) void refreshConfig(true);
  }, HEARTBEAT_MS);
})();
