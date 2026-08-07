"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers;
  const Safety = globalThis.CartConfirmSafety;
  if (!Retailers || !Safety) return;

  const ACTIVE_PRODUCT_KEY = "cartConfirmActiveProductId";
  const CONFIG_REFRESH_MS = 5_000;
  const HEARTBEAT_MS = 10_000;
  const PROOF_MAX_AGE_MS = Safety.CART_PROOF_MAX_AGE_MS;
  const seen = new Map();
  const attemptCache = new Map();
  const quantityRechecks = new Map();
  const QUANTITY_RECHECK_LIMIT = 8;
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

  async function send(eventType, product, details = {}, dedupeKey = "", dedupeMs = 1_500) {
    const key = dedupeKey || `${product?.id || "global"}:${eventType}:${JSON.stringify(details)}`;
    const previous = seen.get(key) || 0;
    if (Date.now() - previous < dedupeMs) return { ok: true, deduped: true };

    const result = await runtimeMessage({
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
    if (result.ok) {
      seen.set(key, Date.now());
      pruneSeen();
    }
    return result;
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
    }
  }

  async function proofFor(product) {
    const state = await productAutomationState(product);
    const proof = state.ok ? state.proof : null;
    if (
      !proof
      || proof.productId !== product.id
      || proof.runId !== config?.automationRunId
      || Date.now() - proof.verifiedAt > PROOF_MAX_AGE_MS
    ) return null;
    return proof;
  }

  function saveProof(product, offer, source = "product", quantityConfirmed = false, inventory = null) {
    return runtimeMessage({
      type: "CART_CONFIRM_SAVE_PROOF",
      productId: product.id,
      proof: {
        price: Number.isFinite(offer?.price) ? offer.price : null,
        seller: offer?.seller || "",
        firstParty: offer?.firstParty === true,
        quantityConfirmed: source === "cart" && quantityConfirmed === true,
        inventoryConfirmed: source === "cart" && inventory?.independentlyCounted === true,
        cartLineCount: source === "cart" ? inventory?.items?.length : 0,
        cartSku: source === "cart" ? inventory?.items?.[0]?.sku : "",
        source
      }
    });
  }

  async function nextAttempt(product) {
    const result = await runtimeMessage({ type: "CART_CONFIRM_RECORD_ATTEMPT", productId: product.id });
    if (result.ok) attemptCache.set(product.id, result.attempt);
    return result;
  }

  function currentAttempt(product) {
    return Number(attemptCache.get(product.id) || 0);
  }

  async function requireAttempt(product) {
    const result = await nextAttempt(product);
    if (result.ok) return result.attempt;
    const reason = ["run-expired", "attempt-budget-exhausted"].includes(result.reason)
      ? result.reason
      : "attempt-budget-exhausted";
    await send("automation-blocked", product, {
      attempt: currentAttempt(product),
      reason,
      message: reason === "run-expired"
        ? "The four-hour automation run expired. Review the store state and re-arm manually."
        : "This product reached the fixed 100-attempt run budget. Review it and re-arm manually."
    }, `attempt-budget:${product.id}:${reason}`, 60_000);
    return null;
  }

  async function requireStoreAction(product, kind) {
    const result = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_STORE_ACTION",
      productId: product.id,
      kind
    });
    if (result.ok) return true;
    if (result.reason === "disarmed") return false;
    const reason = ["traffic-budget-exhausted", "traffic-overload"].includes(result.reason)
      ? result.reason
      : "store-error";
    await send("automation-blocked", product, {
      reason,
      message: reason === "traffic-budget-exhausted"
        ? `${adapter.label} reached the fixed 120-action rolling-hour budget. Automatic store actions are paused.`
        : reason === "traffic-overload"
          ? `${adapter.label} is in an overload cooldown. Automatic store actions are paused.`
          : "The desktop traffic governor could not authorize another store action."
    }, `store-action-blocked:${product.id}:${reason}`, 60_000);
    return false;
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
    quantityRechecks.delete(product.id);
    return runtimeMessage({ type: "CART_CONFIRM_COMPLETE_PRODUCT", productId: product.id });
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

  async function scheduleRetry(product, message, destination = "reload", errorBackoff = false) {
    if (!config?.automationEnabled || !product.enabled || retryTimer) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed || !state.armed) return;
    if (state.budgetReason) {
      await requireAttempt(product);
      return;
    }
    if (["intent", "uncertain"].includes(state.submission?.phase)) return;

    const attempt = await requireAttempt(product);
    if (attempt === null) return;
    const baseSeconds = Math.max(5, Number(config.retryIntervalSeconds || 15));
    const multiplier = errorBackoff ? Math.min(8, 2 ** Math.min(3, Math.floor((attempt - 1) / 3))) : Math.min(3, 1 + Math.floor(attempt / 20));
    const jitter = Math.floor(Math.random() * Math.max(1, baseSeconds * 0.2));
    const delayMs = (baseSeconds * multiplier + jitter) * 1000;
    const reservationId = `${config.automationRunId || "run"}:${product.id}:${attempt}:${Date.now()}`;
    const reservation = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_NAVIGATION",
      retailer,
      productId: product.id,
      reservationId,
      notBefore: Date.now() + delayMs
    });
    if (!reservation.ok) {
      if (["disarmed", "product-disabled"].includes(reservation.reason)) return;
      if (reservation.reason === "traffic-budget-exhausted") {
        await send("automation-blocked", product, {
          reason: "traffic-budget-exhausted",
          message: `${adapter.label} reached the fixed rolling-hour store-action budget.`
        }, `traffic-reservation:${product.id}:${attempt}`, 15_000);
      } else {
        await send("store-error", product, {
          attempt,
          reason: "manual-action-required",
          message: "Automatic navigation stopped because the desktop traffic governor could not reserve a safe slot. Review the store manually."
        }, `traffic-reservation-failed:${product.id}:${reservation.reason}`, 60_000);
      }
      return;
    }
    await send("retry-scheduled", product, {
      attempt,
      reason: "retrying",
      message
    }, `retry:${product.id}:${attempt}`, 0);

    const navigateWhenAllowed = async () => {
      retryTimer = null;
      const traffic = await runtimeMessage({
        type: "CART_CONFIRM_REVALIDATE_NAVIGATION",
        retailer,
        productId: product.id,
        reservationId
      });
      if (!traffic.ok) {
        if (traffic.reason === "not-ready" && traffic.waitMs > 0) {
          retryTimer = setTimeout(navigateWhenAllowed, traffic.waitMs);
        } else if (traffic.reason === "reservation-missing") {
          await scheduleRetry(product, "A throttled browser timer expired its traffic slot; reserving a fresh one.", destination, errorBackoff);
        } else if (traffic.reason === "traffic-budget-exhausted") {
          await send("automation-blocked", product, {
            reason: "traffic-budget-exhausted",
            message: `${adapter.label} reached the fixed 120-action rolling-hour budget. Automatic navigation is paused.`
          }, `traffic-budget:${product.id}`, 60_000);
        } else if (!["disarmed", "product-disabled"].includes(traffic.reason)) {
          await send("store-error", product, {
            attempt: currentAttempt(product),
            reason: "manual-action-required",
            message: "Automatic navigation stopped because the desktop traffic governor could not revalidate the request. Review the store manually."
          }, `traffic-revalidation-failed:${product.id}:${traffic.reason}`, 60_000);
        }
        return;
      }
      const nextConfig = await requestConfig(true);
      if (!nextConfig?.automationEnabled) return;
      config = nextConfig;
      const nextState = await productAutomationState(product);
      if (!nextState.ok || nextState.completed || adapter.securityChallenge(document)) return;
      if (destination === "product") location.assign(product.productUrl);
      else if (destination === "cart") location.assign(adapter.cartUrl);
      else location.reload();
    };
    retryTimer = setTimeout(navigateWhenAllowed, reservation.waitMs);
  }

  async function clickAction(element, beforeClick = null) {
    if (!Retailers.isActionable(element)) return false;
    element.scrollIntoView?.({ block: "center", inline: "nearest" });
    element.focus?.({ preventScroll: true });
    await sleep(80);
    if (!Retailers.isActionable(element) || adapter.securityChallenge(document)) return false;
    if (beforeClick && !await beforeClick()) return false;
    if (!Retailers.isActionable(element) || adapter.securityChallenge(document)) return false;
    try {
      element.click();
      return true;
    } catch {
      return false;
    }
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
      if (!await requireStoreAction(product, "quantity-change")) return { ok: false, blocked: true };
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(900);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }

    if (input) {
      if (!await requireStoreAction(product, "quantity-change")) return { ok: false, blocked: true };
      setNativeValue(input, String(desired));
      input.blur?.();
      await sleep(900);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }

    if (Number.isInteger(line.quantity) && line.quantity < desired && increase) {
      if (!await requireStoreAction(product, "quantity-increase")) return { ok: false, blocked: true };
      await clickAction(increase);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }
    if (Number.isInteger(line.quantity) && line.quantity > desired && decrease) {
      if (!await requireStoreAction(product, "quantity-decrease")) return { ok: false, blocked: true };
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

  async function handleRetailerQueue(product) {
    const queue = adapter.queueState?.(location.href);
    if (!queue || queue.itemId !== product.sku) return false;
    clearRetry();
    await send("queue-waiting", product, {
      availability: queue.soldOut ? "unavailable" : "unknown",
      reason: "retailer-queue",
      message: queue.soldOut
        ? `${adapter.label} reports that the queued item sold out. No queue request or refresh was attempted.`
        : `${adapter.label} placed this item in its official queue. The companion will not refresh, call ticket endpoints, or bypass the queue; it will resume after the store admits this tab.`
    }, `queue:${product.id}:${queue.state}:${queue.soldOut}`, 30_000);
    return true;
  }

  async function handleConfirmation(product) {
    if (!adapter.orderConfirmed(document)) return false;
    const completed = await completeProduct(product);
    if (!completed.ok) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "The store displayed confirmation text without a matching durable submit intent. Verify the order manually."
      }, `confirmation-unmatched:${product.id}:${completed.reason}`, 60_000);
      return true;
    }
    const orderTotal = adapter.orderTotal(document);
    const reported = await send("order-confirmed", product, {
      attempt: currentAttempt(product),
      orderTotal: orderTotal === null ? undefined : orderTotal
    }, `order-confirmed:${product.id}`, Number.MAX_SAFE_INTEGER);
    if (reported.ok) clearActiveProduct(product);
    return true;
  }

  async function handleProductPage(product) {
    const error = adapter.storeError(document);
    if (error) {
      if (error === "traffic-overload") {
        await runtimeMessage({ type: "CART_CONFIRM_TRAFFIC_OVERLOAD", retailer });
      }
      await send("store-error", product, {
        attempt: currentAttempt(product),
        reason: error,
        message: error === "traffic-overload"
          ? `${adapter.label} is overloaded. Automatic traffic is cooling down before another request.`
          : "The store returned an error on the product page."
      }, `product-error:${product.id}:${error}`, 10_000);
      if (config.automationEnabled) {
        await scheduleRetry(product, `Waiting for ${adapter.label} to recover.`, "reload", true);
      }
      return;
    }
    const offer = adapter.offer(document, product);
    const result = eligibility(product, offer);
    // Reporting must never delay the add path: these are fire-and-forget.
    void send("availability", product, {
      availability: offer.available ? "available" : "unavailable"
    }, `availability:${product.id}:${offer.available}`, 10_000);
    void send("offer-observed", product, {
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
      if (["run-expired", "attempt-budget-exhausted"].includes(claim.reason)) {
        await requireAttempt(product);
      } else if (claim.reason === "submission-uncertain") {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: "A prior order submission is uncertain and remains locked for manual review."
        }, `claim-uncertain:${product.id}`, 60_000);
      } else if (claim.reason !== "completed") {
        await scheduleRetry(product, claim.reason === "store-busy"
          ? `${adapter.label} is processing another configured product in this store.`
          : "Another tab is already processing this configured product.");
      }
      return;
    }

    setActiveProduct(product);
    const savedProof = await saveProof(product, offer, "product");
    if (!savedProof.ok) return;
    if (!await requireStoreAction(product, "add-to-cart")) return;
    const attempt = await requireAttempt(product);
    if (attempt === null) return;
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

    quantityRechecks.delete(product.id);
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
    if (!await requireStoreAction(product, "cart-navigation")) return;
    location.assign(adapter.cartUrl);
  }

  async function handleCartPage(product) {
    const error = adapter.storeError(document);
    if (error) {
      if (error === "traffic-overload") {
        await runtimeMessage({ type: "CART_CONFIRM_TRAFFIC_OVERLOAD", retailer });
      }
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

    const inventory = adapter.cartInventory(document);
    const line = adapter.findLine(document, product);
    if (!line) {
      await send("automation-blocked", product, {
        reason: "unmatched-product",
        message: "The exact configured SKU is not yet visible as a cart line item."
      }, `missing-cart-line:${product.id}`, 10_000);
      if (config.automationEnabled) await scheduleRetry(product, "The exact cart line was not found; returning to the product.", "product");
      return;
    }

    const safeLine = Safety.effectiveLineOffer(product, line);
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

    // Cart pages hydrate their quantity controls late; an unreadable quantity
    // gets bounded rechecks before it may block, because the add itself has
    // already happened by the time this page is examined.
    if (line.quantity === null || line.quantity === undefined) {
      const recheckCount = (quantityRechecks.get(product.id) || 0) + 1;
      if (recheckCount <= QUANTITY_RECHECK_LIMIT) {
        quantityRechecks.set(product.id, recheckCount);
        scheduleScan(900);
        return;
      }
    }

    const quantity = await ensureQuantity(product, line);
    if (quantity.ok) quantityRechecks.delete(product.id);
    if (!quantity.ok) {
      if (quantity.blocked) return;
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
        message: `The cart has not shown a readable quantity for this line, so quantity ${product.quantity} could not be verified. The item may already be in the cart — review it manually.`
      }, `quantity-blocked:${product.id}:${product.quantity}`, 15_000);
      return;
    }

    await send("quantity-updated", product, {
      quantity: product.quantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `quantity-confirmed:${product.id}:${product.quantity}`, 10_000);
    const cartReported = await send("cart-item-confirmed", product, {
      quantity: product.quantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `cart-confirmed:${product.id}:${product.quantity}`, 10_000);

    if (!config.automationEnabled) return;
    if (product.action === "cart") {
      if (!cartReported.ok) return;
      const completed = await completeProduct(product);
      if (completed.ok) clearActiveProduct(product);
      return;
    }

    const cartSafety = Safety.verifySingleProductCart(product, inventory);
    if (!cartSafety.ok) {
      await send("automation-blocked", product, {
        reason: cartSafety.reason,
        message: cartSafety.reason === "cart-unverified"
          ? "Checkout stopped because the complete cart inventory could not be verified."
          : "Checkout stopped because this store cart contains another product or duplicate line. Remove or purchase it manually first."
      }, `cart-scope:${product.id}:${cartSafety.reason}`, 30_000);
      return;
    }
    const savedProof = await saveProof(product, safeLine, "cart", true, inventory);
    if (!savedProof.ok) return;

    const claim = await claimProduct(product);
    if (!claim.ok) {
      if (["run-expired", "attempt-budget-exhausted"].includes(claim.reason)) await requireAttempt(product);
      return;
    }
    const checkoutButton = adapter.checkoutButton(document);
    if (!checkoutButton) {
      await scheduleRetry(product, "Waiting for the store checkout control.", "reload", true);
      return;
    }
    if (!await requireStoreAction(product, "checkout")) return;
    const attempt = await requireAttempt(product);
    if (attempt === null) return;
    if (await clickAction(checkoutButton)) {
      await send("checkout-clicked", product, { attempt }, `checkout-clicked:${product.id}:${attempt}`, 0);
    } else {
      await scheduleRetry(product, "Checkout was not actionable.", "reload", true);
    }
  }

  async function readCheckoutReview(product) {
    const inventory = adapter.cartInventory(document);
    const line = adapter.findLine(document, product);
    const proof = await proofFor(product);
    const orderTotal = adapter.orderTotal(document);
    const unsafeChoices = adapter.unsafeOrderChoices(document);
    const fulfillmentMode = adapter.fulfillmentMode(document);
    const review = Safety.checkoutSafety({
      product,
      inventory,
      line,
      proof,
      orderTotal,
      unsafeChoices,
      fulfillmentMode,
      now: Date.now()
    });
    return { ...review, inventory, line, orderTotal };
  }

  function reviewEvidenceHash(product, review) {
    return JSON.stringify({
      path: location.pathname,
      productId: product.id,
      quantity: product.quantity,
      maxPrice: product.maxPrice,
      maxOrderTotal: product.maxOrderTotal,
      inventoryComplete: review.inventory?.complete === true,
      inventoryIds: (review.inventory?.items || []).map((item) => item.sku),
      lineQuantity: review.line?.quantity,
      linePrice: review.price,
      seller: review.seller,
      firstParty: review.firstParty,
      orderTotal: review.orderTotal
    });
  }

  async function handleCheckoutPage(product) {
    await send("checkout-reached", product, {
      attempt: currentAttempt(product)
    }, `checkout-reached:${product.id}:${pageAddress()}`, 10_000);

    if (!config.automationEnabled || !["review", "checkout"].includes(product.action)) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed) return;
    if (Number.isInteger(state.attempts)) attemptCache.set(product.id, state.attempts);

    const error = adapter.storeError(document);
    if (error) {
      if (error === "traffic-overload") {
        await runtimeMessage({ type: "CART_CONFIRM_TRAFFIC_OVERLOAD", retailer });
      }
      if (["intent", "uncertain"].includes(state.submission?.phase)) {
        if (!adapter.submissionFailure(document)) {
          await send("store-error", product, {
            attempt: currentAttempt(product),
            reason: "manual-action-required",
            message: "Checkout displayed an error, but it did not explicitly prove the order was not placed. Submission remains locked for manual review."
          }, `checkout-uncertain-error:${product.id}:${state.submission.updatedAt}:${error}`, 60_000);
          return;
        }
        const failed = await runtimeMessage({
          type: "CART_CONFIRM_MARK_SUBMISSION",
          productId: product.id,
          outcome: "failed"
        });
        if (!failed.ok) {
          await send("store-error", product, {
            attempt: currentAttempt(product),
            reason: "manual-action-required",
            message: "The store explicitly rejected the order, but the durable submission lock could not be cleared. Review it manually."
          }, `checkout-failure-state-error:${product.id}:${failed.reason}`, 60_000);
          return;
        }
      }
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

    if (["intent", "uncertain"].includes(state.submission?.phase)) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "Order submission may have been sent. Automatic resubmission remains locked until a confirmation or explicit store failure is observed."
      }, `submit-uncertain:${product.id}:${state.submission.updatedAt}`, 60_000);
      return;
    }

    const claim = await claimProduct(product);
    if (!claim.ok) {
      if (["run-expired", "attempt-budget-exhausted"].includes(claim.reason)) await requireAttempt(product);
      return;
    }

    const review = await readCheckoutReview(product);
    if (!review.ok) {
      await send("automation-blocked", product, {
        price: review.price,
        orderTotal: review.orderTotal === null ? undefined : review.orderTotal,
        seller: review.seller,
        firstParty: review.firstParty,
        eligible: false,
        reason: review.reason,
        message: review.reason === "over-total"
          ? `Final order total is above the $${product.maxOrderTotal.toFixed(2)} cap.`
          : review.reason === "total-unavailable"
            ? "Final order review did not expose a readable order total."
            : review.reason === "fulfillment-unverified"
              ? `Final order review did not prove the required ${product.fulfillmentMode} fulfillment mode.`
            : "Final order review could not re-verify the complete cart, exact SKU, first-party offer, unit cap, and quantity."
      }, `review-blocked:${product.id}:${review.reason}`, 20_000);
      return;
    }

    if (product.action === "review") {
      const reported = await send("review-ready", product, {
        quantity: product.quantity,
        price: review.price,
        orderTotal: review.orderTotal,
        seller: review.seller,
        firstParty: true,
        eligible: true,
        reason: "eligible"
      }, `review-ready:${product.id}:${review.orderTotal}`, Number.MAX_SAFE_INTEGER);
      if (!reported.ok) return;
      const completed = await completeProduct(product);
      if (completed.ok) clearActiveProduct(product);
      return;
    }

    const submitButton = adapter.submitButton(document);
    if (!submitButton) {
      scheduleScan(1_500);
      return;
    }

    const expectedHash = reviewEvidenceHash(product, review);
    let intentCreated = false;
    let attempt = 0;
    const clicked = await clickAction(submitButton, async () => {
      if (!await requireStoreAction(product, "order-submit")) return false;
      attempt = await requireAttempt(product);
      if (attempt === null) return false;
      const freshReview = await readCheckoutReview(product);
      if (!freshReview.ok || reviewEvidenceHash(product, freshReview) !== expectedHash) {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: "The final order evidence changed before submission. Automatic checkout stopped for a fresh manual review."
        }, `review-changed:${product.id}:${Date.now()}`, 0);
        return false;
      }
      const intent = await runtimeMessage({
        type: "CART_CONFIRM_BEGIN_SUBMISSION",
        productId: product.id,
        evidenceHash: expectedHash
      });
      intentCreated = intent.ok;
      return intent.ok;
    });
    if (clicked) {
      await runtimeMessage({
        type: "CART_CONFIRM_MARK_SUBMISSION",
        productId: product.id,
        outcome: "clicked"
      });
      await send("order-submit-clicked", product, {
        attempt,
        quantity: product.quantity,
        price: review.price,
        orderTotal: review.orderTotal,
        seller: review.seller,
        firstParty: true,
        eligible: true,
        reason: "eligible"
      }, `order-submit:${product.id}:${attempt}`, 0);
      scheduleScan(2_000);
    } else if (intentCreated) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "A durable submit intent was recorded but the click result is uncertain. Automatic retry is locked for manual review."
      }, `submit-intent-uncertain:${product.id}:${attempt}`, Number.MAX_SAFE_INTEGER);
    } else {
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

      void send("page-observed", product, {}, `page:${product.id}:${pageAddress()}`, 30_000);
      const kind = adapter.pageKind(location.href);
      if (kind === "queue" && await handleRetailerQueue(product)) return;
      if (kind === "confirmation" && await handleConfirmation(product)) return;
      if (kind === "product") await handleProductPage(product);
      else if (kind === "cart") await handleCartPage(product);
      else if (kind === "checkout" || kind === "confirmation") await handleCheckoutPage(product);
      else {
        clearRetry();
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: "The store redirected this workflow to an unrecognized page. Complete any sign-in or account prompt manually, then return to the configured product."
        }, `unexpected-page:${product.id}:${pageAddress()}`, 60_000);
      }
    } finally {
      scanning = false;
    }
  }

  function scheduleScan(delay = 150) {
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
