"use strict";

const { MAX_PRODUCTS, normalizeProduct } = require("./core");
const { applyItemProfile, calculateOrderTotalCap } = require("./item-defaults");
const { SHARED_FIELDS, itemIdForProduct } = require("./item-missions");
const { detectRetailer, extractSku, normalizeProductUrl } = require("./retailers");

const TRACKALACKER_RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
const TRACKALACKER_IMPORT_TTL_MS = 2 * 60 * 60_000;
const MAX_TRACKALACKER_ITEMS = 500;
const MAX_TRACKALACKER_STORES = 3;
const MAX_OTHER_STORES = 12;
const MAX_PRICE_HISTORY_ENTRIES = 50;
const ACTIVE_STATES = new Set(["waiting", "scanning"]);
const FINAL_STATES = new Set(["complete", "error", "cancelled"]);
const PRICE_CLASSIFICATIONS = new Set(["normal", "surge", "above", "unknown"]);
const AUTO_MISSION_MAX_QUANTITY = 5;
const SIGNAL_ACTION_TO_MISSION = Object.freeze({
  notify: "watch",
  add_to_cart: "cart",
  prepare_checkout: "review",
  submit_order: "checkout"
});
const MISSION_ACTION_RANK = Object.freeze({ watch: 0, cart: 1, review: 2, checkout: 3 });

function cleanText(value, maximum = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function boundedCount(value, maximum = MAX_TRACKALACKER_ITEMS) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(maximum, Math.floor(number))) : 0;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1_000_000
    ? Math.round(number * 100) / 100
    : null;
}

function normalizeTimestamp(value) {
  const timestamp = new Date(value || "");
  return Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString();
}

function historyClassification(value = {}) {
  const code = cleanText(value.msrpCode, 40).toLowerCase().replaceAll("-", "_");
  const signal = `${code} ${cleanText(value.status, 60)}`.toLowerCase().replaceAll("_", " ");
  if (code === "price_surge" || /price surge|scalper/.test(signal)) return "surge";
  if (["slightly_above", "above_msrp", "greater_than"].includes(code) || /(?:slightly )?above msrp|higher than/.test(signal)) return "above";
  if (["equal_to", "less_than", "close_to", "below_msrp", "at_msrp"].includes(code)) return "normal";
  const requested = cleanText(value.classification, 20).toLowerCase();
  return PRICE_CLASSIFICATIONS.has(requested) ? requested : "unknown";
}

function normalizePriceHistory(value) {
  const entries = [];
  const seen = new Set();
  for (const raw of (Array.isArray(value) ? value : []).slice(0, MAX_PRICE_HISTORY_ENTRIES)) {
    const price = normalizePrice(raw?.price);
    const observedAt = normalizeTimestamp(raw?.observedAt || raw?.priceChangedAt);
    if (price === null || !observedAt) continue;
    const entry = {
      observedAt,
      priceChangedAt: normalizeTimestamp(raw?.priceChangedAt),
      price,
      status: cleanText(raw?.status, 60),
      msrpCode: cleanText(raw?.msrpCode, 40).toLowerCase(),
      classification: historyClassification(raw),
      isCurrent: raw?.isCurrent === true
    };
    const key = `${entry.observedAt}|${entry.price}|${entry.status}|${entry.classification}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries
    .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime())
    .slice(0, MAX_PRICE_HISTORY_ENTRIES);
}

function summarizePriceHistory(history = []) {
  if (!history.length) return null;
  const latest = history[0];
  const trusted = history.filter((entry) => entry.classification === "normal");
  const reference = trusted[0] || null;
  let previous = history.slice(1).find((entry) => Math.round(entry.price * 100) !== Math.round(latest.price * 100)) || null;
  if (!previous && history.length > 1) previous = history[1];
  const changeAmount = previous ? Math.round((latest.price - previous.price) * 100) / 100 : null;
  const prices = history.map((entry) => entry.price);
  const normalPrices = trusted.map((entry) => entry.price);
  return {
    sampleCount: history.length,
    trustedSamples: trusted.length,
    surgeSamples: history.filter((entry) => entry.classification === "surge").length,
    aboveSamples: history.filter((entry) => entry.classification === "above").length,
    latestPrice: latest.price,
    latestObservedAt: latest.observedAt,
    latestPriceChangedAt: latest.priceChangedAt,
    latestClassification: latest.classification,
    lowestPrice: Math.min(...prices),
    highestPrice: Math.max(...prices),
    normalLowPrice: normalPrices.length ? Math.min(...normalPrices) : null,
    normalHighPrice: normalPrices.length ? Math.max(...normalPrices) : null,
    referencePrice: reference?.price ?? null,
    referenceObservedAt: reference?.observedAt || "",
    referencePriceChangedAt: reference?.priceChangedAt || "",
    previousPrice: previous?.price ?? null,
    changeAmount,
    trend: changeAmount === null ? "unknown" : changeAmount > 0 ? "up" : changeAmount < 0 ? "down" : "steady"
  };
}

function normalizeTrackalackerUrl(value, kind = "product") {
  const raw = cleanText(value, 2_048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const allowedHost = host === "trackalacker.com" || host === "www.trackalacker.com";
    const productPath = /^\/products\/showcase\/[a-z0-9][a-z0-9-]*(?:\/)?$/i;
    const historyPath = /^\/products\/showcase\/[a-z0-9][a-z0-9-]*\/listings\/\d+\/[a-z0-9][a-z0-9-]*(?:\/)?$/i;
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || !allowedHost
      || !(kind === "history" ? historyPath : productPath).test(url.pathname)
    ) return "";
    url.hostname = "www.trackalacker.com";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeTrackalackerImageUrl(value) {
  const raw = cleanText(value, 2_048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || !(host === "trackalacker.com" || host.endsWith(".trackalacker.com"))
    ) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function emptyTrackalackerState() {
  return { version: 3, activeImport: null, items: [], stagingItems: [], lastImport: null };
}

function normalizeImportStatus(value, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  const id = cleanText(value.id, 80);
  const startedAt = normalizeTimestamp(value.startedAt);
  if (!id || !startedAt) return null;
  let state = ACTIVE_STATES.has(value.state) || FINAL_STATES.has(value.state)
    ? value.state
    : "waiting";
  const expiresAt = normalizeTimestamp(value.expiresAt)
    || new Date(new Date(startedAt).getTime() + TRACKALACKER_IMPORT_TTL_MS).toISOString();
  let error = cleanText(value.error, 240);
  let message = cleanText(value.message, 240);
  if (ACTIVE_STATES.has(state) && new Date(expiresAt).getTime() <= now) {
    state = "error";
    error = "The TrackaLacker scan expired before it finished. Start a new scan to resume.";
    message = error;
  }
  return {
    id,
    state,
    startedAt,
    updatedAt: normalizeTimestamp(value.updatedAt) || startedAt,
    expiresAt,
    page: boundedCount(value.page, 100),
    pages: boundedCount(value.pages, 100),
    discovered: boundedCount(value.discovered),
    processed: boundedCount(value.processed),
    captured: boundedCount(value.captured),
    failed: boundedCount(value.failed),
    currentTitle: cleanText(value.currentTitle, 80),
    message,
    error
  };
}

function historyMatchesProduct(historyUrl, sourceUrl) {
  try {
    const productPath = new URL(sourceUrl).pathname.replace(/\/$/, "");
    return new URL(historyUrl).pathname.startsWith(`${productPath}/listings/`);
  } catch {
    return false;
  }
}

function normalizeStore(value, sourceProductId, sourceUrl) {
  const retailer = cleanText(value?.retailer, 20).toLowerCase();
  if (!TRACKALACKER_RETAILERS.includes(retailer)) return null;
  let productUrl;
  try {
    productUrl = normalizeProductUrl(value?.productUrl);
  } catch {
    return null;
  }
  if (detectRetailer(productUrl) !== retailer) return null;
  const sku = extractSku(retailer, productUrl);
  if (!sku) return null;
  const requestedSku = retailer === "amazon"
    ? cleanText(value?.sku, 20).toUpperCase()
    : cleanText(value?.sku, 20);
  if (requestedSku && requestedSku !== sku) return null;
  const listingId = cleanText(value?.listingId, 30);
  const historyUrl = normalizeTrackalackerUrl(value?.historyUrl, "history");
  if (
    !/^\d{1,20}$/.test(listingId)
    || !historyUrl
    || !historyUrl.includes(`/listings/${listingId}/`)
    || !historyMatchesProduct(historyUrl, sourceUrl)
  ) return null;
  const priceHistory = normalizePriceHistory(value?.priceHistory);
  const priceHistorySummary = summarizePriceHistory(priceHistory);
  const capturedExpectedPrice = normalizePrice(value?.expectedPrice);
  const hasFreshNormalReference = priceHistorySummary?.referencePrice !== null
    && priceHistorySummary?.referencePrice !== undefined;
  const legacyHistoryReference = !priceHistory.length
    && capturedExpectedPrice !== null
    && value?.priceConfidence === "history";
  const expectedPrice = hasFreshNormalReference
    ? priceHistorySummary.referencePrice
    : capturedExpectedPrice;
  const confidence = hasFreshNormalReference || legacyHistoryReference
    ? "history"
    : expectedPrice !== null && value?.priceConfidence === "product"
      ? "product"
      : "unavailable";
  return {
    id: `${retailer}:${sku}`,
    retailer,
    sku,
    listingId,
    productUrl,
    historyUrl,
    currentPrice: priceHistorySummary?.latestPrice ?? normalizePrice(value?.currentPrice),
    expectedPrice,
    priceConfidence: confidence,
    historySamples: priceHistorySummary?.trustedSamples ?? boundedCount(value?.historySamples, MAX_PRICE_HISTORY_ENTRIES),
    historyObservedAt: priceHistorySummary?.referencePriceChangedAt
      || priceHistorySummary?.referenceObservedAt
      || normalizeTimestamp(value?.historyObservedAt),
    priceHistory,
    priceHistorySummary,
    status: cleanText(value?.status, 60),
    alternateCount: boundedCount(value?.alternateCount, 20),
    sourceProductId
  };
}

function normalizeOtherStore(value, sourceUrl) {
  const store = cleanText(value?.store, 50);
  const listingId = cleanText(value?.listingId, 30);
  const historyUrl = normalizeTrackalackerUrl(value?.historyUrl, "history");
  if (!store || !/^\d{1,20}$/.test(listingId) || !historyUrl || !historyMatchesProduct(historyUrl, sourceUrl)) return null;
  return { store, listingId, historyUrl };
}

function normalizeTrackalackerItem(value) {
  const sourceProductId = cleanText(value?.sourceProductId, 30);
  const sourceUrl = normalizeTrackalackerUrl(value?.sourceUrl, "product");
  const title = cleanText(value?.title, 80);
  if (!/^\d{1,20}$/.test(sourceProductId) || !sourceUrl || !title) return null;
  const stores = [];
  const seenRetailers = new Set();
  for (const rawStore of (Array.isArray(value?.stores) ? value.stores : []).slice(0, 12)) {
    const store = normalizeStore(rawStore, sourceProductId, sourceUrl);
    if (!store || seenRetailers.has(store.retailer)) continue;
    seenRetailers.add(store.retailer);
    stores.push(store);
    if (stores.length >= MAX_TRACKALACKER_STORES) break;
  }
  const otherStores = [];
  const seenOtherListings = new Set();
  for (const rawStore of (Array.isArray(value?.otherStores) ? value.otherStores : []).slice(0, MAX_OTHER_STORES)) {
    const store = normalizeOtherStore(rawStore, sourceUrl);
    if (!store || seenOtherListings.has(store.listingId)) continue;
    seenOtherListings.add(store.listingId);
    otherStores.push(store);
  }
  return {
    id: `trackalacker:${sourceProductId}`,
    sourceProductId,
    sourceUrl,
    title,
    imageUrl: normalizeTrackalackerImageUrl(value?.imageUrl),
    displayPrice: normalizePrice(value?.displayPrice),
    stores,
    otherStores,
    capturedAt: normalizeTimestamp(value?.capturedAt) || new Date().toISOString()
  };
}

function normalizeTrackalackerState(value, now = Date.now()) {
  const source = value && typeof value === "object" ? value : {};
  function normalizeItems(input) {
    const items = [];
    const seen = new Set();
    for (const rawItem of (Array.isArray(input) ? input : []).slice(0, MAX_TRACKALACKER_ITEMS)) {
      const item = normalizeTrackalackerItem(rawItem);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    return items;
  }
  const items = normalizeItems(source.items);
  const activeImport = normalizeImportStatus(source.activeImport, now);
  // Version 2 used `items` as the live, partially rebuilt collection. Preserve
  // those mappings on migration and seed staging from them so an in-flight
  // legacy scan can finish without creating a matching outage.
  const stagingItems = Number(source.version) >= 3
    ? normalizeItems(source.stagingItems)
    : activeImport && ACTIVE_STATES.has(activeImport.state)
      ? [...items]
      : [];
  return {
    version: 3,
    activeImport,
    items,
    stagingItems,
    lastImport: normalizeImportStatus(source.lastImport, now)
  };
}

function beginTrackalackerImport(state, options = {}) {
  const now = Number(options.now ?? Date.now());
  const id = cleanText(options.id, 80);
  if (!id) throw new Error("The TrackaLacker scan requires a local import ID.");
  const normalized = normalizeTrackalackerState(state, now);
  const active = normalized.activeImport;
  if (active && ACTIVE_STATES.has(active.state)) {
    throw new Error("A TrackaLacker scan is already running.");
  }
  const startedAt = new Date(now).toISOString();
  return {
    version: 3,
    items: normalized.items,
    stagingItems: [],
    lastImport: normalized.lastImport || (active && FINAL_STATES.has(active.state) ? active : null),
    activeImport: {
      id,
      state: "waiting",
      startedAt,
      updatedAt: startedAt,
      expiresAt: new Date(now + TRACKALACKER_IMPORT_TTL_MS).toISOString(),
      page: 0,
      pages: 0,
      discovered: 0,
      processed: 0,
      captured: 0,
      failed: 0,
      currentTitle: "",
      message: "Waiting for the browser companion on your followed-products page…",
      error: ""
    }
  };
}

function updateImportProgress(active, payload, now) {
  const next = {
    ...active,
    state: payload.phase === "started" ? "scanning" : active.state,
    updatedAt: new Date(now).toISOString(),
    page: boundedCount(payload.page ?? active.page, 100),
    pages: boundedCount(payload.pages ?? active.pages, 100),
    discovered: boundedCount(payload.discovered ?? active.discovered),
    processed: boundedCount(payload.processed ?? active.processed),
    captured: boundedCount(payload.captured ?? active.captured),
    failed: boundedCount(payload.failed ?? active.failed),
    currentTitle: cleanText(payload.currentTitle ?? active.currentTitle, 80),
    message: cleanText(payload.message ?? active.message, 240),
    error: ""
  };
  if (payload.phase === "complete") {
    next.state = "complete";
    next.currentTitle = "";
    next.message ||= `Captured ${next.captured} followed product${next.captured === 1 ? "" : "s"}.`;
  } else if (payload.phase === "error") {
    next.state = "error";
    next.currentTitle = "";
    next.error = cleanText(payload.error, 240) || "The TrackaLacker scan failed.";
    next.message = next.error;
  }
  return next;
}

function acceptTrackalackerCaptureFromNormalizedState(normalized, payload = {}, now = Date.now()) {
  if (
    !normalized
    || normalized.version !== 3
    || !Array.isArray(normalized.items)
    || normalized.items.length > MAX_TRACKALACKER_ITEMS
    || !Array.isArray(normalized.stagingItems)
    || normalized.stagingItems.length > MAX_TRACKALACKER_ITEMS
  ) throw new Error("The TrackaLacker import state is invalid.");
  const active = normalized.activeImport;
  if (!active || !ACTIVE_STATES.has(active.state)) {
    throw new Error("No TrackaLacker scan is currently accepting results.");
  }
  if (cleanText(payload.importId, 80) !== active.id) {
    throw new Error("These TrackaLacker results do not match the active scan.");
  }
  const phases = new Set(["started", "inventory", "product", "progress", "complete", "error"]);
  if (!phases.has(payload.phase)) throw new Error("The TrackaLacker capture phase is invalid.");

  const stagingItems = [...normalized.stagingItems];
  let accepted = 0;
  if (payload.phase === "product") {
    const item = normalizeTrackalackerItem(payload.item);
    if (!item) throw new Error("The TrackaLacker product capture is invalid.");
    const existingIndex = stagingItems.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex >= 0) stagingItems[existingIndex] = item;
    else if (stagingItems.length < MAX_TRACKALACKER_ITEMS) stagingItems.push(item);
    else throw new Error(`A TrackaLacker scan can capture at most ${MAX_TRACKALACKER_ITEMS} products.`);
    accepted = 1;
  }
  const activeImport = updateImportProgress(active, payload, now);
  const completed = activeImport.state === "complete";
  const failed = activeImport.state === "error";
  return {
    state: {
      version: 3,
      items: completed ? stagingItems : normalized.items,
      stagingItems: completed || failed ? [] : stagingItems,
      activeImport,
      lastImport: FINAL_STATES.has(activeImport.state) ? activeImport : normalized.lastImport
    },
    accepted
  };
}

function acceptTrackalackerCapture(state, payload = {}, now = Date.now()) {
  return acceptTrackalackerCaptureFromNormalizedState(
    normalizeTrackalackerState(state, now),
    payload,
    now
  );
}

function cancelTrackalackerImport(state, now = Date.now()) {
  const normalized = normalizeTrackalackerState(state, now);
  const active = normalized.activeImport;
  if (!active || !ACTIVE_STATES.has(active.state)) return normalized;
  const cancelled = {
    ...active,
    state: "cancelled",
    updatedAt: new Date(now).toISOString(),
    currentTitle: "",
    message: "TrackaLacker scan cancelled.",
    error: ""
  };
  return { ...normalized, stagingItems: [], activeImport: cancelled, lastImport: cancelled };
}

function clearTrackalackerState() {
  return emptyTrackalackerState();
}

function publicTrackalackerState(state) {
  const source = state && typeof state === "object" ? state : emptyTrackalackerState();
  const { stagingItems, ...publicSource } = source;
  return {
    ...publicSource,
    stagingCount: Array.isArray(stagingItems) ? stagingItems.length : 0,
    items: (source.items || []).map((item) => ({
      ...item,
      stores: (item.stores || []).map(({ priceHistory, ...store }) => ({
        ...store,
        priceHistorySummary: store.priceHistorySummary ? { ...store.priceHistorySummary } : null
      }))
    }))
  };
}

function trackalackerPriceHistory(state, itemId, retailer, listingId) {
  const normalizedItemId = cleanText(itemId, 80);
  const normalizedRetailer = cleanText(retailer, 20).toLowerCase();
  const normalizedListingId = cleanText(listingId, 30);
  if (
    !/^trackalacker:\d{1,20}$/.test(normalizedItemId)
    || !TRACKALACKER_RETAILERS.includes(normalizedRetailer)
    || !/^\d{1,20}$/.test(normalizedListingId)
  ) {
    throw new Error("Choose a valid TrackaLacker item and retailer.");
  }
  const item = (state?.items || []).find((candidate) => candidate.id === normalizedItemId);
  const store = item?.stores?.find((candidate) => candidate.retailer === normalizedRetailer);
  if (!store || store.listingId !== normalizedListingId) {
    throw new Error("That TrackaLacker store history is no longer available.");
  }
  return {
    itemId: normalizedItemId,
    retailer: normalizedRetailer,
    listingId: normalizedListingId,
    summary: store.priceHistorySummary ? { ...store.priceHistorySummary } : null,
    entries: (store.priceHistory || []).map((entry) => ({ ...entry }))
  };
}

function missionFromTrackalacker(item, store, defaults = {}) {
  const expectedPrice = store.expectedPrice || 0;
  const inert = normalizeProduct({
    itemId: item.id,
    retailer: store.retailer,
    sku: store.sku,
    title: item.title,
    imageUrl: item.imageUrl,
    productUrl: store.productUrl,
    maxPrice: expectedPrice,
    maxOrderTotal: 0,
    quantity: 1,
    action: "watch",
    alertLevel: "standard",
    fulfillmentMode: "manual",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    enabled: false,
    sourceProvider: "trackalacker",
    sourceProductId: item.sourceProductId,
    sourceUrl: item.sourceUrl,
    sourceListingId: store.listingId,
    sourceListingUrl: store.historyUrl,
    expectedPrice,
    expectedPriceConfidence: store.priceConfidence,
    expectedPriceObservedAt: store.historyObservedAt,
    sourcePriceSummary: store.priceHistorySummary,
    priceSource: store.priceConfidence === "history" ? "trackalacker-history" : "trackalacker-product"
  });
  if (!defaults.profile) return inert;
  const profiled = normalizeProduct(applyItemProfile(
    inert,
    defaults.profile,
    defaults.msrpCatalog || [],
    {
      preferExistingPrice: true,
      storeOrderAllowances: defaults.storeOrderAllowances,
      orderTaxPercent: defaults.orderTaxPercent
    }
  ));
  return {
    ...profiled,
    // A same-store, non-surge history is sufficiently specific for the chosen
    // profile. A product-level fallback remains Off until the operator reviews
    // the store cap, even though the estimated value is retained for editing.
    enabled: profiled.enabled && store.priceConfidence === "history"
  };
}

function exactSignalListing(state, resolution) {
  if (resolution?.state !== "matched" || resolution.mission || !resolution.mapping) return null;
  const mapping = resolution.mapping;
  const item = (Array.isArray(state?.items) ? state.items : []).find((candidate) => (
    candidate.id === mapping.itemId
    && candidate.sourceProductId === mapping.sourceProductId
    && candidate.sourceUrl === mapping.sourceUrl
  ));
  const store = item?.stores?.find((candidate) => (
    candidate.id === mapping.productId
    && candidate.retailer === mapping.retailer
    && candidate.sku === mapping.sku
    && candidate.listingId === mapping.listingId
    && candidate.productUrl === mapping.productUrl
    && candidate.historyUrl === mapping.listingUrl
  ));
  return item && store ? { item, store } : null;
}

function applySignalStrategyCeiling(mission, strategies) {
  if (!Array.isArray(strategies) || !strategies.length) return mission;
  const enabled = strategies.filter((strategy) => strategy?.enabled !== false);
  let action = "watch";
  let quantity = 1;
  let allowTenPercent = false;
  for (const strategy of enabled) {
    const candidateAction = SIGNAL_ACTION_TO_MISSION[strategy.action] || "watch";
    if (MISSION_ACTION_RANK[candidateAction] > MISSION_ACTION_RANK[action]) action = candidateAction;
    const candidateQuantity = strategy.quantity === "max"
      ? AUTO_MISSION_MAX_QUANTITY
      : Number(strategy.quantity);
    if (Number.isInteger(candidateQuantity) && candidateQuantity >= 1 && candidateQuantity <= AUTO_MISSION_MAX_QUANTITY) {
      quantity = Math.max(quantity, candidateQuantity);
    }
    if (["slightly_above_msrp", "above_msrp"].includes(strategy.priceBand)) allowTenPercent = true;
  }
  const referencePrice = Number(mission.maxPrice);
  const maxPrice = allowTenPercent && Number.isFinite(referencePrice) && referencePrice > 0
    ? Math.round(referencePrice * 1.1 * 100) / 100
    : mission.maxPrice;
  return {
    ...mission,
    action,
    quantity,
    maxPrice,
    itemProfileId: "",
    priceSource: maxPrice > referencePrice
      ? "trackalacker-reference+strategy"
      : mission.priceSource
  };
}

function planTrackalackerSignalMission(
  state,
  resolution,
  existingProducts = [],
  maximum = MAX_PRODUCTS,
  defaults = {}
) {
  const exact = exactSignalListing(state, resolution);
  if (!exact) {
    return {
      state: "untrusted-listing",
      mission: null,
      reason: "The resolved signal no longer matches one exact pre-synced TrackaLacker listing."
    };
  }
  if (existingProducts.some((product) => (
    product.id === resolution.mapping.productId
    || `${itemIdForProduct(product)}:${product.retailer}` === `${resolution.mapping.itemId}:${resolution.mapping.retailer}`
  ))) {
    return {
      state: "duplicate",
      mission: null,
      reason: "A CartCollect mission already exists for this TrackaLacker item and store."
    };
  }
  if (existingProducts.length >= maximum) {
    return {
      state: "capacity",
      mission: null,
      reason: `The item plan already contains ${maximum} store options, so this signal could not create another mission.`
    };
  }

  let mission = missionFromTrackalacker(exact.item, exact.store, defaults);
  const sibling = existingProducts.find((product) => itemIdForProduct(product) === resolution.mapping.itemId);
  if (sibling) {
    mission = {
      ...mission,
      ...Object.fromEntries(SHARED_FIELDS.map((field) => [field, sibling[field]]))
    };
  } else {
    mission = applySignalStrategyCeiling(mission, defaults.signalStrategies);
  }
  if (!sibling && mission.maxPrice <= 0 && mission.action !== "watch") {
    // A real signal can establish that this exact listing exists, but it
    // cannot invent a purchase cap. Keep the new mission active as Watch-only
    // until an operator supplies a trusted price ceiling.
    mission = {
      ...mission,
      quantity: 1,
      action: "watch",
      itemProfileId: "",
      maxOrderTotal: 0
    };
  }

  if (mission.maxPrice <= 0 && mission.action !== "watch") {
    return {
      state: "missing-price-cap",
      mission: null,
      reason: "The exact listing has no pre-synced price cap and its existing item is purchase-capable, so CartCollect did not create an unsafe store option."
    };
  }

  mission = normalizeProduct({
    ...mission,
    enabled: true,
    maxOrderTotal: calculateOrderTotalCap(
      mission,
      defaults.storeOrderAllowances,
      defaults.orderTaxPercent
    )
  });
  const watchFallback = mission.action === "watch" && mission.maxPrice <= 0;
  return {
    state: watchFallback ? "created-watch" : "created",
    mission,
    reason: watchFallback
      ? "Created an active Watch mission from the exact pre-synced TrackaLacker listing; no purchase action is allowed until a price cap is reviewed."
      : "Created an active mission from the exact pre-synced TrackaLacker listing using the saved signal-strategy ceiling, default fulfillment profile, and reference-price cap."
  };
}

function normalizeSelections(value) {
  const requested = [];
  const seen = new Set();
  for (const entry of (Array.isArray(value) ? value : []).slice(0, MAX_TRACKALACKER_ITEMS)) {
    const productId = cleanText(entry?.productId, 80);
    if (!/^trackalacker:\d{1,20}$/.test(productId) || seen.has(productId)) continue;
    seen.add(productId);
    const retailers = [...new Set((Array.isArray(entry?.retailers) ? entry.retailers : [])
      .map((retailer) => cleanText(retailer, 20).toLowerCase()))]
      .filter((retailer) => TRACKALACKER_RETAILERS.includes(retailer));
    requested.push({ productId, retailers });
  }
  return requested;
}

function planTrackalackerMissionImport(state, selections, existingProducts = [], maximum = MAX_PRODUCTS, defaults = {}) {
  const requested = normalizeSelections(selections);
  const byId = new Map((state?.items || []).map((item) => [item.id, item]));
  const existingRouteIds = new Set(existingProducts.map((product) => cleanText(product?.id, 80)));
  const existingItemStores = new Set(existingProducts.map((product) => (
    `${itemIdForProduct(product)}:${cleanText(product?.retailer, 20)}`
  )));
  const additions = [];
  const importedItemIds = new Set();
  let selectedStores = 0;
  let duplicates = 0;
  let missing = 0;
  let overCapacity = 0;

  for (const request of requested) {
    const item = byId.get(request.productId);
    if (!item) {
      missing += Math.max(1, request.retailers.length);
      continue;
    }
    const storeByRetailer = new Map(item.stores.map((store) => [store.retailer, store]));
    for (const retailer of request.retailers) {
      selectedStores += 1;
      const store = storeByRetailer.get(retailer);
      if (!store) {
        missing += 1;
        continue;
      }
      if (existingRouteIds.has(store.id) || existingItemStores.has(`${item.id}:${retailer}`)) {
        duplicates += 1;
        continue;
      }
      if (existingProducts.length + additions.length >= maximum) {
        overCapacity += 1;
        continue;
      }
      const mission = missionFromTrackalacker(item, store, defaults);
      existingRouteIds.add(mission.id);
      existingItemStores.add(`${item.id}:${retailer}`);
      additions.push(mission);
      importedItemIds.add(item.id);
    }
  }

  const ready = additions.filter((mission) => mission.enabled).length;
  return {
    additions,
    summary: {
      selectedItems: requested.length,
      selectedStores,
      importedItems: importedItemIds.size,
      importedStores: additions.length,
      ready,
      needsReview: additions.length - ready,
      duplicates,
      missing,
      overCapacity
    }
  };
}

module.exports = {
  MAX_TRACKALACKER_ITEMS,
  MAX_PRICE_HISTORY_ENTRIES,
  TRACKALACKER_IMPORT_TTL_MS,
  TRACKALACKER_RETAILERS,
  acceptTrackalackerCapture,
  acceptTrackalackerCaptureFromNormalizedState,
  beginTrackalackerImport,
  cancelTrackalackerImport,
  clearTrackalackerState,
  emptyTrackalackerState,
  missionFromTrackalacker,
  normalizeTrackalackerImageUrl,
  normalizeTrackalackerItem,
  normalizeTrackalackerState,
  normalizeTrackalackerUrl,
  planTrackalackerSignalMission,
  planTrackalackerMissionImport,
  publicTrackalackerState,
  summarizePriceHistory,
  trackalackerPriceHistory
};
