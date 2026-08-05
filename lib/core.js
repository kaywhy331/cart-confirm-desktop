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

const MAX_PRODUCTS = 50;
const MIN_RETRY_SECONDS = 5;
const MAX_RETRY_SECONDS = 3600;
const MIN_STORE_NAVIGATION_SECONDS = 10;
const MAX_STORE_NAVIGATION_SECONDS = 3600;
const MIN_OVERLOAD_COOLDOWN_SECONDS = 60;
const MAX_OVERLOAD_COOLDOWN_SECONDS = 86_400;
const ACTION_MODES = new Set(["cart", "checkout"]);
const REASONS = new Set([
  "eligible",
  "out-of-stock",
  "over-price",
  "third-party",
  "price-unavailable",
  "seller-unverified",
  "quantity-unavailable",
  "total-unavailable",
  "over-total",
  "cart-unverified",
  "traffic-overload",
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
  "cart-item-confirmed",
  "quantity-updated",
  "checkout-clicked",
  "checkout-reached",
  "order-submit-clicked",
  "order-confirmed",
  "retry-scheduled",
  "automation-blocked",
  "store-error",
  "traffic-overload"
]);

const DEFAULT_PRODUCT = Object.freeze({
  id: "target:1011960739",
  retailer: "target",
  productUrl: "https://www.target.com/p/restocks/A-1011960739",
  sku: "1011960739",
  maxPrice: 0,
  maxOrderTotal: 0,
  quantity: 1,
  action: "cart",
  enabled: true
});

const DEFAULT_SETTINGS = Object.freeze({
  products: Object.freeze([DEFAULT_PRODUCT]),
  automationEnabled: false,
  fastMode: true,
  retryIntervalSeconds: 15,
  storeNavigationIntervalSeconds: 20,
  overloadCooldownSeconds: 300,
  scheduledOpenEnabled: false,
  scheduledOpenAt: "",
  scheduledRetailer: "target",
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
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < minimum || seconds > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum} seconds.`);
  }
  return seconds;
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
    throw new Error("Choose either Add to cart only or Complete checkout.");
  }

  return {
    id: productId(retailer, sku),
    retailer,
    productUrl,
    sku,
    maxPrice: normalizePrice(input.maxPrice ?? 0),
    maxOrderTotal: normalizePrice(input.maxOrderTotal ?? 0),
    quantity,
    action,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : true
  };
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
    enabled: true
  };
}

function normalizeProducts(input, fallback) {
  if (Array.isArray(input) && input.length === 0) {
    throw new Error("Add at least one product to the buy list.");
  }
  let rawProducts = Array.isArray(input) ? input : null;
  if (!rawProducts) rawProducts = Array.isArray(fallback) ? fallback : null;
  if (!rawProducts?.length) rawProducts = [DEFAULT_PRODUCT];

  if (rawProducts.length > MAX_PRODUCTS) {
    throw new Error(`A buy list can contain at most ${MAX_PRODUCTS} products.`);
  }

  const products = rawProducts.map(normalizeProduct);
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
  const products = normalizeProducts(inputProducts, existingProducts);

  const retryIntervalSeconds = normalizeWholeSeconds(
    input.retryIntervalSeconds ?? existing.retryIntervalSeconds ?? DEFAULT_SETTINGS.retryIntervalSeconds,
    MIN_RETRY_SECONDS,
    MAX_RETRY_SECONDS,
    "Retry interval"
  );
  const storeNavigationIntervalSeconds = normalizeWholeSeconds(
    input.storeNavigationIntervalSeconds
      ?? existing.storeNavigationIntervalSeconds
      ?? DEFAULT_SETTINGS.storeNavigationIntervalSeconds,
    MIN_STORE_NAVIGATION_SECONDS,
    MAX_STORE_NAVIGATION_SECONDS,
    "Per-store navigation interval"
  );
  const overloadCooldownSeconds = normalizeWholeSeconds(
    input.overloadCooldownSeconds
      ?? existing.overloadCooldownSeconds
      ?? DEFAULT_SETTINGS.overloadCooldownSeconds,
    MIN_OVERLOAD_COOLDOWN_SECONDS,
    MAX_OVERLOAD_COOLDOWN_SECONDS,
    "Overload cooldown"
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

  const automationEnabled = input.automationEnabled !== undefined
    ? Boolean(input.automationEnabled)
    : Boolean(existing.automationEnabled ?? DEFAULT_SETTINGS.automationEnabled);
  if (automationEnabled) {
    const enabledProducts = products.filter((product) => product.enabled);
    if (!enabledProducts.length) {
      throw new Error("Enable at least one product before arming automation.");
    }
    if (enabledProducts.some((product) => product.maxPrice <= 0)) {
      throw new Error("Every enabled product needs a positive maximum unit price before automation can be armed.");
    }
    const checkoutProducts = enabledProducts.filter((product) => product.action === "checkout");
    if (checkoutProducts.some((product) => product.maxOrderTotal <= 0)) {
      throw new Error("Every checkout product needs a positive maximum order total before automation can be armed.");
    }
    if (checkoutProducts.some((product) => product.maxOrderTotal < product.maxPrice * product.quantity)) {
      throw new Error("A checkout product’s maximum order total cannot be below its capped item subtotal.");
    }
  }

  return {
    products,
    automationEnabled,
    fastMode: input.fastMode !== undefined
      ? Boolean(input.fastMode)
      : Boolean(existing.fastMode ?? DEFAULT_SETTINGS.fastMode),
    retryIntervalSeconds,
    storeNavigationIntervalSeconds,
    overloadCooldownSeconds,
    scheduledOpenEnabled,
    scheduledOpenAt,
    scheduledRetailer,
    automationRunId,
    companionToken
  };
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
    case "cart-item-confirmed":
      return `The exact ${store} product was confirmed in the cart.`;
    case "quantity-updated":
      return `${store} cart quantity was set to ${event.quantity}.`;
    case "checkout-clicked":
      return `${store} checkout was selected.`;
    case "checkout-reached":
      return `${store} checkout or order review was reached.`;
    case "order-submit-clicked":
      return event.orderTotal !== undefined
        ? `${store} order submission was selected at $${event.orderTotal.toFixed(2)}.`
        : `${store} order submission was selected for the armed product.`;
    case "order-confirmed":
      return `${store} displayed an order confirmation page.`;
    case "retry-scheduled":
      return `${store} will retry this product after a bounded delay.`;
    case "automation-blocked":
      return event.message || `${store} automation was blocked by a safety check.`;
    case "store-error":
      return event.message || `${store} displayed an error while processing the product.`;
    case "traffic-overload":
      return `${store} automatic traffic is paused until the overload cooldown expires.`;
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

  status.lastEventAt = event.timestamp;
  status.lastMessage = eventMessage(event);
  return status;
}

function reduceProductStatus(current, event) {
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
  ALLOWED_EVENT_TYPES,
  DEFAULT_PRODUCT,
  DEFAULT_SETTINGS,
  MAX_PRODUCTS,
  MAX_OVERLOAD_COOLDOWN_SECONDS,
  MAX_RETRY_SECONDS,
  MAX_STORE_NAVIGATION_SECONDS,
  MIN_OVERLOAD_COOLDOWN_SECONDS,
  MIN_RETRY_SECONDS,
  MIN_STORE_NAVIGATION_SECONDS,
  createInitialStatus,
  createProductStatus,
  eventMessage,
  extractTcin,
  isMatchingTcin,
  matchingProduct,
  newCompanionToken,
  normalizeProduct,
  normalizeSettings,
  normalizeTargetUrl,
  productId,
  reduceProductStatus,
  reduceStatus,
  sanitizePage,
  validateEvent
};
