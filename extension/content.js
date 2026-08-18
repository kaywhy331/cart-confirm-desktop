"use strict";

(() => {
  const Retailers = globalThis.CartConfirmRetailers;
  const QuickAdd = globalThis.CartConfirmQuickAdd;
  const CatalogSearch = globalThis.CartConfirmCatalogSearch;
  const Safety = globalThis.CartConfirmSafety;
  const Evidence = globalThis.CartConfirmEvidence;
  const ScheduleGate = globalThis.CartConfirmScheduleGate;
  const QueueCapture = globalThis.CartConfirmQueueCapture;
  if (!Retailers || !QuickAdd || !CatalogSearch || !Evidence || !Safety || !ScheduleGate || !QueueCapture) return;

  const ACTIVE_PRODUCT_KEY = "cartConfirmActiveProductId";
  const CHECKOUT_HMAC_SECRET_KEY = "cartConfirmCheckoutHmacSecretV1";
  const CONFIG_REFRESH_MS = 5_000;
  const HEARTBEAT_MS = 10_000;
  const OBSERVATION_DEDUPE_MS = Number.MAX_SAFE_INTEGER;
  const PROOF_MAX_AGE_MS = Safety.CART_PROOF_MAX_AGE_MS;
  const seen = new Map();
  const attemptCache = new Map();
  const quantityRechecks = new Map();
  // Checkout summaries recompute totals, shipping, and fulfillment for a few
  // seconds after a quantity change (e.g. free shipping applying). These
  // review-block reasons can be that transient hydration, so they get bounded
  // rechecks before a manual-review block is posted. Genuine mismatches
  // (trust, preflight evidence, unsafe choices) always block immediately.
  const REVIEW_SETTLE_REASONS = Object.freeze(["total-unavailable", "over-total", "checkout-evidence-unverified", "fulfillment-unverified"]);
  const REVIEW_SETTLE_RECHECK_LIMIT = 10;
  const reviewSettleRechecks = new Map();
  const missingCartLineSince = new Map();
  const QUANTITY_RECHECK_LIMIT = 8;
  const PARTIAL_RAISE_ATTEMPT_LIMIT = 4;
  const partialRaiseAttempts = new Map();
  const CART_LINE_CONFIRMATION_WAIT_MS = 10_000;
  const ADD_SETTLE_MS = 5_000;
  const TARGET_CART_LINE_CONFIRMATION_WAIT_MS = 2_500;
  const TARGET_ADD_CONFIRMATION_WAIT_MS = 3_000;
  const TARGET_CART_COUNT_POLL_MS = 75;
  const DEFAULT_TARGET_PERSISTENCE_RETRY_MS = 750;
  const CLAIM_RETRY_MIN_MS = 500;
  const CLAIM_RETRY_MAX_MS = 2_000;
  let config = null;
  let configFingerprint = "";
  let scanTimer = null;
  let catalogCaptureTimer = null;
  let catalogCaptureFingerprint = "";
  let retryTimer = null;
  // Chrome clamps content-script timers in hidden tabs (down to one firing a
  // minute after five throttled minutes), which starves both scans and the
  // watcher's stock-refresh navigations until the tab is clicked. The pending
  // navigation's deadline and callback are tracked so the service worker's
  // alarm heartbeat can fire overdue work immediately in background tabs.
  let retryDue = null;
  let retryReservationId = "";
  let retryReservationProductId = "";
  let claimRetryTimer = null;
  let claimRetryDue = null;
  let claimRetryCount = 0;
  let queueCaptureTimer = null;
  let queueCaptureInFlight = false;
  let scanning = false;
  let backgroundActiveProductId = "";
  let backgroundActiveEntry = "product";
  let backgroundSignalOrderLimit = null;
  let lastContextSyncProductId = "";
  let checkoutHmacSecretPromise = null;

  const retailer = Retailers.detectRetailer(location.href);
  const adapter = Retailers.getAdapter(retailer);
  if (!adapter) return;

  const pageAddress = () => `${location.origin}${location.pathname}`;
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function isBlitz(product) {
    return product?.executionMode === "blitz";
  }

  function watcherIntervalSeconds() {
    return Math.max(30, Number(config?.watcherIntervalSeconds || 60));
  }

  function targetPersistenceRetryMs() {
    return Math.max(250, Number(config?.blitzRetryDelayMs || DEFAULT_TARGET_PERSISTENCE_RETRY_MS));
  }

  // Chrome throttles timers and rendering in inactive tabs, which can stall a
  // time-critical purchase between Add, cart verification, and checkout. When
  // this tab's mission qualifies for a real cart action, ask the browser to
  // switch back to this exact tab and keep it forward. Throttled so a blocked
  // workflow cannot fight the operator for focus more than once every ten
  // seconds, and never used for Watch & alert only or Test observation.
  let lastTabActivationRequestAt = 0;
  function requestPurchaseTabActivation(product) {
    if (!config?.automationEnabled || config.monitoringPaused) return;
    if (!product?.enabled || !["cart", "review", "checkout"].includes(product.action)) return;
    const now = Date.now();
    if (now - lastTabActivationRequestAt < 10_000) return;
    lastTabActivationRequestAt = now;
    void runtimeMessage({ type: "CART_CONFIRM_ACTIVATE_TAB", productId: product.id });
  }

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

  function randomSecretHex() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (stored) => {
        if (chrome.runtime.lastError) reject(new Error("Checkout evidence storage is unavailable."));
        else resolve(stored || {});
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) reject(new Error("Checkout evidence storage is unavailable."));
        else resolve();
      });
    });
  }

  async function checkoutHmacSecret() {
    if (!checkoutHmacSecretPromise) {
      checkoutHmacSecretPromise = (async () => {
        const stored = await storageGet(CHECKOUT_HMAC_SECRET_KEY);
        const existing = String(stored[CHECKOUT_HMAC_SECRET_KEY] || "");
        if (/^[a-f0-9]{64}$/.test(existing)) return existing;
        const created = randomSecretHex();
        await storageSet({ [CHECKOUT_HMAC_SECRET_KEY]: created });
        const verified = String((await storageGet(CHECKOUT_HMAC_SECRET_KEY))[CHECKOUT_HMAC_SECRET_KEY] || "");
        if (!/^[a-f0-9]{64}$/.test(verified)) throw new Error("Checkout evidence secret could not be persisted.");
        return verified;
      })().catch((error) => {
        checkoutHmacSecretPromise = null;
        throw error;
      });
    }
    return checkoutHmacSecretPromise;
  }

  async function fingerprintCheckoutEvidence(values) {
    const normalized = Evidence.normalizeFingerprintValues(values);
    if (!normalized.length) return "";
    return Evidence.fingerprintWithSecret(await checkoutHmacSecret(), normalized);
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
    // Release requests are safe here because AutomationState.release is
    // phase-aware: any confirmed/uncertain cart mutation keeps the retailer
    // lane, while a purely pre-click block may give it back.
    if (
      product?.id
      && details.releaseLane !== false
      && ["automation-blocked", "store-error", "retry-scheduled"].includes(eventType)
    ) {
      await runtimeMessage({ type: "CART_CONFIRM_RELEASE_PRODUCT", productId: product.id });
    }
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

  function sameCatalogQuery(left, right) {
    return String(left || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US")
      === String(right || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
  }

  async function captureCatalogResults() {
    const search = config?.catalogSearch;
    if (!search?.id || new Date(search.expiresAt).getTime() <= Date.now()) return;
    const context = CatalogSearch.searchPageContext(location.href, Retailers);
    if (
      !context
      || !search.retailers.includes(context.retailer)
      || !sameCatalogQuery(context.query, search.query)
    ) return;

    let capture;
    try {
      capture = CatalogSearch.inspectSearchPage(document, location.href, Retailers);
    } catch {
      return;
    }
    const fingerprint = `${search.id}:${context.retailer}:${CatalogSearch.resultsFingerprint(capture)}`;
    if (fingerprint === catalogCaptureFingerprint) return;
    // Record the attempt before sending so a busy retailer MutationObserver
    // cannot turn a single rendered result set into repeated loopback posts.
    catalogCaptureFingerprint = fingerprint;
    await runtimeMessage({
      type: "CART_CONFIRM_CATALOG_RESULTS",
      capture: {
        searchId: search.id,
        retailer: capture.retailer,
        query: capture.query,
        results: capture.results
      }
    });
  }

  function scheduleCatalogCapture(delay = 400) {
    clearTimeout(catalogCaptureTimer);
    catalogCaptureTimer = setTimeout(() => void captureCatalogResults(), delay);
  }

  async function automationStillActive(product) {
    const next = await requestConfig(true);
    if (!next) return false;
    config = next;
    const configured = (next.products || []).find((candidate) => candidate.id === product?.id);
    if (
      !next.automationEnabled
      || next.monitoringPaused
      || !configured?.enabled
      || ScheduleGate.calendarOwned(configured)
    ) {
      clearRetry();
      return false;
    }
    return true;
  }

  function storeProducts() {
    return (config?.products || []).filter((product) => product.retailer === retailer);
  }

  function activeProduct() {
    const direct = storeProducts().find((product) => adapter.productMatches(product, location.href));
    if (direct) {
      setActiveProduct(direct);
      return direct;
    }
    const activeId = backgroundActiveProductId || sessionStorage.getItem(ACTIVE_PRODUCT_KEY);
    return storeProducts().find((product) => product.id === activeId) || null;
  }

  function setActiveProduct(product) {
    const alreadyBound = backgroundActiveProductId === product.id;
    sessionStorage.setItem(ACTIVE_PRODUCT_KEY, product.id);
    if (alreadyBound) {
      lastContextSyncProductId = product.id;
      return;
    }
    backgroundActiveProductId = product.id;
    backgroundActiveEntry = "product";
    backgroundSignalOrderLimit = null;
    if (lastContextSyncProductId !== product.id) {
      lastContextSyncProductId = product.id;
      void runtimeMessage({
        type: "CART_CONFIRM_SET_TAB_PRODUCT_CONTEXT",
        productId: product.id
      });
    }
  }

  function clearActiveProduct(product) {
    if (sessionStorage.getItem(ACTIVE_PRODUCT_KEY) === product.id) {
      sessionStorage.removeItem(ACTIVE_PRODUCT_KEY);
    }
    if (backgroundActiveProductId === product.id) backgroundActiveProductId = "";
    backgroundActiveEntry = "product";
    backgroundSignalOrderLimit = null;
    lastContextSyncProductId = "";
    void runtimeMessage({ type: "CART_CONFIRM_CLEAR_TAB_PRODUCT_CONTEXT" });
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

  // Same-run proof with the freshness bound relaxed. Only usable as an
  // arithmetic price anchor (subtotal = unit × quantity corroboration in
  // effectiveLineOffer) — never for seller or first-party backfill, which
  // requires the age-bounded proofFor above.
  async function staleProofFor(product) {
    const state = await productAutomationState(product);
    const proof = state.ok ? state.proof : null;
    if (
      !proof
      || proof.productId !== product.id
      || proof.runId !== config?.automationRunId
    ) return null;
    return proof;
  }

  function proofInput(offer, source = "product", quantityConfirmed = false, inventory = null) {
    return {
      price: Number.isFinite(offer?.price) ? offer.price : null,
      seller: offer?.seller || "",
      firstParty: offer?.firstParty === true,
      quantityConfirmed: source === "cart" && quantityConfirmed === true,
      inventoryConfirmed: source === "cart" && inventory?.independentlyCounted === true,
      cartLineCount: source === "cart" ? inventory?.items?.length : 0,
      cartSku: source === "cart" ? inventory?.items?.[0]?.sku : "",
      source
    };
  }

  function saveProof(product, offer, source = "product", quantityConfirmed = false, inventory = null) {
    return runtimeMessage({
      type: "CART_CONFIRM_SAVE_PROOF",
      productId: product.id,
      proof: proofInput(offer, source, quantityConfirmed, inventory)
    });
  }

  function prepareAddAction(product, offer) {
    return runtimeMessage({
      type: "CART_CONFIRM_PREPARE_ADD_ACTION",
      productId: product.id,
      proof: proofInput(offer)
    });
  }

  function hasDirectEntryContext(product) {
    return backgroundActiveProductId === product.id && backgroundActiveEntry !== "product";
  }

  async function consumeDirectEntryContext(product) {
    if (!hasDirectEntryContext(product)) return;
    const result = await runtimeMessage({
      type: "CART_CONFIRM_CONSUME_DIRECT_ENTRY_CONTEXT",
      productId: product.id
    });
    if (result.ok) backgroundActiveEntry = "product";
  }

  function configuredQuantityLimit(product) {
    const limits = [Number(product?.quantity)];
    if (Number.isInteger(backgroundSignalOrderLimit) && backgroundSignalOrderLimit > 0) {
      limits.push(backgroundSignalOrderLimit);
    }
    const visible = adapter.visibleQuantityLimit?.(document, product);
    if (Number.isInteger(visible) && visible > 0) limits.push(visible);
    return Math.min(...limits);
  }

  function acceptsPartialQuantity(product) {
    return product?.acceptPartial !== false;
  }

  async function requireQuantityWithinLimits(product) {
    const effectiveLimit = configuredQuantityLimit(product);
    if (product.quantity <= effectiveLimit) return true;
    if (acceptsPartialQuantity(product) && effectiveLimit >= 1) {
      void send("automation-status", product, {
        eligible: true,
        reason: "quantity-limit",
        quantity: effectiveLimit,
        message: `${adapter.label} limits this item to ${effectiveLimit}, below configured quantity ${product.quantity}. Partial quantity is accepted, so Cart Confirm will secure ${effectiveLimit}.`
      }, `quantity-partial-pre:${product.id}:${product.quantity}:${effectiveLimit}`, Number.MAX_SAFE_INTEGER);
      return true;
    }
    await send("automation-blocked", product, {
      reason: "quantity-limit",
      quantity: product.quantity,
      message: `${adapter.label} limits this item to ${effectiveLimit}, below configured quantity ${product.quantity}. Cart Confirm will not silently lower the mission or click Add to cart.`
    }, `quantity-limit:${product.id}:${product.quantity}:${effectiveLimit}`, Number.MAX_SAFE_INTEGER);
    return false;
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
    if (["disarmed", "product-disabled"].includes(result.reason)) return null;
    await send("automation-blocked", product, {
      attempt: currentAttempt(product),
      reason: "manual-action-required",
      message: "The durable automation state could not record this purchase action. Automatic action stopped for manual review."
    }, `attempt-state:${product.id}:${result.reason}`, 60_000);
    return null;
  }

  async function authorizeAddClick(product) {
    const result = await runtimeMessage({
      type: "CART_CONFIRM_AUTHORIZE_ADD_CLICK",
      productId: product.id
    });
    if (result.ok) attemptCache.set(product.id, result.attempt);
    return result;
  }

  async function requireStoreAction(product, kind, targetPersistence = false) {
    const result = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_STORE_ACTION",
      productId: product.id,
      kind: targetPersistence ? `target-persistence:${kind}` : kind
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
    if (!isBlitz(product) && ["traffic-budget-exhausted", "traffic-overload"].includes(reason)) {
      await scheduleRetry(
        product,
        `${adapter.label} traffic is temporarily gated; the continuous watcher will try again after its configured interval.`,
        "reload"
      );
    }
    return false;
  }

  function armNavigationRetry(run, delayMs) {
    retryDue = { at: Date.now() + delayMs, run };
    retryTimer = setTimeout(() => {
      retryDue = null;
      void run();
    }, delayMs);
  }

  function fireOverdueNavigationRetry(graceMs = 1_000) {
    if (!retryTimer || !retryDue || Date.now() < retryDue.at + graceMs) return false;
    clearTimeout(retryTimer);
    retryTimer = null;
    const { run } = retryDue;
    retryDue = null;
    void run();
    return true;
  }

  function clearNavigationRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
    retryDue = null;
    const reservationId = retryReservationId;
    const productId = retryReservationProductId;
    retryReservationId = "";
    retryReservationProductId = "";
    if (reservationId) {
      void runtimeMessage({
        type: "CART_CONFIRM_CANCEL_NAVIGATION",
        retailer,
        productId,
        reservationId
      });
    }
  }

  function clearClaimRetry() {
    clearTimeout(claimRetryTimer);
    claimRetryTimer = null;
    claimRetryDue = null;
    claimRetryCount = 0;
  }

  function fireOverdueClaimRetry(graceMs = 1_000) {
    if (!claimRetryTimer || !claimRetryDue || Date.now() < claimRetryDue.at + graceMs) return false;
    clearTimeout(claimRetryTimer);
    claimRetryTimer = null;
    const { run } = claimRetryDue;
    claimRetryDue = null;
    void run();
    return true;
  }

  function clearRetry() {
    clearNavigationRetry();
    clearClaimRetry();
  }

  function clearQueueCaptureRetry() {
    clearTimeout(queueCaptureTimer);
    queueCaptureTimer = null;
    queueCaptureInFlight = false;
  }

  async function productAutomationState(product) {
    return runtimeMessage({ type: "CART_CONFIRM_PRODUCT_STATE", productId: product.id });
  }

  async function claimProduct(product) {
    return runtimeMessage({ type: "CART_CONFIRM_CLAIM_PRODUCT", productId: product.id });
  }

  async function markAddAction(product, outcome) {
    return runtimeMessage({
      type: "CART_CONFIRM_MARK_ADD_ACTION",
      productId: product.id,
      outcome
    });
  }

  async function reserveTargetPersistence(product, kind) {
    if (product.retailer !== "target" || !isBlitz(product)) {
      return { ok: true, targetPersistence: false };
    }
    const result = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_TARGET_PERSISTENCE",
      productId: product.id,
      kind
    });
    if (result.ok) return { ...result, targetPersistence: true };
    if (!["disarmed", "product-disabled"].includes(result.reason)) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: result.reason === "target-persistence-exhausted"
          ? `Target's bounded ${kind} persistence window ended after ${result.attempts || 0} actions. The mission stopped instead of continuing an unbounded request loop.`
          : `Target persistence could not reserve the ${kind} action (${result.reason || "unknown state error"}).`
      }, `target-persistence-blocked:${product.id}:${kind}:${result.reason}`, Number.MAX_SAFE_INTEGER);
    }
    return { ...result, targetPersistence: true };
  }

  async function completeProduct(product) {
    clearRetry();
    quantityRechecks.delete(product.id);
    partialRaiseAttempts.delete(product.id);
    missingCartLineSince.delete(product.id);
    return runtimeMessage({ type: "CART_CONFIRM_COMPLETE_PRODUCT", productId: product.id });
  }

  function beginManualReview(product, evidenceHash) {
    return runtimeMessage({
      type: "CART_CONFIRM_BEGIN_MANUAL_REVIEW",
      productId: product.id,
      evidenceHash
    });
  }

  function markManualSubmit(product, evidenceHash) {
    return runtimeMessage({
      type: "CART_CONFIRM_MARK_MANUAL_SUBMIT",
      productId: product.id,
      evidenceHash
    });
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

  async function scheduleClaimRetry(product, message) {
    if (claimRetryTimer || !config?.automationEnabled || config.monitoringPaused || !product.enabled) return;
    claimRetryCount += 1;
    const delayMs = Math.min(
      CLAIM_RETRY_MAX_MS,
      CLAIM_RETRY_MIN_MS * (2 ** Math.min(2, claimRetryCount - 1))
    );
    await send("retry-scheduled", product, {
      attempt: currentAttempt(product),
      eligible: true,
      reason: "retrying",
      message: `${message} The verified offer is staying on this page and will retry its purchase claim in ${Math.ceil(delayMs / 1000)} second${delayMs >= 1_500 ? "s" : ""}; no stock-refresh slot is required.`
    }, `eligible-claim-wait:${product.id}`, Number.MAX_SAFE_INTEGER);
    const run = async () => {
      claimRetryTimer = null;
      claimRetryDue = null;
      if (!await automationStillActive(product)) {
        claimRetryCount = 0;
        return;
      }
      if (scanning) {
        void scheduleClaimRetry(product, message);
        return;
      }
      void scan();
    };
    claimRetryDue = { at: Date.now() + delayMs, run };
    claimRetryTimer = setTimeout(run, delayMs);
  }

  async function scheduleRetry(product, message, destination = "reload", errorBackoff = false, cadence = "normal") {
    if (ScheduleGate.calendarOwned(product)) {
      clearRetry();
      return;
    }
    if (!config?.automationEnabled || config?.monitoringPaused || !product.enabled || retryTimer) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed || !state.armed) return;
    if (Number.isInteger(state.attempts)) attemptCache.set(product.id, state.attempts);
    if (state.budgetReason) {
      await requireAttempt(product);
      return;
    }
    if (["intent", "uncertain"].includes(state.submission?.phase)) return;

    // Observation navigation is not a purchase attempt. Attempts are charged
    // only immediately before an add, checkout, quantity, or final-submit
    // action. Watchers continue until Stop, while every refresh still shares
    // the fixed rolling-hour per-store traffic budget.
    const attempt = currentAttempt(product) + 1;
    const watcherMode = !isBlitz(product);
    const eligibilityCadence = !watcherMode && cadence === "eligibility";
    const baseSeconds = watcherMode
      ? watcherIntervalSeconds()
      : eligibilityCadence
        ? Math.max(2, Number(config.eligibilityRefreshIntervalSeconds || 2))
        : Math.max(5, Number(config.retryIntervalSeconds || 15));
    const multiplier = watcherMode
      ? 1
      : errorBackoff
        ? Math.min(8, 2 ** Math.min(3, Math.floor((attempt - 1) / 3)))
        : Math.min(3, 1 + Math.floor(attempt / 20));
    const jitter = watcherMode ? 0 : Math.floor(Math.random() * Math.max(1, baseSeconds * 0.2));
    const delayMs = (baseSeconds * multiplier + jitter) * 1000;
    const reservationId = `${config.automationRunId || "run"}:${product.id}:${attempt}:${Date.now()}`;
    const reservation = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_NAVIGATION",
      retailer,
      productId: product.id,
      reservationId,
      cadence: eligibilityCadence ? "eligibility" : "normal",
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
    retryReservationId = reservationId;
    retryReservationProductId = product.id;
    await send("retry-scheduled", product, {
      attempt,
      reason: "retrying",
      message
    }, `retry:${product.id}:${attempt}`, 0);

    const navigateWhenAllowed = async () => {
      retryTimer = null;
      if (retryReservationId === reservationId) {
        retryReservationId = "";
        retryReservationProductId = "";
      }
      const traffic = await runtimeMessage({
        type: "CART_CONFIRM_REVALIDATE_NAVIGATION",
        retailer,
        productId: product.id,
        reservationId
      });
      if (!traffic.ok) {
        if (traffic.reason === "not-ready" && traffic.waitMs > 0) {
          retryReservationId = reservationId;
          retryReservationProductId = product.id;
          armNavigationRetry(navigateWhenAllowed, traffic.waitMs);
        } else if (traffic.reason === "reservation-missing") {
          await scheduleRetry(product, "A throttled browser timer expired its traffic slot; reserving a fresh one.", destination, errorBackoff, cadence);
        } else if (["traffic-budget-exhausted", "traffic-overload"].includes(traffic.reason)) {
          await send("automation-blocked", product, {
            reason: traffic.reason,
            message: traffic.reason === "traffic-budget-exhausted"
              ? `${adapter.label} reached the fixed 120-action rolling-hour budget. The watcher will resume when capacity returns.`
              : `${adapter.label} is still in overload cooldown. The watcher will resume when the cooldown ends.`
          }, `traffic-gate:${product.id}:${traffic.reason}`, 60_000);
          if (watcherMode) {
            const retryDelayMs = Math.max(
              watcherIntervalSeconds() * 1000,
              Number(traffic.waitMs || 0),
              Number(traffic.retryAt || 0) - Date.now()
            );
            armNavigationRetry(() => {
              retryTimer = null;
              void scheduleRetry(product, message, destination, errorBackoff, cadence);
            }, retryDelayMs);
          }
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
      const nextProduct = (nextConfig?.products || []).find((candidate) => candidate.id === product.id);
      if (
        !nextConfig?.automationEnabled
        || nextConfig.monitoringPaused
        || !nextProduct?.enabled
        || ScheduleGate.calendarOwned(nextProduct)
      ) return;
      config = nextConfig;
      const nextState = await productAutomationState(product);
      if (!nextState.ok || nextState.completed || adapter.securityChallenge(document)) return;
      if (destination === "product") location.assign(product.openUrl || product.productUrl);
      else if (destination === "cart") location.assign(adapter.cartUrl);
      else location.reload();
    };
    armNavigationRetry(navigateWhenAllowed, reservation.waitMs);
  }

  async function scheduleTargetPersistenceNavigation(product, message, destination, kind, delayMs = null) {
    if (product.retailer !== "target" || !isBlitz(product)) return false;
    if (!config?.automationEnabled || config.monitoringPaused || !product.enabled || retryTimer) return true;
    const persistence = await reserveTargetPersistence(product, kind);
    if (!persistence.ok) return true;
    await send("automation-status", product, {
      attempt: currentAttempt(product),
      message: `${message} Target persistence ${kind} ${persistence.attempt} is queued.`
    }, `target-persistence:${product.id}:${kind}:${persistence.attempt}`, 0);
    const navigationDelayMs = delayMs === null
      ? targetPersistenceRetryMs()
      : Math.max(0, Number(delayMs) || 0);
    armNavigationRetry(async () => {
      retryTimer = null;
      if (!await automationStillActive(product) || adapter.securityChallenge(document)) return;
      if (!await requireStoreAction(product, kind, true)) return;
      if (destination === "product") location.assign(product.openUrl || product.productUrl);
      else if (destination === "cart") location.assign(adapter.cartUrl);
      else location.reload();
    }, navigationDelayMs);
    return true;
  }

  async function navigateOnce(product, destination, kind) {
    if (!await requireStoreAction(product, kind)) return false;
    if (!await automationStillActive(product)) return false;
    if (destination === "product") location.assign(product.openUrl || product.productUrl);
    else if (destination === "cart") location.assign(adapter.cartUrl);
    else location.reload();
    return true;
  }

  // Bounded selection of the mission's configured fulfillment METHOD
  // (shipping vs pickup) when the page stalls on a method/location prompt.
  // This only toggles between options the account already holds; choosing a
  // store, entering a zip, or sharing a location remains strictly manual.
  const FULFILLMENT_SELECT_LIMIT = 3;
  const fulfillmentSelectAttempts = new Map();

  async function selectConfiguredFulfillment(product) {
    if (!["shipping", "pickup"].includes(product.fulfillmentMode)) return false;
    const attemptKey = `${config?.automationRunId || "run"}:${product.id}:${pageAddress()}`;
    if ((fulfillmentSelectAttempts.get(attemptKey) || 0) >= FULFILLMENT_SELECT_LIMIT) return false;
    const control = adapter.fulfillmentOptionControl?.(document, product.fulfillmentMode);
    if (!control) return false;
    fulfillmentSelectAttempts.set(attemptKey, (fulfillmentSelectAttempts.get(attemptKey) || 0) + 1);
    if (!await clickAction(control, product)) return false;
    await send("automation-status", product, {
      message: `Selected this mission's configured ${product.fulfillmentMode} option; store, zip, and location choices are never made automatically.`
    }, `fulfillment-select:${attemptKey}:${fulfillmentSelectAttempts.get(attemptKey)}`, 0);
    scheduleScan(1_500);
    return true;
  }

  async function dismissTargetStoreError(product) {
    if (product.retailer !== "target") return false;
    const button = adapter.storeErrorDismissButton?.(document);
    return button ? clickAction(button, product) : false;
  }

  async function recoverTargetAddError(product, state, error) {
    if (
      product.retailer !== "target"
      || !isBlitz(product)
      || state?.addAction?.phase !== "clicked"
      || !["traffic-overload", "store-error"].includes(error)
      || !adapter.storeErrorDismissButton?.(document)
    ) return false;
    if (!await dismissTargetStoreError(product)) return false;
    const failed = await markAddAction(product, "failed");
    if (!failed.ok) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: "Target explicitly rejected Add to cart, but its durable add receipt could not be reopened for a retry."
      }, `target-add-recovery-state:${product.id}:${failed.reason}`, Number.MAX_SAFE_INTEGER);
      return true;
    }
    await send("automation-status", product, {
      attempt: currentAttempt(product),
      message: "Target explicitly rejected Add to cart. The error was dismissed and the exact item remains absent, so the bounded Add persistence loop will try again."
    }, `target-add-rejected:${product.id}:${state.addAction.updatedAt}:${error}`, 0);
    scheduleScan(targetPersistenceRetryMs());
    return true;
  }

  async function clickAction(element, product, beforeClick = null, options = {}) {
    if (!Retailers.isActionable(element)) return false;
    element.scrollIntoView?.({ block: "center", inline: "nearest" });
    element.focus?.({ preventScroll: true });
    await sleep(80);
    if (!Retailers.isActionable(element) || adapter.securityChallenge(document)) return false;
    // Stop can arrive while a scan is between awaits. Re-read the desktop
    // gate at the final click boundary so stale in-tab state cannot act.
    if (options.finalAutomationCheck !== false && !await automationStillActive(product)) return false;
    // A final-submit callback ends by creating its durable intent. Keep that
    // response directly adjacent to the click instead of adding another await.
    if (beforeClick && !await beforeClick()) return false;
    if (!Retailers.isActionable(element) || adapter.securityChallenge(document)) return false;
    try {
      element.click();
      return true;
    } catch {
      return false;
    }
  }

  async function waitForTargetCartCountIncrease(previousCount) {
    const deadline = Date.now() + TARGET_ADD_CONFIRMATION_WAIT_MS;
    while (Date.now() < deadline) {
      const currentCount = adapter.cartItemCount?.(document);
      if (
        Number.isInteger(previousCount)
        && Number.isInteger(currentCount)
        && currentCount > previousCount
      ) return currentCount;
      await sleep(Math.min(TARGET_CART_COUNT_POLL_MS, Math.max(0, deadline - Date.now())));
    }
    return null;
  }

  function setNativeValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function authorizeQuantityAction(product, kind) {
    const persistence = await reserveTargetPersistence(product, "quantity");
    if (!persistence.ok) return false;
    return requireStoreAction(product, kind, persistence.targetPersistence === true);
  }

  async function ensureQuantity(product, line) {
    const acceptPartial = acceptsPartialQuantity(product);
    const limit = configuredQuantityLimit(product);
    if (!acceptPartial && product.quantity > limit) {
      return { ok: false, blocked: true, reason: "quantity-limit" };
    }
    const desired = acceptPartial ? Math.max(1, Math.min(product.quantity, limit)) : product.quantity;
    if (line.quantity === desired) {
      partialRaiseAttempts.delete(product.id);
      return { ok: true, quantity: desired, partial: desired < product.quantity };
    }
    // Partial settling only ever accepts a smaller quantity that is already
    // visibly secured on the cart line after raising it has been attempted;
    // it never invents a quantity and never settles above the desired count.
    const settled = () => {
      if (!acceptPartial || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity >= desired) return null;
      partialRaiseAttempts.delete(product.id);
      return { ok: true, quantity: line.quantity, partial: true };
    };
    const pendingOrSettle = () => {
      const attempts = (partialRaiseAttempts.get(product.id) || 0) + 1;
      partialRaiseAttempts.set(product.id, attempts);
      if (attempts > PARTIAL_RAISE_ATTEMPT_LIMIT) {
        const settle = settled();
        if (settle) return settle;
      }
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    };
    const { select, input, increase, decrease } = line.controls || {};

    if (select) {
      const optionValue = (candidate) => Number.parseInt(candidate.value || candidate.textContent, 10);
      let option = [...select.options].find((candidate) => optionValue(candidate) === desired);
      if (!option && acceptPartial) {
        const currentQuantity = Number.isInteger(line.quantity) ? line.quantity : 0;
        option = [...select.options]
          .filter((candidate) => {
            const value = optionValue(candidate);
            return Number.isInteger(value) && value >= 1 && value < desired && value > currentQuantity;
          })
          .sort((a, b) => optionValue(b) - optionValue(a))[0];
        if (!option) return settled() || { ok: false, reason: "quantity-unavailable" };
      }
      if (!option) return { ok: false, reason: "quantity-unavailable" };
      if (!await authorizeQuantityAction(product, "quantity-change")) return { ok: false, blocked: true };
      if (!await automationStillActive(product)) return { ok: false, blocked: true };
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(900);
      return pendingOrSettle();
    }

    if (input) {
      if (!await authorizeQuantityAction(product, "quantity-change")) return { ok: false, blocked: true };
      if (!await automationStillActive(product)) return { ok: false, blocked: true };
      setNativeValue(input, String(desired));
      input.blur?.();
      await sleep(900);
      return pendingOrSettle();
    }

    if (Number.isInteger(line.quantity) && line.quantity < desired && increase) {
      if (!await authorizeQuantityAction(product, "quantity-increase")) return { ok: false, blocked: true };
      await clickAction(increase, product);
      return pendingOrSettle();
    }
    if (Number.isInteger(line.quantity) && line.quantity > desired && decrease) {
      if (!await authorizeQuantityAction(product, "quantity-decrease")) return { ok: false, blocked: true };
      await clickAction(decrease, product);
      return { ok: false, pending: true, reason: "quantity-unavailable" };
    }
    return settled() || { ok: false, reason: "quantity-unavailable" };
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
    const queue = adapter.queueState?.(location.href, document, product);
    if (!queue) return false;
    clearRetry();
    clearQueueCaptureRetry();
    if (!queue.itemId || queue.itemId !== product.sku) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: !queue.itemId
          ? `${adapter.label} displayed a recognized official queue, but its item identity could not be verified. This tab is frozen and will not refresh or authorize fan-out.`
          : `${adapter.label} displayed an official queue for a different item. This tab is frozen and will not refresh or authorize fan-out.`
      }, `queue-identity-unverified:${product.id}:${queue.itemId || "unknown"}`, Number.MAX_SAFE_INTEGER);
      return true;
    }
    await send("queue-waiting", product, {
      availability: queue.soldOut ? "unavailable" : "unknown",
      reason: "retailer-queue",
      message: queue.soldOut
        ? `${adapter.label} reports that the queued item sold out. No queue request or refresh was attempted.`
        : `${adapter.label} placed this item in its official queue. The companion will not refresh, call ticket endpoints, or bypass the queue; it will resume after the store admits this tab.`
    }, `queue:${product.id}:${queue.state}:${queue.soldOut}`, 30_000);
    return true;
  }

  async function queueCaptureStillWaiting(product, nextConfig) {
    config = nextConfig;
    const nextProduct = (config?.products || []).find((candidate) => candidate.id === product.id);
    const capture = QueueCapture.captureForProduct(config, nextProduct);
    if (!capture || capture.winnerProductId === product.id || !nextProduct?.enabled) return null;
    if (adapter.pageKind(location.href, document, nextProduct) === "queue") {
      await handleRetailerQueue(nextProduct);
      return null;
    }
    return { capture, product: nextProduct };
  }

  async function finishQueueCaptureNavigation(product, reservationId) {
    const nextConfig = await requestConfig(true);
    const waiting = await queueCaptureStillWaiting(product, nextConfig);
    if (!waiting || adapter.securityChallenge(document)) {
      clearQueueCaptureRetry();
      return;
    }
    const traffic = await runtimeMessage({
      type: "CART_CONFIRM_REVALIDATE_NAVIGATION",
      retailer,
      productId: product.id,
      reservationId
    });
    if (!traffic.ok) {
      if (traffic.reason === "not-ready" && traffic.waitMs > 0) {
        queueCaptureTimer = setTimeout(
          () => void finishQueueCaptureNavigation(product, reservationId),
          traffic.waitMs
        );
        return;
      }
      await send("automation-blocked", product, {
        reason: ["traffic-budget-exhausted", "traffic-overload"].includes(traffic.reason)
          ? traffic.reason
          : "manual-action-required",
        message: "The bounded Walmart queue-capture reload stopped because the traffic governor could not revalidate it."
      }, `queue-capture-revalidation:${product.id}:${traffic.reason}`, Number.MAX_SAFE_INTEGER);
      clearQueueCaptureRetry();
      return;
    }
    const finalConfig = await requestConfig(true);
    const finalWaiting = await queueCaptureStillWaiting(waiting.product, finalConfig);
    if (!finalWaiting || adapter.securityChallenge(document)) {
      clearQueueCaptureRetry();
      return;
    }
    const maximum = QueueCapture.maxReloads(config);
    if (maximum === 0) {
      clearQueueCaptureRetry();
      return;
    }
    const durableAttempt = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_QUEUE_CAPTURE_ATTEMPT",
      productId: finalWaiting.product.id,
      reservationId
    });
    if (!durableAttempt.ok) {
      clearQueueCaptureRetry();
      return;
    }
    const attempts = durableAttempt.attempts;
    void send("automation-status", finalWaiting.product, {
      message: `Walmart queue capture reload ${attempts} of ${maximum} is starting after the page-settle check.`
    }, `queue-capture-reload:${finalWaiting.capture.runId}:${finalWaiting.product.id}:${attempts}`, Number.MAX_SAFE_INTEGER);
    location.reload();
  }

  async function beginQueueCaptureRetry(product) {
    queueCaptureTimer = null;
    queueCaptureInFlight = true;
    const nextConfig = await requestConfig(true);
    const waiting = await queueCaptureStillWaiting(product, nextConfig);
    if (!waiting || adapter.securityChallenge(document)) {
      clearQueueCaptureRetry();
      return;
    }
    const maximum = QueueCapture.maxReloads(config);
    if (maximum === 0) {
      await send("automation-status", waiting.product, {
        message: "Walmart queue-capture loser reloads are disabled (0). This tab will not refresh."
      }, `queue-capture-stopped:${waiting.capture.runId}:${waiting.product.id}`, Number.MAX_SAFE_INTEGER);
      clearQueueCaptureRetry();
      return;
    }
    const reservationId = `${waiting.capture.cohortId}:${waiting.product.id}:queue-capture:${crypto.randomUUID()}`;
    const reservation = await runtimeMessage({
      type: "CART_CONFIRM_RESERVE_NAVIGATION",
      retailer,
      productId: waiting.product.id,
      reservationId,
      cadence: "eligibility",
      notBefore: Date.now()
    });
    if (!reservation.ok) {
      await send("automation-blocked", waiting.product, {
        reason: reservation.reason === "traffic-budget-exhausted" ? reservation.reason : "manual-action-required",
        message: "The bounded Walmart queue-capture reload stopped because the traffic governor could not reserve it."
      }, `queue-capture-reservation:${waiting.product.id}:${reservation.reason}`, Number.MAX_SAFE_INTEGER);
      clearQueueCaptureRetry();
      return;
    }
    queueCaptureTimer = setTimeout(
      () => void finishQueueCaptureNavigation(waiting.product, reservationId),
      Math.max(0, Number(reservation.waitMs || 0))
    );
  }

  function handleQueueCaptureRetry(product) {
    const capture = QueueCapture.captureForProduct(config, product);
    if (!capture) return false;
    clearRetry();
    if (capture.winnerProductId === product.id) {
      clearQueueCaptureRetry();
      return true;
    }
    if (!queueCaptureTimer && !queueCaptureInFlight) {
      queueCaptureTimer = setTimeout(
        () => void beginQueueCaptureRetry(product),
        QueueCapture.PAGE_SETTLE_MS
      );
    }
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
    let state = null;
    const error = adapter.storeError(document);
    if (config.automationEnabled && product.enabled) {
      state = await productAutomationState(product);
      const addPhase = state.ok ? String(state.addAction?.phase || "idle") : "idle";
      if (addPhase !== "idle") requestPurchaseTabActivation(product);
      if (addPhase === "clicked" && product.retailer === "target") {
        if (await recoverTargetAddError(product, state, error)) return;
        const settleRemaining = Math.max(
          0,
          TARGET_ADD_CONFIRMATION_WAIT_MS - (Date.now() - Number(state.addAction.updatedAt || 0))
        );
        if (settleRemaining > 0) {
          scheduleScan(settleRemaining);
          return;
        }
        if (await scheduleTargetPersistenceNavigation(
          product,
          error
            ? "Target did not explicitly prove whether Add succeeded; opening the cart to verify the exact TCIN before any new Add click."
            : "Target accepted the Add click without a visible rejection; opening the cart to verify the exact TCIN.",
          "cart",
          "cart"
        )) return;
        await navigateOnce(product, "cart", "cart-verification");
        return;
      }
      if (["reserved", "clicked"].includes(addPhase)) {
        clearRetry();
        await send("automation-status", product, {
          message: addPhase === "clicked"
            ? `${adapter.label} Add to cart is already in flight. Cart Confirm is waiting to verify the cart without clicking again.`
            : `${adapter.label} Add to cart is reserved by this mission. Duplicate page scans will not click it again.`
        }, `add-in-flight:${product.id}:${addPhase}`, Number.MAX_SAFE_INTEGER);
        return;
      }
      if (addPhase === "confirmed") {
        if (product.retailer === "target") {
          if (await scheduleTargetPersistenceNavigation(
            product,
            "The exact Target item is already confirmed in the cart; returning there without another Add click.",
            "cart",
            "cart"
          )) return;
          await navigateOnce(product, "cart", "cart-navigation");
          return;
        }
        await scheduleRetry(
          product,
          `The exact item was already confirmed in the ${adapter.label} cart; returning there without adding it again.`,
          "cart"
        );
        return;
      }
    }
    // An unavailable product is normal monitoring state, not a store failure.
    // Let the offer adapter report it as out of stock and schedule a standard
    // bounded refresh instead of entering the error path.
    if (error && error !== "out-of-stock") {
      if (product.retailer === "target" && isBlitz(product) && config.automationEnabled && product.enabled) {
        const dismissed = await dismissTargetStoreError(product);
        await send("automation-status", product, {
          attempt: currentAttempt(product),
          message: dismissed
            ? "Target's overload/error dialog was dismissed; the bounded Add persistence loop will re-check the same exact item."
            : "Target returned an overload/error page; the bounded Add persistence loop will reload it."
        }, `target-product-error:${product.id}:${error}:${dismissed}`, 2_000);
        if (dismissed) {
          const persistence = await reserveTargetPersistence(product, "add");
          if (persistence.ok) scheduleScan(targetPersistenceRetryMs());
        } else {
          await scheduleTargetPersistenceNavigation(product, "Retrying the Target product page after overload.", "reload", "add");
        }
        return;
      }
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
    // Start reporting immediately but do not await it on the purchase path.
    void send("availability", product, {
      availability: offer.available ? "available" : "unavailable"
    }, `availability:${product.id}:${offer.available}`, OBSERVATION_DEDUPE_MS);
    const eligibleMessage = result.eligible
      ? !config.automationEnabled
        ? `${adapter.label} verified an eligible first-party offer at $${offer.price.toFixed(2)}. Test mode is observation-only, so no purchase action was attempted.`
        : product.action === "watch"
          ? `${adapter.label} verified an eligible first-party offer at $${offer.price.toFixed(2)}. This mission is Watch & alert only, so no purchase action was attempted.`
          : `${adapter.label} verified an eligible first-party offer at $${offer.price.toFixed(2)}. Autopilot is starting the ${product.action === "cart" ? "add-to-cart" : product.action === "review" ? "checkout-review" : "auto-buy"} workflow.`
      : "";
    const offerReport = send("offer-observed", product, {
      availability: offer.available ? "available" : "unavailable",
      price: offer.price === null ? undefined : offer.price,
      seller: offer.seller,
      firstParty: offer.firstParty,
      eligible: result.eligible,
      reason: result.reason,
      attempt: currentAttempt(product),
      message: eligibleMessage
    }, `offer:${product.id}:${offer.price}:${offer.seller}:${result.reason}:${eligibleMessage}`, OBSERVATION_DEDUPE_MS);

    if (!config.automationEnabled || !product.enabled) return;
    if (!state) state = await productAutomationState(product);
    if (!state.ok) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        message: `Autopilot could not read this mission's durable state (${state.reason || "unknown state error"}). Its store lane was released so the remaining missions can continue.`
      }, `product-state-error:${product.id}:${state.reason}`, 30_000);
      return;
    }
    if (state.completed) {
      await send("automation-status", product, {
        message: "This mission is already complete for the current Autopilot run, so Cart Confirm will not purchase it twice."
      }, `already-completed:${product.id}:${config.automationRunId}`, Number.MAX_SAFE_INTEGER);
      return;
    }

    if (!result.eligible) {
      clearClaimRetry();
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
      const waitingSeconds = isBlitz(product)
        ? Math.max(2, Number(config.eligibilityRefreshIntervalSeconds || 2))
        : watcherIntervalSeconds();
      await scheduleRetry(
        product,
        `Waiting for an eligible ${adapter.label} first-party offer. ${adapter.label} is checking this ${isBlitz(product) ? "blitz" : "watcher"} mission every ${waitingSeconds} seconds.`,
        "reload",
        false,
        "eligibility"
      );
      return;
    }

    if (product.action === "watch") {
      clearClaimRetry();
      await scheduleRetry(product, `Watching this ${adapter.label} item; alerts fire while it stays eligible.`);
      return;
    }

    // Publish Processing as soon as the exact offer qualifies. This status is
    // intentionally non-blocking and is not part of the milestone Activity
    // feed; durable preparation below still gates every possible cart click.
    void send("automation-status", product, {
      eligible: true,
      reason: "retrying",
      message: `${adapter.label} qualified this exact item and is preparing the authorized Add to cart action now.`
    }, `qualified-processing:${product.id}:${offer.price}`, Number.MAX_SAFE_INTEGER);
    requestPurchaseTabActivation(product);

    // A qualified purchase mission no longer needs its pending stock-refresh
    // navigation. Cancel both the tab timer and its durable traffic slot before
    // claiming the cart lane so an obsolete reload cannot interrupt Add or
    // delay the remaining products.
    clearNavigationRetry();
    if (!await requireQuantityWithinLimits(product)) return;

    const prepared = await prepareAddAction(product, offer);
    if (!prepared.ok) {
      if (prepared.reason === "submission-uncertain") {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: "A prior order submission is uncertain and remains locked for manual review."
        }, `claim-uncertain:${product.id}`, 60_000);
      } else if (prepared.reason === "completed") {
        await send("automation-status", product, {
          message: "This mission completed in another tab during the current Autopilot run, so no duplicate action was taken."
        }, `claim-completed:${product.id}:${config.automationRunId}`, Number.MAX_SAFE_INTEGER);
      } else if (["add-in-flight", "cart-confirmed"].includes(prepared.reason)) {
        await offerReport;
        await send("automation-status", product, {
          eligible: true,
          reason: "retrying",
          message: prepared.reason === "cart-confirmed"
            ? `The exact item is already confirmed in the ${adapter.label} cart; it will not be added twice.`
            : `${adapter.label} Add to cart is already in flight; duplicate page scans will not click it again.`
        }, `claim-add-state:${product.id}:${prepared.reason}`, Number.MAX_SAFE_INTEGER);
      } else if (["store-busy", "product-busy"].includes(prepared.reason) && prepared.held) {
        await offerReport;
        await send("automation-blocked", product, {
          eligible: true,
          reason: "manual-action-required",
          releaseLane: false,
          message: `${adapter.label}'s purchase lane is held by ${prepared.activeProductId || "another configured item"} after a possible cart mutation (${prepared.blockingPhase || "held state"}). Autopilot will not preempt it; this verified offer stays on the page and re-checks the lane automatically.`
        }, `claim-held:${product.id}:${prepared.activeProductId}:${prepared.blockingPhase}`, Number.MAX_SAFE_INTEGER);
        await scheduleClaimRetry(product, `${adapter.label}'s purchase lane is finishing ${prepared.activeProductId || "another configured item"} first.`);
      } else if (["store-busy", "product-busy"].includes(prepared.reason)) {
        await offerReport;
        await scheduleClaimRetry(product, prepared.reason === "store-busy"
          ? `${adapter.label} is processing another configured product in this store.`
          : "Another tab is already processing this configured product.");
      } else {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: `Autopilot could not prepare this mission's add-to-cart boundary (${prepared.reason || "unknown state error"}). Its pre-click store lane was released so the remaining missions can continue.`
        }, `add-preparation-error:${product.id}:${prepared.reason}`, 30_000);
      }
      return;
    }

    clearClaimRetry();
    setActiveProduct(product);
    const addPersistence = await reserveTargetPersistence(product, "add");
    if (!addPersistence.ok) {
      await markAddAction(product, "canceled");
      return;
    }
    if (!await requireStoreAction(
      product,
      addPersistence.targetPersistence === true ? "add" : "add-to-cart",
      addPersistence.targetPersistence === true
    )) {
      await markAddAction(product, "canceled");
      return;
    }
    const targetCartCountBeforeAdd = product.retailer === "target"
      ? adapter.cartItemCount?.(document)
      : null;
    let attempt = null;
    let addAuthorizationReason = "";
    const clicked = await clickAction(offer.addButton, product, async () => {
      const authorization = await authorizeAddClick(product);
      if (!authorization.ok) {
        addAuthorizationReason = String(authorization.reason || "add-authorization-failed");
        return false;
      }
      attempt = authorization.attempt;
      return true;
    }, { finalAutomationCheck: false });
    if (!clicked) {
      await markAddAction(product, "canceled");
      if (["disarmed", "product-disabled"].includes(addAuthorizationReason)) return;
      if (addAuthorizationReason === "add-reservation-expired") {
        await scheduleClaimRetry(product, "The pre-click reservation expired before any Target action, so Autopilot safely reopened the lane.");
        return;
      }
      if (addAuthorizationReason) {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: `The final add-to-cart authorization failed (${addAuthorizationReason}). No Add click was made.`
        }, `add-authorization:${product.id}:${addAuthorizationReason}`, 30_000);
        return;
      }
      await send("store-error", product, {
        attempt: currentAttempt(product),
        reason: "store-error",
        message: "The eligible Add to cart control was no longer actionable."
      }, `add-failed:${product.id}:${currentAttempt(product)}`, 0);
      await scheduleRetry(product, "Add to cart changed before it could be selected.", "reload", true);
      return;
    }

    const clickMarked = await markAddAction(product, "clicked");
    if (!clickMarked.ok) {
      await send("automation-blocked", product, {
        attempt,
        reason: "manual-action-required",
        releaseLane: false,
        message: "Add to cart was selected, but its durable in-flight receipt could not be confirmed. Automatic retry is stopped to prevent a duplicate cart quantity."
      }, `add-receipt-uncertain:${product.id}:${attempt}`, Number.MAX_SAFE_INTEGER);
      return;
    }
    quantityRechecks.delete(product.id);
    missingCartLineSince.delete(product.id);
    void send("add-clicked", product, {
      attempt,
      price: offer.price,
      seller: offer.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible"
    }, `add-clicked:${product.id}:${attempt}`, 0);
    const targetCartCount = product.retailer === "target"
      ? await waitForTargetCartCountIncrease(targetCartCountBeforeAdd)
      : null;
    if (product.retailer !== "target") await sleep(ADD_SETTLE_MS);
    if (await handleChallenge(product)) return;
    if (Number.isInteger(targetCartCount)) {
      void send("cart-count-increased", product, {
        attempt,
        cartCount: targetCartCount,
        eligible: true,
        reason: "eligible",
        message: `Target's visible cart count increased to ${targetCartCount}; opening the cart now to verify the exact TCIN.`
      }, `target-cart-count-increased:${product.id}:${attempt}:${targetCartCount}`, 0);
      if (await scheduleTargetPersistenceNavigation(
        product,
        "Target's visible cart count increased after Add; verifying the exact TCIN now.",
        "cart",
        "cart",
        0
      )) return;
      await navigateOnce(product, "cart", "cart-verification");
      return;
    }
    const postAddError = adapter.storeError(document);
    const postAddState = await productAutomationState(product);
    if (await recoverTargetAddError(product, postAddState, postAddError)) return;
    if (product.retailer === "target") {
      if (await scheduleTargetPersistenceNavigation(
        product,
        postAddError
          ? "Target did not explicitly prove whether Add succeeded; verifying the exact TCIN in the cart."
          : "Target did not show an Add rejection; verifying the exact TCIN in the cart.",
        "cart",
        "cart",
        0
      )) return;
      await navigateOnce(product, "cart", "cart-verification");
      return;
    }
    if (!await requireStoreAction(product, "cart-navigation")) {
      await scheduleRetry(
        product,
        `Waiting for ${adapter.label} to recover before verifying the cart. Add to cart remains in flight and will not be clicked again.`,
        "cart",
        true
      );
      return;
    }
    if (!await automationStillActive(product)) return;
    location.assign(adapter.cartUrl);
  }

  async function handleCartPage(product) {
    const error = adapter.storeError(document);
    if (error) {
      if (product.retailer === "target" && error === "out-of-stock") {
        await markAddAction(product, "failed");
      }
      if (product.retailer === "target" && isBlitz(product) && config.automationEnabled && product.enabled) {
        const dismissed = await dismissTargetStoreError(product);
        await send("automation-status", product, {
          attempt: currentAttempt(product),
          message: dismissed
            ? "Target's cart error was dismissed; the bounded cart persistence loop will verify the exact TCIN again."
            : "Target's cart is overloaded; the bounded cart persistence loop will reopen it."
        }, `target-cart-error:${product.id}:${error}:${dismissed}`, 2_000);
        await scheduleTargetPersistenceNavigation(
          product,
          error === "out-of-stock" ? "Returning to the exact Target product after it left the cart." : "Retrying the Target cart after overload.",
          error === "out-of-stock" ? "product" : "reload",
          error === "out-of-stock" ? "add" : "cart"
        );
        return;
      }
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

    // A finished mission whose cart tab stays open (the operator is buying
    // manually) must go quiet: repeating its cart alarm every minute and
    // re-activating its tab every ten seconds both harasses the operator and
    // permanently stands down the check rotation, starving every other
    // mission's stock detection.
    const addState = await productAutomationState(product);
    if (addState.ok && addState.completed) return;

    if (config.automationEnabled) requestPurchaseTabActivation(product);

    // Alert the operator the moment the cart page is on screen for a purchase
    // mission, before line and quantity verification finish, so they are
    // ready to complete the order without waiting for full confirmation.
    if (["cart", "review", "checkout"].includes(product.action)) {
      void send("cart-reached", product, {
        message: `${adapter.label}'s cart page is open for this mission. Get ready to complete the purchase.`
      }, `cart-reached:${product.id}`, 60_000);
    }

    const inventory = adapter.cartInventory(document);
    const line = adapter.findLine(document, product);
    if (!line) {
      const now = Date.now();
      const missingSince = missingCartLineSince.get(product.id) || now;
      missingCartLineSince.set(product.id, missingSince);
      const confirmationWaitMs = product.retailer === "target"
        ? TARGET_CART_LINE_CONFIRMATION_WAIT_MS
        : CART_LINE_CONFIRMATION_WAIT_MS;
      if (now - missingSince < confirmationWaitMs) {
        await send("automation-status", product, {
          message: `Waiting for the exact ${adapter.label} cart line to finish loading. A new Add click is allowed only if the fully loaded cart proves that exact SKU is absent.`
        }, `cart-line-hydrating:${product.id}`, Number.MAX_SAFE_INTEGER);
        scheduleScan(750);
        return;
      }
      const pageText = Retailers.textOf(document.body);
      const exactSkuAbsent = inventory.complete && !inventory.ids.includes(product.sku);
      const visibleCartCount = adapter.cartItemCount?.(document);
      const cartClearlyEmpty = visibleCartCount === 0
        || /(?:your )?cart is empty|no items in (?:your )?cart|cart has no items/i.test(pageText);
      if (exactSkuAbsent || cartClearlyEmpty) {
        const failed = await markAddAction(product, "failed");
        if (!failed.ok) {
          await send("automation-blocked", product, {
            reason: "manual-action-required",
            releaseLane: false,
            message: "The cart does not show the exact configured SKU, but the in-flight add could not be cleared safely. Review the cart manually."
          }, `missing-cart-line-uncertain:${product.id}`, Number.MAX_SAFE_INTEGER);
          return;
        }
        missingCartLineSince.delete(product.id);
        await send("store-error", product, {
          reason: "unmatched-product",
          message: "The fully loaded cart does not contain the exact configured SKU, so the add receipt was cleared before a bounded retry."
        }, `missing-cart-line:${product.id}`, 10_000);
        if (config.automationEnabled) {
          if (!await scheduleTargetPersistenceNavigation(
            product,
            "The exact Target cart line is absent; returning for another bounded Add attempt.",
            "product",
            "add"
          )) {
            await scheduleRetry(product, "The exact cart line was not added; returning to the product for one bounded retry.", "product", true);
          }
        }
        return;
      }
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        releaseLane: false,
        message: "The exact configured SKU could not be verified in the cart. Automatic retry remains locked to prevent a duplicate quantity; review the cart manually."
      }, `missing-cart-line-unverifiable:${product.id}`, Number.MAX_SAFE_INTEGER);
      return;
    }
    missingCartLineSince.delete(product.id);

    // Cart lines often omit the seller for first-party items and show a
    // quantity-multiplied subtotal instead of the unit price. The durable
    // product-page proof (same run, same product, bounded age) backfills the
    // verified seller and unit price exactly as the checkout review does; a
    // visible third-party seller on the line still blocks unconditionally.
    const safeLine = Safety.effectiveLineOffer(product, line, await proofFor(product), await staleProofFor(product));
    if (!safeLine.ok) {
      await send("automation-blocked", product, {
        price: safeLine.price,
        seller: safeLine.seller,
        firstParty: safeLine.firstParty,
        eligible: false,
        reason: safeLine.reason,
        message: safeLine.reason === "over-price"
          ? `The cart line's unit price is above the $${product.maxPrice.toFixed(2)} cap. Manual review is required.`
          : safeLine.reason === "price-unavailable"
            ? "The cart line does not show a readable unit price and no recent product-page price proof exists. Manual review is required."
          : safeLine.reason === "third-party"
            ? "The cart line shows a third-party seller. Manual review is required."
            : "The cart line's first-party seller could not be verified here or on the recent product page. Manual review is required."
      }, `unsafe-cart-line:${product.id}:${safeLine.reason}`, 30_000);
      return;
    }

    const clickedAddAwaitingConfirmation = addState.ok && addState.addAction?.phase === "clicked";
    if (addState.ok && addState.addAction?.phase === "reserved") {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        releaseLane: false,
        message: "The cart loaded before the add click receipt was finalized. Automatic checkout is stopped for manual review."
      }, `cart-add-reservation-pending:${product.id}`, Number.MAX_SAFE_INTEGER);
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
      if (quantity.blocked) {
        const effectiveLimit = configuredQuantityLimit(product);
        await send("automation-blocked", product, {
          price: safeLine.price,
          seller: safeLine.seller,
          firstParty: true,
          eligible: false,
          reason: "quantity-limit",
          quantity: product.quantity,
          message: `${adapter.label} limits this item to ${effectiveLimit}, below configured quantity ${product.quantity}. The item may already be in the cart, so the mission remains held for deliberate operator review; Cart Confirm did not silently reduce it.`
        }, `cart-quantity-limit:${product.id}:${product.quantity}:${effectiveLimit}`, Number.MAX_SAFE_INTEGER);
        return;
      }
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

    // A durable cart confirmation requires both a genuine cart-line container
    // and the configured readable quantity. Product recommendations or a
    // partially hydrated line can no longer hold the universal store lane.
    if (clickedAddAwaitingConfirmation) {
      const confirmed = await markAddAction(product, "confirmed");
      if (!confirmed.ok) {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          releaseLane: false,
          message: "The exact item and quantity are visible in the cart, but Cart Confirm could not persist the add confirmation. Automatic checkout is stopped for manual review."
        }, `cart-add-confirmation-failed:${product.id}`, Number.MAX_SAFE_INTEGER);
        return;
      }
    }

    const securedQuantity = Number.isInteger(quantity.quantity) ? quantity.quantity : product.quantity;
    const partialQuantity = quantity.partial === true && securedQuantity < product.quantity;
    await send("quantity-updated", product, {
      quantity: securedQuantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible",
      ...(partialQuantity ? { message: `${adapter.label} allowed only ${securedQuantity} of the configured ${product.quantity}; partial quantity accepted.` } : {})
    }, `quantity-confirmed:${product.id}:${securedQuantity}`, 10_000);
    const cartReported = await send("cart-item-confirmed", product, {
      quantity: securedQuantity,
      price: safeLine.price,
      seller: safeLine.seller,
      firstParty: true,
      eligible: true,
      reason: "eligible",
      ...(partialQuantity ? { message: `The exact ${adapter.label} product is in the cart with ${securedQuantity} of ${product.quantity} (partial quantity accepted).` } : {})
    }, `cart-confirmed:${product.id}:${securedQuantity}`, 10_000);

    if (!config.automationEnabled) return;
    if (product.action === "cart") {
      if (!cartReported.ok) return;
      const completed = await completeProduct(product);
      if (completed.ok) clearActiveProduct(product);
      return;
    }

    // Checkout automation verifies the exact configured quantity end to end,
    // so a partially filled line is handed to the operator instead of being
    // pushed through checkout where the safety chain would block it opaquely.
    if (partialQuantity) {
      await send("automation-blocked", product, {
        reason: "manual-action-required",
        quantity: securedQuantity,
        message: `Only ${securedQuantity} of ${product.quantity} could be secured in the cart. The cart is ready — complete the purchase manually.`
      }, `partial-quantity-hold:${product.id}:${securedQuantity}`, Number.MAX_SAFE_INTEGER);
      return;
    }

    const cartSafety = Safety.verifySingleProductCart(product, inventory);
    if (!cartSafety.ok) {
      await send("automation-blocked", product, {
        reason: cartSafety.reason,
        message: cartSafety.reason === "cart-unverified"
          ? `Checkout stopped because the complete cart inventory could not be verified (lines ${inventory.items?.length ?? 0}, independent ${inventory.independentLineCount ?? 0}, removal ${inventory.removalLineCount ?? 0}, skus ${(inventory.ids || []).join("+") || "none"}).`
          : "Checkout stopped because this store cart contains another product or duplicate line. Remove or purchase it manually first."
      }, `cart-scope:${product.id}:${cartSafety.reason}`, 30_000);
      return;
    }
    const savedProof = await saveProof(product, safeLine, "cart", true, inventory);
    if (!savedProof.ok) return;
    await consumeDirectEntryContext(product);

    const claim = await claimProduct(product);
    if (!claim.ok) {
      return;
    }
    const checkoutButton = adapter.checkoutButton(document);
    if (!checkoutButton) {
      if (product.retailer === "target" && isBlitz(product)) {
        scheduleScan(targetPersistenceRetryMs());
        return;
      }
      await scheduleRetry(product, "Waiting for the store checkout control.", "reload", true);
      return;
    }
    const checkoutPersistence = await reserveTargetPersistence(product, "checkout");
    if (!checkoutPersistence.ok) return;
    if (!await requireStoreAction(product, "checkout", checkoutPersistence.targetPersistence === true)) return;
    const attempt = await requireAttempt(product);
    if (attempt === null) return;
    if (await clickAction(checkoutButton, product)) {
      await send("checkout-clicked", product, { attempt }, `checkout-clicked:${product.id}:${attempt}`, 0);
    } else {
      if (!await scheduleTargetPersistenceNavigation(
        product,
        "Target Checkout was not actionable; reloading the verified cart for another bounded attempt.",
        "reload",
        "checkout"
      )) {
        await scheduleRetry(product, "Checkout was not actionable.", "reload", true);
      }
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
    const destinationTexts = adapter.destinationEvidence(document, fulfillmentMode);
    const paymentInstrumentTexts = adapter.paymentInstrumentEvidence(document);
    const substitutionState = adapter.substitutionState(document, product);
    const checkoutEvidence = await Evidence.capture(product, {
      fulfillmentMode,
      destinationTexts: fulfillmentMode === "shipping" ? destinationTexts : [],
      pickupStoreTexts: fulfillmentMode === "pickup" ? destinationTexts : [],
      paymentInstrumentTexts,
      substitutionState,
      inventory,
      line,
      orderTotal
    }, fingerprintCheckoutEvidence);
    const expectedEvidence = product.checkoutEvidence;
    const evidence = await Evidence.matches(expectedEvidence, checkoutEvidence, product, config?.checkoutTrust);
    return { ...review, inventory, line, orderTotal, checkoutEvidence, evidence };
  }

  async function captureCheckoutPreflight() {
    const latest = await requestConfig(true);
    if (!latest) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };
    config = latest;
    if (config.automationEnabled) {
      return { ok: false, reason: "automation-armed", error: "Switch Autopilot off before approving checkout preflight." };
    }
    const product = activeProduct();
    if (!product || !product.enabled || product.action !== "checkout") {
      return { ok: false, reason: "product-disabled", error: "Open the checkout page for one enabled auto-submit mission." };
    }
    if (adapter.pageKind(location.href, document, product) !== "checkout") {
      return { ok: false, reason: "checkout-page-required", error: "Open this mission's final checkout review page first." };
    }
    if (adapter.securityChallenge(document)) {
      return { ok: false, reason: "manual-action-required", error: "Complete the store security challenge manually first." };
    }

    const inventory = adapter.cartInventory(document);
    const line = adapter.findLine(document, product);
    const cart = Safety.verifySingleProductCart(product, inventory);
    if (!cart.ok || !line || line.quantity !== product.quantity) {
      return { ok: false, reason: cart.reason || "quantity-unavailable", error: "The checkout page did not prove exactly one matching cart line at the configured quantity." };
    }
    const offer = Safety.effectiveLineOffer(product, line);
    if (!offer.ok) {
      return { ok: false, reason: offer.reason, error: "The checkout line did not prove an eligible first-party offer under the unit-price cap." };
    }
    const orderTotal = adapter.orderTotal(document);
    if (!Number.isFinite(orderTotal) || orderTotal <= 0 || orderTotal > product.maxOrderTotal) {
      return { ok: false, reason: Number.isFinite(orderTotal) ? "over-total" : "total-unavailable", error: "The final order total is missing or above this mission's cap." };
    }
    const unsafeChoices = adapter.unsafeOrderChoices(document);
    if (unsafeChoices.length) {
      return { ok: false, reason: "manual-action-required", error: "Disable recurring, add-on, warranty, tip, donation, or installment choices before approving." };
    }
    const fulfillmentMode = adapter.fulfillmentMode(document);
    if (fulfillmentMode !== product.fulfillmentMode) {
      return { ok: false, reason: "fulfillment-unverified", error: `Checkout did not prove the required ${product.fulfillmentMode} fulfillment mode.` };
    }
    const destinationTexts = adapter.destinationEvidence(document, fulfillmentMode);
    const paymentInstrumentTexts = adapter.paymentInstrumentEvidence(document);
    const substitutionState = adapter.substitutionState(document, product);
    const evidence = await Evidence.capture(product, {
      fulfillmentMode,
      destinationTexts: fulfillmentMode === "shipping" ? destinationTexts : [],
      pickupStoreTexts: fulfillmentMode === "pickup" ? destinationTexts : [],
      paymentInstrumentTexts,
      substitutionState,
      inventory,
      line,
      orderTotal
    }, fingerprintCheckoutEvidence);
    const validated = Evidence.validate(evidence, product);
    if (!validated.ok) {
      return {
        ok: false,
        reason: validated.reason,
        error: "Checkout did not prove the destination, complete payment set, disabled substitutions, exact cart, and capped total."
      };
    }
    // comparable() deliberately strips capturedAt and is the only evidence
    // payload allowed to cross the content-script boundary. Raw address and
    // payment text remains in this function's local memory.
    return {
      ok: true,
      productId: product.id,
      retailer: product.retailer,
      sku: product.sku,
      evidence: {
        ...Evidence.comparable(validated.evidence),
        capturedAt: new Date().toISOString()
      }
    };
  }

  async function reviewEvidenceHash(product, review) {
    const canonical = JSON.stringify({
      normalizerVersion: 1,
      path: location.pathname,
      productId: product.id,
      quantity: product.quantity,
      maxPrice: product.maxPrice,
      maxOrderTotal: product.maxOrderTotal,
      inventoryComplete: review.inventory?.complete === true,
      inventoryIds: (review.inventory?.items || []).map((item) => item.sku),
      lineQuantity: review.line?.quantity,
      linePrice: review.price,
      evidence: Evidence.comparable(review.checkoutEvidence),
      seller: review.seller,
      firstParty: review.firstParty,
      orderTotal: review.orderTotal
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function handleCheckoutPage(product) {
    await send("checkout-reached", product, {
      attempt: currentAttempt(product)
    }, `checkout-reached:${product.id}:${pageAddress()}`, 10_000);

    if (!config.automationEnabled || !["review", "checkout"].includes(product.action)) return;
    const state = await productAutomationState(product);
    if (!state.ok || state.completed) return;
    requestPurchaseTabActivation(product);
    if (Number.isInteger(state.attempts)) attemptCache.set(product.id, state.attempts);

    const error = adapter.storeError(document);
    if (error) {
      if (error === "traffic-overload" && product.retailer !== "target") {
        await runtimeMessage({ type: "CART_CONFIRM_TRAFFIC_OVERLOAD", retailer });
      }
      const retryingExplicitSubmissionFailure = ["intent", "uncertain"].includes(state.submission?.phase);
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
      if (product.retailer === "target" && isBlitz(product)) {
        const dismissed = await dismissTargetStoreError(product);
        await send("store-error", product, {
          attempt: currentAttempt(product),
          reason: error,
          message: retryingExplicitSubmissionFailure
            ? "Target explicitly proved that the order was not placed. Its error was dismissed and a bounded final-submit retry will revalidate every order field first."
            : dismissed
              ? "Target's checkout error was dismissed; the bounded checkout persistence loop will revalidate the order."
              : "Target's checkout is overloaded; the bounded checkout persistence loop will reopen and revalidate it."
        }, `target-checkout-error:${product.id}:${error}:${currentAttempt(product)}`, 2_000);
        await scheduleTargetPersistenceNavigation(
          product,
          error === "out-of-stock"
            ? "Returning to the Target product after checkout reported it unavailable."
            : "Retrying Target checkout after an explicit failure.",
          error === "out-of-stock" ? "product" : "reload",
          error === "out-of-stock" ? "add" : retryingExplicitSubmissionFailure ? "submit" : "checkout"
        );
        return;
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

    // Sanitized Buy Now links may land directly at checkout. They are useful
    // for getting into the retailer flow quickly, but they do not waive the
    // cart proof requirement: visit the real cart once, independently verify
    // its sole line, quantity, seller and price, then return through checkout.
    if (hasDirectEntryContext(product) && !await proofFor(product)) {
      if (!await requireStoreAction(product, "direct-entry-cart-verification")) return;
      if (!await automationStillActive(product)) return;
      location.assign(adapter.cartUrl);
      return;
    }

    const claim = await claimProduct(product);
    if (!claim.ok) {
      return;
    }

    const review = await readCheckoutReview(product);
    if (!review.ok || (product.action === "checkout" && !review.evidence.ok)) {
      const blockReason = !review.ok ? review.reason : review.evidence.reason;
      if (REVIEW_SETTLE_REASONS.includes(blockReason)) {
        const settleCount = (reviewSettleRechecks.get(product.id) || 0) + 1;
        if (settleCount <= REVIEW_SETTLE_RECHECK_LIMIT) {
          reviewSettleRechecks.set(product.id, settleCount);
          await send("automation-status", product, {
            message: "The final order summary is still updating (totals, shipping, or fulfillment can lag a quantity change). Rechecking before any decision."
          }, `review-settle:${product.id}`, 30_000);
          scheduleScan(1_500);
          return;
        }
      }
      await send("automation-blocked", product, {
        price: review.price,
        orderTotal: review.orderTotal === null ? undefined : review.orderTotal,
        seller: review.seller,
        firstParty: review.firstParty,
        eligible: false,
        reason: blockReason,
        message: blockReason === "over-total"
          ? `Final order total is above the $${product.maxOrderTotal.toFixed(2)} cap.`
          : review.reason === "total-unavailable"
            ? "Final order review did not expose a readable order total."
            : blockReason === "fulfillment-unverified"
              ? `Final order review did not prove the required ${product.fulfillmentMode} fulfillment mode.`
            : blockReason === "checkout-evidence-changed"
                ? "The destination, payment set, substitution state, cart count, quantity, SKU, or total differs from the approved preflight. Automatic submission stopped."
            : blockReason === "checkout-trust-required"
                ? "This store has no approved checkout profile yet. Switch Autopilot off, open one auto-submit mission's final review, and lock the checkout preflight once."
            : blockReason === "checkout-trust-changed"
                ? "The live destination or payment set differs from the approved checkout profile for this store. Automatic submission stopped."
                : "Final order review could not verify the live destination or pickup store, complete payment set, disabled substitutions, exact cart, SKU, first-party offer, unit cap, quantity, fulfillment, and capped total."
      }, `review-blocked:${product.id}:${blockReason}`, 20_000);
      return;
    }
    reviewSettleRechecks.delete(product.id);

    if (product.action === "review") {
      const evidenceHash = await reviewEvidenceHash(product, review);
      const ready = await beginManualReview(product, evidenceHash);
      if (!ready.ok) {
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: "The verified review page could not be saved as a durable manual-outcome workflow. The retailer lane remains held for safety."
        }, `review-state-blocked:${product.id}:${ready.reason}`, Number.MAX_SAFE_INTEGER);
        return;
      }
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
      return;
    }

    const submitButton = adapter.submitButton(document);
    if (!submitButton) {
      scheduleScan(1_500);
      return;
    }

    const expectedHash = await reviewEvidenceHash(product, review);
    let intentCreated = false;
    let attempt = 0;
    const clicked = await clickAction(submitButton, product, async () => {
      const submitPersistence = await reserveTargetPersistence(product, "submit");
      if (!submitPersistence.ok) return false;
      if (!await requireStoreAction(
        product,
        submitPersistence.targetPersistence === true ? "submit" : "order-submit",
        submitPersistence.targetPersistence === true
      )) return false;
      attempt = await requireAttempt(product);
      if (attempt === null) return false;
      const freshReview = await readCheckoutReview(product);
      if (
        !freshReview.ok
        || !freshReview.evidence.ok
        || await reviewEvidenceHash(product, freshReview) !== expectedHash
      ) {
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
    if (config.monitoringPaused) {
      clearRetry();
      return;
    }
    scanning = true;
    try {
      const product = activeProduct();
      if (!product) return;
      if (ScheduleGate.calendarOwned(product)) {
        clearRetry();
        await send("automation-status", product, {
          message: ScheduleGate.waitingMessage(product, adapter.label)
        }, `calendar-wait:${product.id}:${ScheduleGate.calendarOpenAt(product)}`, Number.MAX_SAFE_INTEGER);
        return;
      }
      if (await handleChallenge(product)) return;

      let interactiveState = adapter.interactivePageState?.(document) || "";
      if (interactiveState === "location") {
        // A store/location prompt is often just the OTHER method's widget
        // ("choose a store" beside an already-selected Shipping line). When
        // the mission's configured method is already active, the prompt is
        // incidental and the page is handled normally. When it is not, the
        // configured method toggle is clicked (a choice between options the
        // account already holds) — never a store, zip, or location share.
        if (adapter.fulfillmentMode(document) === product.fulfillmentMode) {
          interactiveState = "";
        } else if (await selectConfiguredFulfillment(product)) {
          return;
        }
      }
      if (["auth", "mfa", "location", "membership"].includes(interactiveState)) {
        clearRetry();
        const state = await productAutomationState(product);
        const postMutation = state.ok && (
          ["clicked", "confirmed"].includes(state.addAction?.phase)
          || ["awaiting-manual-outcome", "manual-submit-observed", "submission-uncertain"].includes(state.workflow?.phase)
          || ["intent", "uncertain"].includes(state.submission?.phase)
        );
        const label = interactiveState === "auth"
          ? "sign-in or account check"
          : interactiveState === "mfa"
            ? "verification code or MFA prompt"
          : interactiveState === "location"
            ? "store or location choice"
            : "membership or invitation prompt";
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: `${adapter.label} requires a manual ${label}. Cart Confirm will not sign in, fill codes, choose a location, join a membership, or bypass eligibility. ${postMutation ? "Because the cart may already have changed, this mission keeps the store lane until you resolve it." : "No cart mutation was recorded, so the store lane may be released."}`
        }, `interactive-page:${product.id}:${interactiveState}:${pageAddress()}`, 60_000);
        return;
      }

      void send("page-observed", product, {}, `page:${product.id}:${pageAddress()}`, OBSERVATION_DEDUPE_MS);
      const kind = adapter.pageKind(location.href, document, product);
      if (kind === "queue" && await handleRetailerQueue(product)) return;
      if (handleQueueCaptureRetry(product)) return;
      if (kind === "confirmation" && await handleConfirmation(product)) return;
      const highDemandUnknown = Retailers.unrecognizedHighDemand(document);
      if (highDemandUnknown) {
        clearRetry();
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: `${adapter.label} displayed an unrecognized high-demand or waiting-room page. It is frozen for manual review; Cart Confirm will not refresh, replay, or manipulate a queue token.`
        }, `unknown-high-demand:${product.id}:${pageAddress()}`, Number.MAX_SAFE_INTEGER);
      } else if (kind === "product") await handleProductPage(product);
      else if (kind === "cart") await handleCartPage(product);
      else if (kind === "checkout" || kind === "confirmation") await handleCheckoutPage(product);
      else {
        clearRetry();
        const safePath = String(location.pathname || "/").slice(0, 160);
        const state = await productAutomationState(product);
        const postMutation = state.ok && (
          ["clicked", "confirmed"].includes(state.addAction?.phase)
          || ["awaiting-manual-outcome", "manual-submit-observed", "submission-uncertain"].includes(state.workflow?.phase)
          || ["intent", "uncertain"].includes(state.submission?.phase)
        );
        await send("automation-blocked", product, {
          reason: "manual-action-required",
          message: kind === "auth"
            ? `${adapter.label} requires a manual sign-in or account check at ${safePath}. ${postMutation ? "Because the cart may already have changed, this mission keeps the store lane until you resolve it." : "No cart mutation was recorded, so the store lane may be released."}`
            : `${adapter.label} redirected this workflow to the unrecognized path ${safePath}. ${postMutation ? "Because the cart may already have changed, this mission keeps the store lane until you resolve it." : "No cart mutation was recorded, so the store lane may be released."}`
        }, `unexpected-page:${product.id}:${pageAddress()}`, 60_000);
      }
    } finally {
      scanning = false;
    }
  }

  function scheduleScan(delay = 150, { replace = true } = {}) {
    if (config?.monitoringPaused) {
      clearTimeout(scanTimer);
      scanTimer = null;
      return;
    }
    // Target continually mutates recommendations, ads, and fulfillment UI.
    // A trailing-edge debounce can therefore starve forever, especially when
    // Chrome clamps timers in an inactive tab. Mutation-driven scans keep the
    // first pending deadline; explicit workflow delays may still replace it.
    if (scanTimer && !replace) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (scanning) {
        scheduleScan(150, { replace: false });
        return;
      }
      void scan();
    }, delay);
  }

  async function refreshConfig(force = false) {
    const next = await requestConfig(force);
    if (!next) return;
    const fingerprint = JSON.stringify({
      run: next.automationRunId,
      armed: next.automationEnabled,
      paused: next.monitoringPaused,
      version: next.configVersion,
      products: next.products,
      queueCaptures: next.queueCaptures,
      catalogSearch: next.catalogSearch
    });
    const changed = fingerprint !== configFingerprint;
    config = next;
    configFingerprint = fingerprint;
    if (changed) {
      seen.clear();
      if (!config.automationEnabled || config.monitoringPaused) {
        clearRetry();
        clearQueueCaptureRetry();
      }
    }
    const previousContextProductId = backgroundActiveProductId;
    const previousContextEntry = backgroundActiveEntry;
    const context = await runtimeMessage({ type: "CART_CONFIRM_GET_TAB_PRODUCT_CONTEXT" });
    backgroundActiveProductId = context.ok ? String(context.productId || "") : "";
    backgroundActiveEntry = context.ok ? String(context.entry || "product") : "product";
    backgroundSignalOrderLimit = context.ok && Number.isInteger(context.signalOrderLimit)
      ? context.signalOrderLimit
      : null;
    if (backgroundActiveProductId) sessionStorage.setItem(ACTIVE_PRODUCT_KEY, backgroundActiveProductId);
    const contextChanged = previousContextProductId !== backgroundActiveProductId
      || previousContextEntry !== backgroundActiveEntry;
    if (ScheduleGate.calendarOwned(activeProduct())) clearRetry();
    if (changed || contextChanged) scheduleScan(0);
    if (config.catalogSearch) scheduleCatalogCapture(changed ? 250 : 400);
    else clearTimeout(catalogCaptureTimer);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleScan(0);
  });

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target.closest("button, input, a[role='button']") : null;
    const product = activeProduct();
    if (!target || !product) return;
    const label = `${target.getAttribute("aria-label") || ""} ${target.getAttribute("value") || ""} ${Retailers.textOf(target)}`;
    if (product.action === "review" && /place (?:my |your )?order/i.test(label)) {
      void (async () => {
        const state = await productAutomationState(product);
        if (!state.ok || state.workflow?.phase !== "awaiting-manual-outcome") return;
        const freshReview = await readCheckoutReview(product);
        const evidenceHash = freshReview.ok ? await reviewEvidenceHash(product, freshReview) : "";
        if (!freshReview.ok || evidenceHash !== state.workflow.evidenceHash) {
          await send("automation-blocked", product, {
            reason: "manual-action-required",
            message: "The final review evidence changed before your manual Place Order click. The click was not matched to the approved review; verify the outcome manually."
          }, `manual-review-changed:${product.id}:${Date.now()}`, 0);
          return;
        }
        await markManualSubmit(product, evidenceHash);
      })();
    } else if (/add to cart/i.test(label)) {
      const manualKey = `cartConfirmManualAddAt:${product.id}`;
      const now = Date.now();
      const lastManualAddAt = Number(sessionStorage.getItem(manualKey) || 0);
      if (now - lastManualAddAt < 3_000) return;
      sessionStorage.setItem(manualKey, String(now));
      setActiveProduct(product);
      void send("add-clicked", product, { attempt: currentAttempt(product) }, `manual-add:${product.id}:${now}`, 0);
    } else if (/proceed to checkout|continue to checkout|check\s*out/i.test(label)) {
      void send("checkout-clicked", product, { attempt: currentAttempt(product) }, `manual-checkout:${product.id}:${Date.now()}`, 0);
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CART_CONFIRM_BACKGROUND_TICK") {
      // Active tabs are never timer-throttled; only hidden tabs need help.
      if (document.visibilityState !== "visible") {
        const navigated = fireOverdueNavigationRetry();
        const claimed = !navigated && fireOverdueClaimRetry();
        if (!navigated && !claimed) scheduleScan(0);
      }
      sendResponse({ ok: true, hidden: document.visibilityState !== "visible" });
      return false;
    }
    if (message?.type === "CART_CONFIRM_QUEUE_CAPTURE_CHANGED") {
      void refreshConfig(true);
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "CART_CONFIRM_CHECKOUT_PREFLIGHT_INSPECT") {
      void captureCheckoutPreflight()
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, reason: "checkout-preflight-error", error: error.message }));
      return true;
    }
    if (message?.type !== "CART_CONFIRM_QUICK_ADD_INSPECT") return undefined;
    try {
      sendResponse({
        ok: true,
        product: QuickAdd.inspectProductPage(document, location.href, Retailers)
      });
    } catch (error) {
      sendResponse({ ok: false, reason: "unsupported-page", error: error.message });
    }
    return false;
  });

  const observer = new MutationObserver(() => {
    scheduleScan(150, { replace: false });
    scheduleCatalogCapture();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "aria-hidden", "aria-label", "hidden", "href", "style", "value"]
  });

  // Holding a shared web lock exempts this tab from Chrome's intensive timer
  // throttling, so hidden-tab timers keep about one-second granularity
  // instead of one firing per minute. The alarm heartbeat remains the
  // backstop for browsers that ignore the exemption.
  try {
    if (navigator.locks?.request) {
      void navigator.locks.request("cart-confirm-keepalive", { mode: "shared" }, () => new Promise(() => {}));
    }
  } catch {
    // Best-effort accelerant only.
  }

  void (async () => {
    await refreshConfig(true);
    if (!config) return;
    const product = config.monitoringPaused ? null : activeProduct();
    await send("heartbeat", product, {}, `heartbeat:startup:${Date.now()}`, 0);
  })().catch(() => {});
  setInterval(() => void refreshConfig(false), CONFIG_REFRESH_MS);
  setInterval(() => {
    const product = config?.monitoringPaused ? null : activeProduct();
    void send("heartbeat", product, {}, `heartbeat:${Date.now()}`, 0);
    if (!config) void refreshConfig(true);
  }, HEARTBEAT_MS);
})();
