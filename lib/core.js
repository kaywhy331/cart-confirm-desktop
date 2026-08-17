"use strict";

const crypto = require("node:crypto");
const {
  RETAILERS,
  detectRetailer,
  extractSku,
  normalizeProductUrl,
  normalizeSku,
  parseRetailUrl,
  retailerLabel
} = require("./retailers");
const { normalizeHowlUrl, validateRetailerShareUrl } = require("./howl-link");
const { normalizeCustomProfiles } = require("./config-profiles");
const {
  calculateOrderTotalCap,
  cloneStarterCatalog,
  DEFAULT_ORDER_TAX_PERCENT,
  DEFAULT_STORE_ORDER_ALLOWANCES,
  normalizeDefaultItemProfileId,
  normalizeItemProfiles,
  normalizeMsrpCatalog,
  normalizeOrderTaxPercent,
  normalizeStoreOrderAllowances
} = require("./item-defaults");

const MAX_PRODUCTS = 50;
const MAX_MISSION_GROUPS = 20;
const MIN_RETRY_SECONDS = 5;
const MAX_RETRY_SECONDS = 3600;
const MIN_ELIGIBILITY_REFRESH_SECONDS = 2;
const MAX_ELIGIBILITY_REFRESH_SECONDS = 60;
const MIN_STORE_NAVIGATION_SECONDS = 10;
const MAX_STORE_NAVIGATION_SECONDS = 3600;
const MIN_OVERLOAD_COOLDOWN_SECONDS = 60;
const MAX_OVERLOAD_COOLDOWN_SECONDS = 86_400;
const MIN_WATCHER_INTERVAL_SECONDS = 30;
const MAX_WATCHER_INTERVAL_SECONDS = 3600;
const MIN_BLITZ_RETRY_DELAY_MS = 250;
const MAX_BLITZ_RETRY_DELAY_MS = 5000;
const MIN_BLITZ_WINDOW_SECONDS = 5;
const MAX_BLITZ_WINDOW_SECONDS = 120;
const MIN_SCHEDULED_BLITZ_DURATION_SECONDS = 15;
const MAX_SCHEDULED_BLITZ_DURATION_SECONDS = 900;
const MIN_WALMART_QUEUE_CAPTURE_RELOADS = 0;
const MAX_WALMART_QUEUE_CAPTURE_RELOADS = 20;
const MAX_WALMART_PREP_CANDIDATES = 20;
const ACTION_MODES = new Set(["watch", "cart", "review", "checkout"]);
const FULFILLMENT_MODES = new Set(["manual", "shipping", "pickup"]);
const ALERT_LEVELS = new Set(["standard", "alarm", "silent"]);
const SIGNAL_ENTRY_MODES = new Set(["product", "walmart-buy-now", "amazon-atc", "amazon-buy-now"]);
const CHECKOUT_EVIDENCE_VERSION = 2;
const CHECKOUT_EVIDENCE_SOURCE = "visible-checkout-dom";
const EVIDENCE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const REASONS = new Set([
  "eligible",
  "out-of-stock",
  "over-price",
  "third-party",
  "price-unavailable",
  "seller-unverified",
  "quantity-unavailable",
  "order-limit",
  "quantity-limit",
  "fulfillment-unverified",
  "total-unavailable",
  "over-total",
  "cart-unverified",
  "checkout-preflight-required",
  "checkout-evidence-unverified",
  "checkout-evidence-changed",
  "traffic-overload",
  "traffic-budget-exhausted",
  "retailer-queue",
  "manual-action-required",
  "retrying",
  "unmatched-product",
  "store-error"
]);

const ALLOWED_EVENT_TYPES = new Set([
  "heartbeat",
  "page-observed",
  "offer-observed",
  "availability",
  "add-clicked",
  "added-confirmed",
  "cart-count-increased",
  "cart-reached",
  "cart-item-confirmed",
  "quantity-updated",
  "checkout-clicked",
  "checkout-reached",
  "review-ready",
  "order-submit-clicked",
  "order-confirmed",
  "automation-status",
  "retry-scheduled",
  "automation-blocked",
  "store-error",
  "traffic-overload",
  "queue-waiting"
]);

const DEFAULT_PRODUCT = Object.freeze({
  id: "target:1011960739",
  retailer: "target",
  title: "",
  openAt: "",
  productUrl: "https://www.target.com/p/restocks/A-1011960739",
  sku: "1011960739",
  maxPrice: 0,
  maxOrderTotal: 0,
  quantity: 1,
  action: "checkout",
  alertLevel: "standard",
  fulfillmentMode: "shipping",
  itemProfileId: "",
  msrpRecordId: "",
  priceSource: "",
  groupId: "",
  signalAutoOpen: true,
  signalEntry: "product",
  howlUrl: "",
  affiliateUrl: "",
  affiliateOpenUrl: "",
  affiliateResolvedFrom: "",
  affiliateResolvedAt: "",
  enabled: false
});

const DEFAULT_SETTINGS = Object.freeze({
  products: Object.freeze([]),
  missionGroups: Object.freeze([]),
  automationEnabled: false,
  monitoringPaused: false,
  fastMode: true,
  retryIntervalSeconds: 15,
  eligibilityRefreshIntervalSeconds: 2,
  storeNavigationIntervalSeconds: 20,
  overloadCooldownSeconds: 300,
  watcherIntervalSeconds: 60,
  blitzRetryDelayMs: 750,
  blitzWindowSeconds: 20,
  scheduledBlitzDurationSeconds: 120,
  walmartQueueCaptureReloads: 0,
  walmartPrepCandidates: Object.freeze([]),
  scheduledOpenEnabled: false,
  scheduledOpenAt: "",
  scheduledRetailer: "target",
  discordEnabled: false,
  discordChannelId: "",
  discordAutoOpen: true,
  configurationProfiles: Object.freeze([]),
  msrpCatalog: Object.freeze(cloneStarterCatalog()),
  itemProfiles: Object.freeze([]),
  defaultItemProfileId: "built-in:shipping-watch",
  orderTaxPercent: DEFAULT_ORDER_TAX_PERCENT,
  storeOrderAllowances: DEFAULT_STORE_ORDER_ALLOWANCES,
  msrpResearchEnabled: false,
  automationRunId: "",
  companionToken: ""
});

function newCompanionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function productId(retailer, sku) {
  return `${retailer}:${sku}`;
}

function normalizePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
    throw new Error("Maximum unit price must be between $0.00 and $1,000,000.00.");
  }
  return Math.round(price * 100) / 100;
}

function normalizeWholeSeconds(value, minimum, maximum, label) {
  return normalizeWholeNumber(value, minimum, maximum, label, "seconds");
}

function normalizeWholeNumber(value, minimum, maximum, label, unit) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum} ${unit}.`);
  }
  return number;
}

function normalizeAffiliateFields(input, retailer, sku) {
  const howlUrl = input.howlUrl ? normalizeHowlUrl(input.howlUrl) : "";
  const affiliateResolvedFrom = input.affiliateResolvedFrom
    ? normalizeHowlUrl(input.affiliateResolvedFrom)
    : "";
  if (!howlUrl || affiliateResolvedFrom !== howlUrl || !input.affiliateUrl) {
    return { howlUrl, affiliateUrl: "", affiliateResolvedFrom: "", affiliateResolvedAt: "" };
  }

  const affiliateUrl = validateRetailerShareUrl(input.affiliateUrl, { retailer, sku }).url;
  const timestamp = new Date(input.affiliateResolvedAt || "");
  const affiliateResolvedAt = Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString();
  return { howlUrl, affiliateUrl, affiliateResolvedFrom, affiliateResolvedAt };
}

function normalizeAffiliateOpenUrl(value, retailer, sku) {
  if (!String(value || "").trim()) return "";
  try {
    return validateRetailerShareUrl(value, { retailer, sku }).url;
  } catch (error) {
    throw new Error(`Affiliate product link must be a direct HTTPS link to this mission's exact store and item ID. ${error.message || ""}`.trim());
  }
}

function toAutomationProduct(product = {}) {
  const automationProduct = { ...product };
  delete automationProduct.groupId;
  delete automationProduct.howlUrl;
  delete automationProduct.affiliateUrl;
  delete automationProduct.affiliateOpenUrl;
  delete automationProduct.affiliateResolvedFrom;
  delete automationProduct.affiliateResolvedAt;
  return automationProduct;
}

function adminCampaignFields(product = {}) {
  return {
    howlUrl: String(product.howlUrl || ""),
    affiliateUrl: String(product.affiliateUrl || ""),
    affiliateResolvedFrom: String(product.affiliateResolvedFrom || ""),
    affiliateResolvedAt: String(product.affiliateResolvedAt || "")
  };
}

function preserveAdminCampaignFields(nextProducts = [], currentProducts = []) {
  const currentById = new Map(currentProducts.map((product) => [product.id, product]));
  return nextProducts.map((product) => ({
    ...toAutomationProduct(product),
    groupId: String(product.groupId || ""),
    affiliateOpenUrl: String(product.affiliateOpenUrl || ""),
    ...adminCampaignFields(currentById.get(product.id))
  }));
}

function toRendererProduct(product = {}) {
  const rendererProduct = toAutomationProduct(product);
  rendererProduct.groupId = String(product.groupId || "");
  rendererProduct.checkoutPreflightApproved = Boolean(rendererProduct.checkoutEvidence);
  rendererProduct.checkoutPreflightCapturedAt = rendererProduct.checkoutEvidence?.capturedAt || "";
  delete rendererProduct.checkoutEvidence;
  rendererProduct.affiliateOpenUrl = String(product.affiliateOpenUrl || "");
  if (product.affiliateUrl) rendererProduct.affiliateUrl = String(product.affiliateUrl);
  return rendererProduct;
}

function missionOpenUrl(product = {}) {
  const expected = { retailer: product.retailer, sku: product.sku };
  for (const candidate of [product.affiliateOpenUrl, product.affiliateUrl]) {
    if (!candidate) continue;
    try {
      return validateRetailerShareUrl(candidate, expected).url;
    } catch {
      // Stored settings are normalized before reaching this helper. If older
      // or corrupted data bypasses that boundary, fall back to the canonical
      // product URL instead of opening an unverified destination.
    }
  }
  return String(product.productUrl || "");
}

const CHECKOUT_EVIDENCE_BINDING_FIELDS = Object.freeze([
  "retailer",
  "sku",
  "quantity",
  "fulfillmentMode",
  "action",
  "maxPrice",
  "maxOrderTotal"
]);

function preserveCheckoutEvidence(nextProducts = [], currentProducts = []) {
  const currentById = new Map(currentProducts.map((product) => [product.id, product]));
  return nextProducts.map((product) => {
    const current = currentById.get(product.id);
    const unchanged = current && CHECKOUT_EVIDENCE_BINDING_FIELDS.every((field) => (
      product[field] === current[field]
    ));
    return {
      ...product,
      // Renderer/settings saves may retain a previously approved contract but
      // can never create or replace one. Approval crosses the authenticated
      // checkout-preflight endpoint instead.
      checkoutEvidence: unchanged ? current.checkoutEvidence || null : null
    };
  });
}

function applyCheckoutPreflight(products = [], productIdValue, evidenceInput) {
  const productIdValueText = String(productIdValue || "");
  const index = products.findIndex((product) => product.id === productIdValueText);
  if (index < 0) throw new Error("That checkout mission is no longer configured.");
  const product = products[index];
  if (!product.enabled || product.action !== "checkout") {
    throw new Error("Checkout preflight requires an enabled auto-submit mission.");
  }
  const capturedAt = new Date(evidenceInput?.capturedAt || "").getTime();
  const now = Date.now();
  if (!Number.isFinite(capturedAt) || capturedAt < now - 5 * 60_000 || capturedAt > now + 30_000) {
    throw new Error("Checkout preflight evidence must come from a fresh visible final-review page.");
  }
  const checkoutEvidence = normalizeCheckoutEvidence(evidenceInput, product);
  if (!checkoutEvidence) {
    throw new Error("The checkout page did not prove the exact destination, complete payment set, disabled substitutions, single cart line, quantity, SKU, and capped total.");
  }
  return products.map((candidate, candidateIndex) => (
    candidateIndex === index ? { ...candidate, checkoutEvidence } : candidate
  ));
}

function normalizeCheckoutEvidence(input, product = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const fulfillmentMode = String(input.fulfillment?.mode || "");
  const destinationFingerprint = String(input.fulfillment?.destinationFingerprint || "");
  const pickupStoreFingerprint = String(input.fulfillment?.pickupStoreFingerprint || "");
  const instrumentSetFingerprint = String(input.payment?.instrumentSetFingerprint || "");
  const instrumentCount = Number(input.payment?.instrumentCount);
  const substitutionState = String(input.substitutions?.state || "unknown");
  const substitutionSku = String(input.substitutions?.sku || "").slice(0, 24);
  const lineCount = Number(input.cart?.lineCount);
  const cartSku = String(input.cart?.sku || "").slice(0, 24);
  const quantity = Number(input.cart?.quantity);
  const orderTotal = Number(input.orderTotal);
  const capturedAtDate = new Date(input.capturedAt || "");
  const provenanceSource = String(input.provenance?.source || "");
  const provenanceRetailer = String(input.provenance?.retailer || "");
  const provenanceProductId = String(input.provenance?.productId || "");
  const provenanceSku = String(input.provenance?.sku || "").slice(0, 24);
  if (
    Number(input.version) !== CHECKOUT_EVIDENCE_VERSION
    || Number(input.normalizerVersion) !== 1
    || provenanceSource !== CHECKOUT_EVIDENCE_SOURCE
    || provenanceRetailer !== product.retailer
    || provenanceProductId !== product.id
    || provenanceSku !== product.sku
    || (product.action && product.action !== "checkout")
    || !["shipping", "pickup"].includes(fulfillmentMode)
    || (fulfillmentMode === "shipping" && !EVIDENCE_HASH_PATTERN.test(destinationFingerprint))
    || (fulfillmentMode === "shipping" && pickupStoreFingerprint !== "")
    || (fulfillmentMode === "pickup" && !EVIDENCE_HASH_PATTERN.test(pickupStoreFingerprint))
    || (fulfillmentMode === "pickup" && destinationFingerprint !== "")
    || !EVIDENCE_HASH_PATTERN.test(instrumentSetFingerprint)
    || !Number.isInteger(instrumentCount)
    || instrumentCount < 1
    || instrumentCount > 20
    || !["disabled", "not-applicable"].includes(substitutionState)
    || !substitutionSku
    || input.cart?.independentlyCounted !== true
    || lineCount !== 1
    || !cartSku
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > 99
    || !Number.isFinite(orderTotal)
    || orderTotal <= 0
    || (product.sku && cartSku !== product.sku)
    || (product.sku && substitutionSku !== product.sku)
    || (product.quantity && quantity !== product.quantity)
    || (product.fulfillmentMode && fulfillmentMode !== product.fulfillmentMode)
    || !Number.isFinite(Number(product.maxOrderTotal))
    || Number(product.maxOrderTotal) <= 0
    || orderTotal > Number(product.maxOrderTotal)
    || Number.isNaN(capturedAtDate.getTime())
  ) return null;
  return {
    version: CHECKOUT_EVIDENCE_VERSION,
    normalizerVersion: 1,
    provenance: {
      source: CHECKOUT_EVIDENCE_SOURCE,
      retailer: provenanceRetailer,
      productId: provenanceProductId,
      sku: provenanceSku
    },
    fulfillment: { mode: fulfillmentMode, destinationFingerprint, pickupStoreFingerprint },
    payment: { instrumentSetFingerprint, instrumentCount },
    substitutions: { state: substitutionState, sku: substitutionSku },
    cart: { independentlyCounted: true, lineCount, sku: cartSku, quantity },
    orderTotal: Math.round(orderTotal * 100) / 100,
    capturedAt: capturedAtDate.toISOString()
  };
}

function normalizeProduct(input = {}) {
  const productUrl = normalizeProductUrl(input.productUrl);
  const retailer = detectRetailer(productUrl);
  const requestedRetailer = String(input.retailer || retailer).toLowerCase();

  if (requestedRetailer !== retailer) {
    throw new Error("The selected store does not match the product URL.");
  }

  const sku = normalizeSku(retailer, input.sku || extractSku(retailer, productUrl));
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error("Quantity must be a whole number from 1 to 99.");
  }

  const action = String(input.action || "cart");
  if (!ACTION_MODES.has(action)) {
    throw new Error("Choose Watch only, Add to cart only, Stop at final review, or Submit order automatically.");
  }
  const alertLevel = String(input.alertLevel || "standard");
  if (!ALERT_LEVELS.has(alertLevel)) {
    throw new Error("Choose a standard, alarm, or silent alert level.");
  }
  const fulfillmentMode = String(input.fulfillmentMode || "manual");
  if (!FULFILLMENT_MODES.has(fulfillmentMode)) {
    throw new Error("Choose shipping, pickup, or manual fulfillment review.");
  }
  const signalEntry = String(input.signalEntry || "product");
  if (!SIGNAL_ENTRY_MODES.has(signalEntry)) {
    throw new Error("Choose the product page or a supported direct signal entry.");
  }
  if (signalEntry.startsWith("amazon-") && retailer !== "amazon") {
    throw new Error("Amazon direct signal entries require an Amazon mission.");
  }
  if (signalEntry === "walmart-buy-now" && retailer !== "walmart") {
    throw new Error("Walmart Buy Now signal entry requires a Walmart mission.");
  }
  if (signalEntry === "amazon-atc" && action === "watch") {
    throw new Error("Amazon Add to Cart signal entry requires an Add to cart or checkout mission.");
  }
  if (signalEntry === "amazon-buy-now" && !["review", "checkout"].includes(action)) {
    throw new Error("Amazon Buy Now signal entry requires a checkout-review or auto-submit mission.");
  }
  if (signalEntry === "walmart-buy-now" && !["review", "checkout"].includes(action)) {
    throw new Error("Walmart Buy Now signal entry requires a checkout-review or auto-submit mission.");
  }

  // Scheduled opening time. Past values are allowed here so stored settings
  // reload after a restart; the save path rejects new past times and the
  // scheduler marks stale ones missed.
  let openAt = String(input.openAt || "").trim();
  if (openAt) {
    const parsedOpenAt = new Date(openAt);
    if (Number.isNaN(parsedOpenAt.getTime())) {
      throw new Error("The scheduled opening time is invalid.");
    }
    openAt = parsedOpenAt.toISOString();
  }
  const affiliate = normalizeAffiliateFields(input, retailer, sku);
  const affiliateOpenUrl = normalizeAffiliateOpenUrl(input.affiliateOpenUrl, retailer, sku);

  const product = {
    id: productId(retailer, sku),
    retailer,
    title: cleanText(input.title, 80),
    openAt,
    productUrl,
    sku,
    maxPrice: normalizePrice(input.maxPrice ?? 0),
    maxOrderTotal: normalizePrice(input.maxOrderTotal ?? 0),
    quantity,
    action,
    alertLevel,
    fulfillmentMode,
    itemProfileId: cleanText(input.itemProfileId, 80),
    msrpRecordId: cleanText(input.msrpRecordId, 80),
    priceSource: cleanText(input.priceSource, 40),
    groupId: cleanText(input.groupId, 80),
    signalAutoOpen: input.signalAutoOpen !== undefined ? Boolean(input.signalAutoOpen) : true,
    acceptPartial: input.acceptPartial !== undefined ? Boolean(input.acceptPartial) : true,
    signalEntry,
    ...affiliate,
    affiliateOpenUrl,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : true
  };
  product.checkoutEvidence = normalizeCheckoutEvidence(input.checkoutEvidence, product);
  return product;
}

function normalizeWalmartPrepCandidates(
  input = [],
  existingProducts = [],
  storeOrderAllowances = DEFAULT_STORE_ORDER_ALLOWANCES,
  orderTaxPercent = DEFAULT_ORDER_TAX_PERCENT
) {
  const source = Array.isArray(input) ? input.slice(0, MAX_WALMART_PREP_CANDIDATES) : [];
  const productIds = new Set(existingProducts.map((product) => product.id));
  const seen = new Set();
  const candidates = [];
  for (const value of source) {
    const product = normalizeProductForSettings(
      { ...value, enabled: true },
      storeOrderAllowances,
      orderTaxPercent
    );
    if (
      product.retailer !== "walmart"
      || !product.openAt
      || productIds.has(product.id)
      || seen.has(product.id)
    ) continue;
    seen.add(product.id);
    candidates.push({
      ...product,
      createdAt: String(value?.createdAt || new Date().toISOString()).slice(0, 40)
    });
  }
  return candidates;
}

function legacyProduct(settings = {}) {
  if (!settings.productUrl) return null;
  return {
    productUrl: settings.productUrl,
    sku: settings.sku || settings.tcin,
    maxPrice: settings.maxPrice ?? 0,
    maxOrderTotal: settings.maxOrderTotal ?? 0,
    quantity: settings.quantity ?? 1,
    action: settings.autoOpenCart ? "checkout" : "cart",
    fulfillmentMode: settings.fulfillmentMode || "manual",
    enabled: true
  };
}

function normalizeMissionGroups(input = []) {
  const source = Array.isArray(input) ? input.slice(0, MAX_MISSION_GROUPS) : [];
  const seen = new Set();
  const groups = [];
  for (const value of source) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const id = cleanText(value.id, 80);
    const name = cleanText(value.name, 40);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, name, collapsed: Boolean(value.collapsed) });
  }
  return groups;
}

function normalizeProductForSettings(value, storeOrderAllowances, orderTaxPercent) {
  // The final-order cap is derived below. Ignore any stale, missing, or
  // renderer-supplied value so it can never contradict price × quantity.
  const product = normalizeProduct({ ...value, maxOrderTotal: 0, checkoutEvidence: null });
  product.maxOrderTotal = calculateOrderTotalCap(product, storeOrderAllowances, orderTaxPercent);
  product.checkoutEvidence = normalizeCheckoutEvidence(value?.checkoutEvidence, product);
  return product;
}

function normalizeProducts(
  input,
  fallback,
  missionGroups = [],
  storeOrderAllowances = DEFAULT_STORE_ORDER_ALLOWANCES,
  orderTaxPercent = DEFAULT_ORDER_TAX_PERCENT
) {
  // An empty mission list is legal; arming still requires an enabled product.
  let rawProducts = Array.isArray(input) ? input : null;
  if (!rawProducts) rawProducts = Array.isArray(fallback) ? fallback : [];

  if (rawProducts.length > MAX_PRODUCTS) {
    throw new Error(`A buy list can contain at most ${MAX_PRODUCTS} products.`);
  }

  const knownGroupIds = new Set(missionGroups.map((group) => group.id));
  const products = rawProducts.map((value) => {
    const product = normalizeProductForSettings(value, storeOrderAllowances, orderTaxPercent);
    if (!knownGroupIds.has(product.groupId)) product.groupId = "";
    return product;
  });
  const ids = new Set();
  for (const product of products) {
    if (ids.has(product.id)) {
      throw new Error(`${retailerLabel(product.retailer)} ${product.sku} appears more than once.`);
    }
    ids.add(product.id);
  }
  return products;
}

function normalizeSettings(input = {}, existing = {}) {
  const inputLegacy = legacyProduct(input);
  const existingLegacy = legacyProduct(existing);
  const inputProducts = Array.isArray(input.products)
    ? input.products
    : inputLegacy ? [inputLegacy] : null;
  const existingProducts = Array.isArray(existing.products)
    ? existing.products
    : existingLegacy ? [existingLegacy] : DEFAULT_SETTINGS.products;
  const missionGroups = normalizeMissionGroups(
    input.missionGroups
      ?? existing.missionGroups
      ?? DEFAULT_SETTINGS.missionGroups
  );
  const storeOrderAllowances = normalizeStoreOrderAllowances(
    input.storeOrderAllowances,
    existing.storeOrderAllowances ?? DEFAULT_SETTINGS.storeOrderAllowances
  );
  const orderTaxPercent = normalizeOrderTaxPercent(
    input.orderTaxPercent,
    existing.orderTaxPercent ?? DEFAULT_SETTINGS.orderTaxPercent
  );
  const products = normalizeProducts(
    inputProducts,
    existingProducts,
    missionGroups,
    storeOrderAllowances,
    orderTaxPercent
  );
  const walmartPrepCandidates = normalizeWalmartPrepCandidates(
    input.walmartPrepCandidates
      ?? existing.walmartPrepCandidates
      ?? DEFAULT_SETTINGS.walmartPrepCandidates,
    products,
    storeOrderAllowances,
    orderTaxPercent
  );

  const retryIntervalSeconds = normalizeWholeSeconds(
    input.retryIntervalSeconds ?? existing.retryIntervalSeconds ?? DEFAULT_SETTINGS.retryIntervalSeconds,
    MIN_RETRY_SECONDS,
    MAX_RETRY_SECONDS,
    "Retry interval"
  );
  const eligibilityRefreshIntervalSeconds = normalizeWholeSeconds(
    input.eligibilityRefreshIntervalSeconds
      ?? existing.eligibilityRefreshIntervalSeconds
      ?? DEFAULT_SETTINGS.eligibilityRefreshIntervalSeconds,
    MIN_ELIGIBILITY_REFRESH_SECONDS,
    MAX_ELIGIBILITY_REFRESH_SECONDS,
    "Pre-eligibility refresh interval"
  );
  const storeNavigationIntervalSeconds = normalizeWholeSeconds(
    input.storeNavigationIntervalSeconds
      ?? existing.storeNavigationIntervalSeconds
      ?? DEFAULT_SETTINGS.storeNavigationIntervalSeconds,
    MIN_STORE_NAVIGATION_SECONDS,
    MAX_STORE_NAVIGATION_SECONDS,
    "Per-store navigation interval"
  );
  if (eligibilityRefreshIntervalSeconds > storeNavigationIntervalSeconds) {
    throw new Error("Pre-eligibility refresh interval cannot exceed the normal per-store navigation interval.");
  }
  const overloadCooldownSeconds = normalizeWholeSeconds(
    input.overloadCooldownSeconds
      ?? existing.overloadCooldownSeconds
      ?? DEFAULT_SETTINGS.overloadCooldownSeconds,
    MIN_OVERLOAD_COOLDOWN_SECONDS,
    MAX_OVERLOAD_COOLDOWN_SECONDS,
    "Overload cooldown"
  );
  const watcherIntervalSeconds = normalizeWholeSeconds(
    input.watcherIntervalSeconds
      ?? existing.watcherIntervalSeconds
      ?? DEFAULT_SETTINGS.watcherIntervalSeconds,
    MIN_WATCHER_INTERVAL_SECONDS,
    MAX_WATCHER_INTERVAL_SECONDS,
    "Watcher interval"
  );
  const blitzRetryDelayMs = normalizeWholeNumber(
    input.blitzRetryDelayMs
      ?? existing.blitzRetryDelayMs
      ?? DEFAULT_SETTINGS.blitzRetryDelayMs,
    MIN_BLITZ_RETRY_DELAY_MS,
    MAX_BLITZ_RETRY_DELAY_MS,
    "Blitz retry delay",
    "milliseconds"
  );
  const blitzWindowSeconds = normalizeWholeSeconds(
    input.blitzWindowSeconds
      ?? existing.blitzWindowSeconds
      ?? DEFAULT_SETTINGS.blitzWindowSeconds,
    MIN_BLITZ_WINDOW_SECONDS,
    MAX_BLITZ_WINDOW_SECONDS,
    "Blitz persistence window"
  );
  const scheduledBlitzDurationSeconds = normalizeWholeSeconds(
    input.scheduledBlitzDurationSeconds
      ?? existing.scheduledBlitzDurationSeconds
      ?? DEFAULT_SETTINGS.scheduledBlitzDurationSeconds,
    MIN_SCHEDULED_BLITZ_DURATION_SECONDS,
    MAX_SCHEDULED_BLITZ_DURATION_SECONDS,
    "Scheduled blitz duration"
  );
  const walmartQueueCaptureReloads = normalizeWholeNumber(
    input.walmartQueueCaptureReloads
      ?? existing.walmartQueueCaptureReloads
      ?? DEFAULT_SETTINGS.walmartQueueCaptureReloads,
    MIN_WALMART_QUEUE_CAPTURE_RELOADS,
    MAX_WALMART_QUEUE_CAPTURE_RELOADS,
    "Walmart queue-capture reloads",
    "reloads"
  );

  const scheduledOpenEnabled = input.scheduledOpenEnabled !== undefined
    ? Boolean(input.scheduledOpenEnabled)
    : Boolean(existing.scheduledOpenEnabled ?? DEFAULT_SETTINGS.scheduledOpenEnabled);
  let scheduledOpenAt = String(input.scheduledOpenAt ?? existing.scheduledOpenAt ?? "").trim();

  if (scheduledOpenAt) {
    const parsedDate = new Date(scheduledOpenAt);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error("The scheduled open time is invalid.");
    }
    scheduledOpenAt = parsedDate.toISOString();
  }

  const scheduledRetailer = String(
    input.scheduledRetailer
      ?? existing.scheduledRetailer
      ?? DEFAULT_SETTINGS.scheduledRetailer
  ).toLowerCase();
  if (!RETAILERS[scheduledRetailer]) {
    throw new Error("Choose Target, Walmart, or Amazon for the single schedule.");
  }
  if (scheduledOpenEnabled && !scheduledOpenAt) {
    throw new Error("Choose a date and time for the single store schedule.");
  }
  if (
    scheduledOpenEnabled
    && !products.some((product) => product.enabled && product.retailer === scheduledRetailer)
  ) {
    throw new Error(`Enable at least one ${retailerLabel(scheduledRetailer)} product for the single schedule.`);
  }

  const existingToken = String(existing.companionToken || "");
  const suppliedToken = String(input.companionToken || "");
  const companionToken = suppliedToken || existingToken || newCompanionToken();
  const automationRunId = String(
    input.automationRunId
      ?? existing.automationRunId
      ?? DEFAULT_SETTINGS.automationRunId
  ).slice(0, 80);
  const discordChannelId = String(
    input.discordChannelId
      ?? existing.discordChannelId
      ?? DEFAULT_SETTINGS.discordChannelId
  ).trim();
  if (discordChannelId && !/^\d{15,25}$/.test(discordChannelId)) {
    throw new Error("Enter a valid Discord channel ID.");
  }
  const discordEnabled = input.discordEnabled !== undefined
    ? Boolean(input.discordEnabled)
    : Boolean(existing.discordEnabled ?? DEFAULT_SETTINGS.discordEnabled);
  if (discordEnabled && !discordChannelId) {
    throw new Error("Enter a Discord channel ID before enabling signal ingestion.");
  }

  const automationEnabled = input.automationEnabled !== undefined
    ? Boolean(input.automationEnabled)
    : Boolean(existing.automationEnabled ?? DEFAULT_SETTINGS.automationEnabled);
  const monitoringPaused = input.monitoringPaused !== undefined
    ? Boolean(input.monitoringPaused)
    : Boolean(existing.monitoringPaused ?? DEFAULT_SETTINGS.monitoringPaused);
  const configurationProfiles = normalizeCustomProfiles(
    input.configurationProfiles
      ?? existing.configurationProfiles
      ?? DEFAULT_SETTINGS.configurationProfiles
  );
  const msrpCatalog = normalizeMsrpCatalog(
    input.msrpCatalog,
    existing.msrpCatalog ?? DEFAULT_SETTINGS.msrpCatalog
  );
  const itemProfiles = normalizeItemProfiles(
    input.itemProfiles
      ?? existing.itemProfiles
      ?? DEFAULT_SETTINGS.itemProfiles
  );
  const defaultItemProfileId = normalizeDefaultItemProfileId(
    input.defaultItemProfileId
      ?? existing.defaultItemProfileId
      ?? DEFAULT_SETTINGS.defaultItemProfileId,
    itemProfiles
  );
  const msrpResearchEnabled = input.msrpResearchEnabled !== undefined
    ? Boolean(input.msrpResearchEnabled)
    : Boolean(existing.msrpResearchEnabled ?? DEFAULT_SETTINGS.msrpResearchEnabled);
  if (automationEnabled) {
    const enabledProducts = products.filter((product) => product.enabled);
    const authorizedProducts = [...enabledProducts, ...walmartPrepCandidates];
    if (!authorizedProducts.length) {
      throw new Error("Enable at least one product or add a Walmart prep candidate before arming automation.");
    }
    if (authorizedProducts.some((product) => product.maxPrice <= 0)) {
      throw new Error("Every enabled product needs a positive maximum unit price before automation can be armed.");
    }
    const purchaseProducts = authorizedProducts.filter((product) => ["review", "checkout"].includes(product.action));
    if (purchaseProducts.some((product) => product.maxOrderTotal <= 0)) {
      throw new Error("Every order-review or auto-submit product needs a positive maximum order total before automation can be armed.");
    }
    if (purchaseProducts.some((product) => product.maxOrderTotal < product.maxPrice * product.quantity)) {
      throw new Error("An order-review or auto-submit product’s maximum order total cannot be below its capped item subtotal.");
    }
    if (authorizedProducts.some((product) => product.action === "checkout" && product.fulfillmentMode === "manual")) {
      throw new Error("Every auto-submit product must explicitly require shipping or pickup fulfillment.");
    }
  }

  return {
    products,
    missionGroups,
    automationEnabled,
    monitoringPaused,
    fastMode: input.fastMode !== undefined
      ? Boolean(input.fastMode)
      : Boolean(existing.fastMode ?? DEFAULT_SETTINGS.fastMode),
    retryIntervalSeconds,
    eligibilityRefreshIntervalSeconds,
    storeNavigationIntervalSeconds,
    overloadCooldownSeconds,
    watcherIntervalSeconds,
    blitzRetryDelayMs,
    blitzWindowSeconds,
    scheduledBlitzDurationSeconds,
    walmartQueueCaptureReloads,
    walmartPrepCandidates,
    scheduledOpenEnabled,
    scheduledOpenAt,
    scheduledRetailer,
    discordEnabled,
    discordChannelId,
    discordAutoOpen: input.discordAutoOpen !== undefined
      ? Boolean(input.discordAutoOpen)
      : Boolean(existing.discordAutoOpen ?? DEFAULT_SETTINGS.discordAutoOpen),
    configurationProfiles,
    msrpCatalog,
    itemProfiles,
    defaultItemProfileId,
    orderTaxPercent,
    storeOrderAllowances,
    msrpResearchEnabled,
    automationRunId,
    companionToken
  };
}

// Sorted by id: display order is not purchase configuration.
function purchaseConfigFingerprint(settings = {}) {
  const summarize = (product) => ({
    id: product.id,
    retailer: product.retailer,
    productUrl: product.productUrl,
    sku: product.sku,
    maxPrice: product.maxPrice,
    maxOrderTotal: product.maxOrderTotal,
    quantity: product.quantity,
    action: product.action,
    fulfillmentMode: product.fulfillmentMode,
    itemProfileId: product.itemProfileId,
    msrpRecordId: product.msrpRecordId,
    priceSource: product.priceSource,
    signalAutoOpen: product.signalAutoOpen,
    signalEntry: product.signalEntry,
    enabled: product.enabled,
    checkoutEvidence: product.checkoutEvidence
  });
  return JSON.stringify({
    products: [...(settings.products || [])].sort((a, b) => (
      String(a.id).localeCompare(String(b.id))
    )).map(summarize),
    walmartPrepCandidates: [...(settings.walmartPrepCandidates || [])].sort((a, b) => (
      String(a.id).localeCompare(String(b.id))
    )).map((candidate) => ({ ...summarize(candidate), openAt: candidate.openAt }))
  });
}

function assertSafeArmedUpdate(current, next) {
  if (
    current?.automationEnabled
    && next?.automationEnabled
    && purchaseConfigFingerprint(current) !== purchaseConfigFingerprint(next)
  ) {
    throw new Error("Disarm automation before changing products, quantities, price caps, or purchase actions.");
  }
}

function createInitialStatus() {
  return {
    companion: "waiting",
    lastHeartbeatAt: "",
    lastEventAt: "",
    lastPage: "",
    lastMessage: "Waiting for the browser companion."
  };
}

function createProductStatus(product) {
  return {
    productId: product.id,
    availability: "unknown",
    eligible: false,
    reason: "",
    observedPrice: null,
    observedOrderTotal: null,
    seller: "",
    firstParty: false,
    cart: "not-confirmed",
    checkout: "not-started",
    order: "not-confirmed",
    attempts: 0,
    lastEventAt: "",
    lastMessage: "Waiting for this product to be observed."
  };
}

function sanitizePage(value) {
  const text = String(value || "");
  if (!text) return "";

  try {
    const { parsed } = parseRetailUrl(text);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
  } catch {
    return "";
  }
}

function cleanText(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function validateEvent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Event payload must be an object.");
  }

  const eventType = String(input.eventType || "");
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    throw new Error("Unsupported companion event.");
  }

  const retailer = String(input.retailer || detectRetailer(input.page)).toLowerCase();
  if (retailer && !RETAILERS[retailer]) {
    throw new Error("Unsupported event retailer.");
  }

  const rawSku = input.sku || input.tcin || "";
  const sku = rawSku && retailer ? normalizeSku(retailer, rawSku) : "";
  const eventProductId = cleanText(input.productId || (retailer && sku ? productId(retailer, sku) : ""), 80);

  const availability = ["available", "unavailable", "unknown"].includes(input.availability)
    ? input.availability
    : undefined;
  const cartCount = Number.isInteger(input.cartCount) && input.cartCount >= 0 && input.cartCount <= 999
    ? input.cartCount
    : undefined;
  const quantity = Number.isInteger(input.quantity) && input.quantity >= 1 && input.quantity <= 99
    ? input.quantity
    : undefined;
  const attempt = Number.isInteger(input.attempt) && input.attempt >= 0 && input.attempt <= 1_000_000
    ? input.attempt
    : undefined;
  const priceNumber = Number(input.price);
  const price = input.price !== undefined && Number.isFinite(priceNumber) && priceNumber >= 0 && priceNumber <= 1_000_000
    ? Math.round(priceNumber * 100) / 100
    : undefined;
  const orderTotalNumber = Number(input.orderTotal);
  const orderTotal = input.orderTotal !== undefined
    && Number.isFinite(orderTotalNumber)
    && orderTotalNumber >= 0
    && orderTotalNumber <= 1_000_000
    ? Math.round(orderTotalNumber * 100) / 100
    : undefined;
  const cooldownUntilNumber = Number(input.cooldownUntil);
  const cooldownUntil = input.cooldownUntil !== undefined
    && Number.isFinite(cooldownUntilNumber)
    && cooldownUntilNumber >= 0
    && cooldownUntilNumber <= Date.now() + MAX_OVERLOAD_COOLDOWN_SECONDS * 1000
    ? Math.round(cooldownUntilNumber)
    : undefined;
  const firstParty = typeof input.firstParty === "boolean" ? input.firstParty : undefined;
  const eligible = typeof input.eligible === "boolean" ? input.eligible : undefined;
  const reason = REASONS.has(input.reason) ? input.reason : undefined;

  const timestampDate = new Date(input.timestamp || Date.now());
  const timestamp = Number.isNaN(timestampDate.getTime())
    ? new Date().toISOString()
    : timestampDate.toISOString();

  return {
    eventType,
    productId: eventProductId,
    retailer,
    sku,
    availability,
    cartCount,
    quantity,
    attempt,
    price,
    orderTotal,
    cooldownUntil,
    seller: cleanText(input.seller),
    firstParty,
    eligible,
    reason,
    message: cleanText(input.message, 240),
    page: sanitizePage(input.page),
    timestamp
  };
}

function eventMessage(event) {
  const store = retailerLabel(event.retailer);
  switch (event.eventType) {
    case "heartbeat":
      return "Browser companion connected.";
    case "page-observed":
      return `${store} page detected in the browser.`;
    case "offer-observed":
      if (event.message) return event.message;
      if (event.eligible) return `${store} has an eligible first-party offer at $${event.price?.toFixed(2)}.`;
      if (event.reason === "third-party") return `${store} offer blocked because the seller is third-party.`;
      if (event.reason === "over-price") return `${store} offer is above the configured price cap.`;
      return `${store} offer is not currently eligible.`;
    case "availability":
      return event.availability === "available"
        ? `${store} reports the item is available.`
        : event.availability === "unavailable"
          ? `${store} reports the item is unavailable.`
          : `${store} availability could not be determined.`;
    case "add-clicked":
      return `${store} Add to cart was selected.`;
    case "added-confirmed":
      return `${store} displayed an Added to cart confirmation.`;
    case "cart-count-increased":
      return Number.isInteger(event.cartCount)
        ? `${store} cart count increased to ${event.cartCount}.`
        : `${store} cart count increased.`;
    case "cart-reached":
      return `${store}'s cart page is open; be ready to complete the purchase.`;
    case "cart-item-confirmed":
      return event.message || `The exact ${store} product was confirmed in the cart.`;
    case "quantity-updated":
      return event.message || `${store} cart quantity was set to ${event.quantity}.`;
    case "checkout-clicked":
      return `${store} checkout was selected.`;
    case "checkout-reached":
      return `${store} checkout or order review was reached.`;
    case "review-ready":
      return `${store} final order review is ready for your manual confirmation.`;
    case "order-submit-clicked":
      return event.orderTotal !== undefined
        ? `${store} order submission was selected at $${event.orderTotal.toFixed(2)}.`
        : `${store} order submission was selected for the armed product.`;
    case "order-confirmed":
      return `${store} displayed an order confirmation page.`;
    case "automation-status":
      return event.message || `${store} automation status changed.`;
    case "retry-scheduled":
      return event.message || `${store} will retry this product after a bounded delay.`;
    case "automation-blocked":
      return event.message || `${store} automation was blocked by a safety check.`;
    case "store-error":
      return event.message || `${store} displayed an error while processing the product.`;
    case "traffic-overload":
      return `${store} automatic traffic is paused until the overload cooldown expires.`;
    case "queue-waiting":
      return `${store} placed this item in its official purchase queue; the companion is waiting without refreshing.`;
    default:
      return `${store} page status updated.`;
  }
}

function reduceStatus(current, event) {
  const status = { ...current };
  status.companion = "connected";
  status.lastHeartbeatAt = event.timestamp;
  status.lastPage = event.page || status.lastPage;

  if (event.eventType === "heartbeat") {
    if (!status.lastEventAt) status.lastMessage = eventMessage(event);
    return status;
  }

  const currentEventAt = Date.parse(status.lastEventAt || "");
  const incomingEventAt = Date.parse(event.timestamp || "");
  if (
    Number.isFinite(currentEventAt)
    && Number.isFinite(incomingEventAt)
    && incomingEventAt < currentEventAt
  ) return status;

  status.lastEventAt = event.timestamp;
  status.lastMessage = eventMessage(event);
  return status;
}

function reduceProductStatus(current, event) {
  const currentEventAt = Date.parse(current.lastEventAt || "");
  const incomingEventAt = Date.parse(event.timestamp || "");
  if (
    Number.isFinite(currentEventAt)
    && Number.isFinite(incomingEventAt)
    && incomingEventAt < currentEventAt
  ) return current;
  const status = { ...current };
  status.lastEventAt = event.timestamp;
  status.lastMessage = eventMessage(event);
  if (event.attempt !== undefined) status.attempts = event.attempt;
  if (event.availability) status.availability = event.availability;
  if (event.eligible !== undefined) status.eligible = event.eligible;
  if (event.reason) status.reason = event.reason;
  if (event.price !== undefined) status.observedPrice = event.price;
  if (event.orderTotal !== undefined) status.observedOrderTotal = event.orderTotal;
  if (event.seller) status.seller = event.seller;
  if (event.firstParty !== undefined) status.firstParty = event.firstParty;

  switch (event.eventType) {
    case "add-clicked":
      status.cart = "adding";
      break;
    case "added-confirmed":
    case "cart-count-increased":
    case "cart-reached":
      status.cart = status.cart === "confirmed" ? "confirmed" : "added";
      break;
    case "cart-item-confirmed":
    case "quantity-updated":
      status.cart = "confirmed";
      break;
    case "checkout-clicked":
      status.checkout = "opening";
      break;
    case "checkout-reached":
    case "order-submit-clicked":
      status.checkout = "reached";
      break;
    case "review-ready":
      status.checkout = "review-ready";
      break;
    case "order-confirmed":
      status.checkout = "reached";
      status.order = "confirmed";
      break;
    default:
      break;
  }

  return status;
}

function matchingProduct(products, event) {
  if (!event.productId) return null;
  return products.find((product) => product.id === event.productId) || null;
}

// Legacy helpers retained for settings/tests created by the original Target-only build.
function extractTcin(value) {
  return extractSku("target", value);
}

function normalizeTargetUrl(value) {
  const normalized = normalizeProductUrl(value);
  if (detectRetailer(normalized) !== "target") {
    throw new Error("Only HTTPS Target.com URLs are allowed.");
  }
  return normalized;
}

function isMatchingTcin(configuredTcin, eventTcin) {
  return !eventTcin || configuredTcin === eventTcin;
}

module.exports = {
  ACTION_MODES,
  ALERT_LEVELS,
  ALLOWED_EVENT_TYPES,
  CHECKOUT_EVIDENCE_VERSION,
  CHECKOUT_EVIDENCE_SOURCE,
  applyCheckoutPreflight,
  assertSafeArmedUpdate,
  DEFAULT_PRODUCT,
  DEFAULT_SETTINGS,
  FULFILLMENT_MODES,
  MAX_PRODUCTS,
  MAX_MISSION_GROUPS,
  MAX_WALMART_PREP_CANDIDATES,
  MAX_ELIGIBILITY_REFRESH_SECONDS,
  MAX_BLITZ_RETRY_DELAY_MS,
  MAX_BLITZ_WINDOW_SECONDS,
  MAX_OVERLOAD_COOLDOWN_SECONDS,
  MAX_RETRY_SECONDS,
  MAX_STORE_NAVIGATION_SECONDS,
  MAX_WATCHER_INTERVAL_SECONDS,
  MIN_BLITZ_RETRY_DELAY_MS,
  MIN_BLITZ_WINDOW_SECONDS,
  MIN_OVERLOAD_COOLDOWN_SECONDS,
  MIN_ELIGIBILITY_REFRESH_SECONDS,
  MIN_RETRY_SECONDS,
  MIN_STORE_NAVIGATION_SECONDS,
  MIN_WATCHER_INTERVAL_SECONDS,
  SIGNAL_ENTRY_MODES,
  createInitialStatus,
  createProductStatus,
  eventMessage,
  extractTcin,
  isMatchingTcin,
  matchingProduct,
  missionOpenUrl,
  newCompanionToken,
  normalizeProduct,
  normalizeAffiliateOpenUrl,
  normalizeMissionGroups,
  normalizeCheckoutEvidence,
  normalizeWalmartPrepCandidates,
  normalizeSettings,
  normalizeTargetUrl,
  preserveAdminCampaignFields,
  preserveCheckoutEvidence,
  productId,
  purchaseConfigFingerprint,
  reduceProductStatus,
  reduceStatus,
  sanitizePage,
  toAutomationProduct,
  toRendererProduct,
  validateEvent
};
