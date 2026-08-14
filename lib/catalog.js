"use strict";

const { MAX_PRODUCTS, MAX_WALMART_PREP_CANDIDATES, normalizeProduct } = require("./core");
const { applyItemProfile } = require("./item-defaults");
const { detectRetailer, extractSku, normalizeProductUrl } = require("./retailers");

const CATALOG_RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
const CATALOG_SEARCH_TTL_MS = 10 * 60_000;
const MAX_CATALOG_ITEMS = 200;
const MAX_RESULTS_PER_CAPTURE = 20;

function cleanText(value, maximum) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizeCatalogQuery(value) {
  const query = cleanText(value, 80);
  if (query.length < 2) throw new Error("Enter a keyword search from 2 to 80 characters.");
  return query;
}

function queryKey(value) {
  return normalizeCatalogQuery(value).toLocaleLowerCase("en-US");
}

function normalizeCatalogRetailers(value) {
  const selected = [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").toLowerCase()))]
    .filter((item) => CATALOG_RETAILERS.includes(item));
  if (!selected.length) throw new Error("Choose at least one retailer to search.");
  return selected;
}

function normalizeWordFilter(value) {
  return cleanText(value, 120)
    .split(/[\s,]+/)
    .map((word) => word.toLocaleLowerCase("en-US"))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeCatalogFilters(value = {}) {
  const rawMaximum = value.maxPrice ?? value.maximumDisplayedPrice;
  let maxPrice = null;
  if (rawMaximum !== null && rawMaximum !== undefined && String(rawMaximum).trim() !== "") {
    maxPrice = Number(rawMaximum);
    if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > 1_000_000) {
      throw new Error("Maximum displayed price must be between $0.01 and $1,000,000.00.");
    }
    maxPrice = Math.round(maxPrice * 100) / 100;
  }
  return {
    includeWords: normalizeWordFilter(value.includeWords),
    excludeWords: normalizeWordFilter(value.excludeWords),
    maxPrice
  };
}

function emptyCatalogState() {
  return { version: 1, activeSearch: null, items: [] };
}

function officialSearchUrl(retailer, query) {
  const encoded = encodeURIComponent(normalizeCatalogQuery(query));
  if (retailer === "target") return `https://www.target.com/s?searchTerm=${encoded}`;
  if (retailer === "walmart") return `https://www.walmart.com/search?q=${encoded}`;
  if (retailer === "amazon") return `https://www.amazon.com/s?k=${encoded}`;
  throw new Error("Choose Target, Walmart, or Amazon for this catalog search.");
}

function beginCatalogSearch(state, input = {}, options = {}) {
  const query = normalizeCatalogQuery(input.query);
  const retailers = normalizeCatalogRetailers(input.retailers);
  const filters = normalizeCatalogFilters(input.filters);
  const now = Number(options.now ?? Date.now());
  const id = cleanText(options.id, 80);
  if (!id) throw new Error("The catalog search requires a local search ID.");
  const status = Object.fromEntries(retailers.map((retailer) => [retailer, {
    state: "opening",
    count: 0,
    updatedAt: new Date(now).toISOString()
  }]));
  return {
    version: 1,
    // A new user search replaces the inbox. This prevents old query results
    // from being mistaken for matches to the current filters.
    items: [],
    activeSearch: {
      id,
      query,
      retailers,
      filters,
      startedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CATALOG_SEARCH_TTL_MS).toISOString(),
      status
    }
  };
}

function normalizeCatalogItem(value, expectedRetailer, search, now) {
  const requestedRetailer = String(value?.retailer || "").toLowerCase();
  if (requestedRetailer !== expectedRetailer) return null;
  let productUrl;
  try {
    productUrl = normalizeProductUrl(value?.productUrl);
  } catch {
    return null;
  }
  const retailer = detectRetailer(productUrl);
  const sku = extractSku(retailer, productUrl);
  const requestedSku = retailer === "amazon"
    ? String(value?.sku || "").trim().toUpperCase()
    : String(value?.sku || "").trim();
  if (retailer !== expectedRetailer || !sku || requestedSku !== sku) return null;
  const title = cleanText(value?.title, 80);
  if (!title) return null;
  const numericPrice = Number(value?.price);
  const price = Number.isFinite(numericPrice) && numericPrice > 0 && numericPrice <= 1_000_000
    ? Math.round(numericPrice * 100) / 100
    : null;
  return {
    id: `${retailer}:${sku}`,
    retailer,
    sku,
    title,
    productUrl,
    price,
    observedAt: new Date(now).toISOString(),
    searchId: search.id,
    query: search.query
  };
}

function itemMatchesFilters(item, filters) {
  const searchable = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US");
  const title = searchable(item.title);
  if (filters.includeWords.some((word) => !title.includes(searchable(word)))) return false;
  if (filters.excludeWords.some((word) => title.includes(searchable(word)))) return false;
  if (filters.maxPrice !== null && (item.price === null || item.price > filters.maxPrice)) return false;
  return true;
}

function acceptCatalogResults(state, payload = {}, now = Date.now()) {
  const search = state?.activeSearch;
  if (!search) throw new Error("No catalog search is currently accepting results.");
  if (new Date(search.expiresAt).getTime() <= now) throw new Error("This catalog search expired. Start it again.");
  if (String(payload.searchId || "") !== search.id) throw new Error("These results do not match the active catalog search.");
  const retailer = String(payload.retailer || "").toLowerCase();
  if (!search.retailers.includes(retailer)) throw new Error("This retailer is not part of the active catalog search.");
  if (queryKey(payload.query) !== queryKey(search.query)) throw new Error("These results do not match the active keyword query.");

  const accepted = [];
  const seen = new Set();
  for (const rawItem of (Array.isArray(payload.results) ? payload.results : []).slice(0, MAX_RESULTS_PER_CAPTURE)) {
    const item = normalizeCatalogItem(rawItem, retailer, search, now);
    if (!item || seen.has(item.id) || !itemMatchesFilters(item, search.filters)) continue;
    seen.add(item.id);
    accepted.push(item);
  }

  const retained = (state.items || []).filter((item) => item.retailer !== retailer && item.searchId === search.id);
  const items = [...retained, ...accepted].slice(0, MAX_CATALOG_ITEMS);
  return {
    state: {
      version: 1,
      activeSearch: {
        ...search,
        status: {
          ...search.status,
          [retailer]: {
            state: "captured",
            count: accepted.length,
            updatedAt: new Date(now).toISOString()
          }
        }
      },
      items
    },
    accepted: accepted.length
  };
}

function normalizePersistedCatalogItem(value) {
  const retailer = String(value?.retailer || "").toLowerCase();
  if (!CATALOG_RETAILERS.includes(retailer)) return null;
  return normalizeCatalogItem(value, retailer, {
    id: cleanText(value?.searchId, 80) || "restored",
    query: cleanText(value?.query, 80) || "Restored catalog"
  }, new Date(value?.observedAt || 0).getTime() || Date.now());
}

function normalizeCatalogState(value, now = Date.now()) {
  const source = value && typeof value === "object" ? value : {};
  const items = [];
  const seen = new Set();
  for (const rawItem of (Array.isArray(source.items) ? source.items : []).slice(0, MAX_CATALOG_ITEMS)) {
    const item = normalizePersistedCatalogItem(rawItem);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  const rawSearch = source.activeSearch;
  let activeSearch = null;
  if (rawSearch && new Date(rawSearch.expiresAt).getTime() > now) {
    try {
      const query = normalizeCatalogQuery(rawSearch.query);
      const retailers = normalizeCatalogRetailers(rawSearch.retailers);
      activeSearch = {
        id: cleanText(rawSearch.id, 80),
        query,
        retailers,
        filters: normalizeCatalogFilters(rawSearch.filters),
        startedAt: new Date(rawSearch.startedAt).toISOString(),
        expiresAt: new Date(rawSearch.expiresAt).toISOString(),
        status: Object.fromEntries(retailers.map((retailer) => {
          const entry = rawSearch.status?.[retailer] || {};
          return [retailer, {
            state: ["opening", "captured", "error"].includes(entry.state) ? entry.state : "opening",
            count: Math.max(0, Math.min(MAX_RESULTS_PER_CAPTURE, Number(entry.count) || 0)),
            updatedAt: new Date(entry.updatedAt || rawSearch.startedAt).toISOString()
          }];
        }))
      };
      if (!activeSearch.id) activeSearch = null;
    } catch {
      activeSearch = null;
    }
  }
  return { version: 1, activeSearch, items };
}

function catalogMissionFromItem(item, defaults = {}) {
  const inertMission = normalizeProduct({
    retailer: item.retailer,
    sku: item.sku,
    title: item.title,
    productUrl: item.productUrl,
    maxPrice: 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "watch",
    alertLevel: "standard",
    fulfillmentMode: "manual",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    enabled: false
  });
  if (!defaults.profile) return inertMission;
  return normalizeProduct(applyItemProfile(
    inertMission,
    defaults.profile,
    defaults.msrpCatalog || []
  ));
}

function planCatalogMissionImport(state, selectedIds, existingProducts = [], maximum = MAX_PRODUCTS, defaults = {}) {
  const requested = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => cleanText(id, 80)))].slice(0, MAX_CATALOG_ITEMS);
  const byId = new Map((state?.items || []).map((item) => [item.id, item]));
  const existingIds = new Set(existingProducts.map((product) => String(product?.id || "")));
  const additions = [];
  let duplicates = 0;
  let missing = 0;
  let overCapacity = 0;
  for (const id of requested) {
    const item = byId.get(id);
    if (!item) {
      missing += 1;
      continue;
    }
    if (existingIds.has(id)) {
      duplicates += 1;
      continue;
    }
    if (existingProducts.length + additions.length >= maximum) {
      overCapacity += 1;
      continue;
    }
    const mission = catalogMissionFromItem(item, defaults);
    existingIds.add(mission.id);
    additions.push(mission);
  }
  const ready = additions.filter((mission) => mission.enabled).length;
  return {
    additions,
    summary: {
      selected: requested.length,
      imported: additions.length,
      ready,
      needsPrice: additions.length - ready,
      duplicates,
      missing,
      overCapacity
    }
  };
}

function planWalmartPrepCandidates(state, selectedIds, existingProducts = [], existingCandidates = [], defaults = {}) {
  const openAt = new Date(defaults.openAt || "");
  const now = Number(defaults.now ?? Date.now());
  if (!Number.isFinite(openAt.getTime()) || openAt.getTime() <= now) {
    throw new Error("Choose a future Walmart drop time before adding prep candidates.");
  }
  if (!defaults.profile) throw new Error("Choose an item profile for Walmart prep candidates.");
  const requested = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => cleanText(id, 80)))];
  const byId = new Map((state?.items || []).map((item) => [item.id, item]));
  const blockedIds = new Set([
    ...existingProducts.map((product) => product.id),
    ...existingCandidates.map((candidate) => candidate.id)
  ]);
  const additions = [];
  let skipped = 0;
  let needsPrice = 0;
  let overCapacity = 0;
  for (const id of requested) {
    const item = byId.get(id);
    if (!item || item.retailer !== "walmart" || blockedIds.has(id)) {
      skipped += 1;
      continue;
    }
    const candidate = {
      ...catalogMissionFromItem(item, defaults),
      openAt: openAt.toISOString(),
      createdAt: new Date(now).toISOString()
    };
    // A future prep observation cannot establish checkout destination/payment
    // evidence before release. Prep missions therefore materialize at the safe
    // final-review boundary even when an explicit legacy profile auto-submits.
    if (candidate.action === "checkout") {
      candidate.action = "review";
      candidate.itemProfileId = "built-in:shipping-review";
      candidate.checkoutEvidence = null;
    }
    if (!candidate.enabled || candidate.maxPrice <= 0) {
      needsPrice += 1;
      continue;
    }
    if (existingCandidates.length + additions.length >= MAX_WALMART_PREP_CANDIDATES) {
      overCapacity += 1;
      continue;
    }
    additions.push(candidate);
    blockedIds.add(id);
  }
  return {
    additions,
    summary: { selected: requested.length, added: additions.length, skipped, needsPrice, overCapacity }
  };
}

function clearCatalogState() {
  return emptyCatalogState();
}

module.exports = {
  CATALOG_RETAILERS,
  CATALOG_SEARCH_TTL_MS,
  MAX_CATALOG_ITEMS,
  MAX_RESULTS_PER_CAPTURE,
  acceptCatalogResults,
  beginCatalogSearch,
  catalogMissionFromItem,
  clearCatalogState,
  emptyCatalogState,
  itemMatchesFilters,
  normalizeCatalogFilters,
  normalizeCatalogQuery,
  normalizeCatalogRetailers,
  normalizeCatalogState,
  officialSearchUrl,
  planCatalogMissionImport,
  planWalmartPrepCandidates
};
