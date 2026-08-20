"use strict";

const { MAX_PRODUCTS, normalizeProduct } = require("./core");
const { applyItemProfile } = require("./item-defaults");
const { itemIdForProduct } = require("./item-missions");
const { detectRetailer, extractSku, normalizeProductUrl } = require("./retailers");

const TRACKALACKER_RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
const TRACKALACKER_IMPORT_TTL_MS = 2 * 60 * 60_000;
const MAX_TRACKALACKER_ITEMS = 500;
const MAX_TRACKALACKER_STORES = 3;
const MAX_OTHER_STORES = 12;
const ACTIVE_STATES = new Set(["waiting", "scanning"]);
const FINAL_STATES = new Set(["complete", "error", "cancelled"]);

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
  return { version: 1, activeImport: null, items: [], lastImport: null };
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
  const expectedPrice = normalizePrice(value?.expectedPrice);
  const confidence = value?.priceConfidence === "history"
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
    currentPrice: normalizePrice(value?.currentPrice),
    expectedPrice,
    priceConfidence: confidence,
    historySamples: boundedCount(value?.historySamples, 50),
    historyObservedAt: normalizeTimestamp(value?.historyObservedAt),
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
  const items = [];
  const seen = new Set();
  for (const rawItem of (Array.isArray(source.items) ? source.items : []).slice(0, MAX_TRACKALACKER_ITEMS)) {
    const item = normalizeTrackalackerItem(rawItem);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return {
    version: 1,
    activeImport: normalizeImportStatus(source.activeImport, now),
    items,
    lastImport: normalizeImportStatus(source.lastImport, now)
  };
}

function beginTrackalackerImport(state, options = {}) {
  const now = Number(options.now ?? Date.now());
  const id = cleanText(options.id, 80);
  if (!id) throw new Error("The TrackaLacker scan requires a local import ID.");
  const active = normalizeImportStatus(state?.activeImport, now);
  if (active && ACTIVE_STATES.has(active.state)) {
    throw new Error("A TrackaLacker scan is already running.");
  }
  const startedAt = new Date(now).toISOString();
  return {
    version: 1,
    items: [],
    lastImport: state?.lastImport || (active && FINAL_STATES.has(active.state) ? active : null),
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

function acceptTrackalackerCapture(state, payload = {}, now = Date.now()) {
  const normalized = normalizeTrackalackerState(state, now);
  const active = normalized.activeImport;
  if (!active || !ACTIVE_STATES.has(active.state)) {
    throw new Error("No TrackaLacker scan is currently accepting results.");
  }
  if (cleanText(payload.importId, 80) !== active.id) {
    throw new Error("These TrackaLacker results do not match the active scan.");
  }
  const phases = new Set(["started", "inventory", "product", "progress", "complete", "error"]);
  if (!phases.has(payload.phase)) throw new Error("The TrackaLacker capture phase is invalid.");

  const items = [...normalized.items];
  let accepted = 0;
  if (payload.phase === "product") {
    const item = normalizeTrackalackerItem(payload.item);
    if (!item) throw new Error("The TrackaLacker product capture is invalid.");
    const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex >= 0) items[existingIndex] = item;
    else if (items.length < MAX_TRACKALACKER_ITEMS) items.push(item);
    else throw new Error(`A TrackaLacker scan can capture at most ${MAX_TRACKALACKER_ITEMS} products.`);
    accepted = 1;
  }
  const activeImport = updateImportProgress(active, payload, now);
  return {
    state: {
      version: 1,
      items,
      activeImport,
      lastImport: FINAL_STATES.has(activeImport.state) ? activeImport : normalized.lastImport
    },
    accepted
  };
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
  return { ...normalized, activeImport: cancelled, lastImport: cancelled };
}

function clearTrackalackerState() {
  return emptyTrackalackerState();
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
  TRACKALACKER_IMPORT_TTL_MS,
  TRACKALACKER_RETAILERS,
  acceptTrackalackerCapture,
  beginTrackalackerImport,
  cancelTrackalackerImport,
  clearTrackalackerState,
  emptyTrackalackerState,
  missionFromTrackalacker,
  normalizeTrackalackerImageUrl,
  normalizeTrackalackerItem,
  normalizeTrackalackerState,
  normalizeTrackalackerUrl,
  planTrackalackerMissionImport
};
