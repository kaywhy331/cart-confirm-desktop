"use strict";

const { normalizeTitle } = require("./trackalacker-notification");

function cleanId(value, maximum = 180) {
  return String(value || "").trim().slice(0, maximum);
}

function addIndex(map, key, mapping) {
  if (!key) return;
  const current = map.get(key) || [];
  if (!current.some((candidate) => candidate.productId === mapping.productId)) current.push(mapping);
  map.set(key, current);
}

function mappingFor(item, store) {
  return Object.freeze({
    itemId: cleanId(item.id),
    sourceProductId: cleanId(item.sourceProductId, 30),
    sourceUrl: String(item.sourceUrl || ""),
    listingId: cleanId(store.listingId, 30),
    listingUrl: String(store.historyUrl || ""),
    retailer: cleanId(store.retailer, 20).toLowerCase(),
    sku: cleanId(store.sku, 30),
    productId: cleanId(store.id || `${store.retailer}:${store.sku}`),
    productUrl: String(store.productUrl || ""),
    title: String(item.title || "").trim().slice(0, 240),
    normalizedTitle: normalizeTitle(item.title),
    imageUrl: String(item.imageUrl || "")
  });
}

function normalizedAliases(value, mappingsBySourceProduct) {
  const aliases = [];
  const seen = new Set();
  for (const raw of (Array.isArray(value) ? value : []).slice(0, 2_000)) {
    const sourceProductId = cleanId(raw?.sourceProductId, 30);
    const retailer = cleanId(raw?.retailer, 20).toLowerCase();
    const alias = String(raw?.alias || "").trim().slice(0, 240);
    const normalizedAlias = normalizeTitle(alias);
    const mapping = mappingsBySourceProduct.get(`${sourceProductId}|${retailer}`);
    const key = `${sourceProductId}|${retailer}|${normalizedAlias}`;
    if (!mapping || !normalizedAlias || seen.has(key)) continue;
    seen.add(key);
    aliases.push(Object.freeze({ sourceProductId, retailer, alias, normalizedAlias, mapping }));
  }
  return aliases;
}

function buildTrackalackerSignalIndex(state = {}, aliases = []) {
  const byListing = new Map();
  const bySourceProductRetailer = new Map();
  const byTitleRetailer = new Map();
  const byAliasRetailer = new Map();
  const mappings = [];
  for (const item of Array.isArray(state.items) ? state.items : []) {
    for (const store of Array.isArray(item?.stores) ? item.stores : []) {
      const mapping = mappingFor(item, store);
      if (!mapping.itemId || !mapping.sourceProductId || !mapping.listingId || !mapping.productId || !mapping.normalizedTitle) continue;
      mappings.push(mapping);
      addIndex(byListing, mapping.listingId, mapping);
      addIndex(bySourceProductRetailer, `${mapping.sourceProductId}|${mapping.retailer}`, mapping);
      addIndex(byTitleRetailer, `${mapping.normalizedTitle}|${mapping.retailer}`, mapping);
    }
  }
  const uniqueSourceMappings = new Map();
  for (const [key, candidates] of bySourceProductRetailer) {
    if (candidates.length === 1) uniqueSourceMappings.set(key, candidates[0]);
  }
  const approvedAliases = normalizedAliases(aliases, uniqueSourceMappings);
  for (const alias of approvedAliases) {
    addIndex(byAliasRetailer, `${alias.normalizedAlias}|${alias.retailer}`, alias.mapping);
  }
  return Object.freeze({
    mappings: Object.freeze(mappings),
    aliases: Object.freeze(approvedAliases),
    byListing,
    bySourceProductRetailer,
    byTitleRetailer,
    byAliasRetailer
  });
}

function uniqueCandidates(value) {
  const byProduct = new Map();
  for (const candidate of value || []) byProduct.set(candidate.productId, candidate);
  return [...byProduct.values()];
}

function result(state, matchMethod, candidates, parsed, products) {
  const unique = uniqueCandidates(candidates);
  if (!unique.length) return Object.freeze({ state, matchMethod, mapping: null, mission: null, candidates: Object.freeze([]) });
  if (unique.length > 1) return Object.freeze({ state: "ambiguous", matchMethod, mapping: null, mission: null, candidates: Object.freeze(unique) });
  const mapping = unique[0];
  const mission = (Array.isArray(products) ? products : []).find((product) => (
    product?.id === mapping.productId
    && product?.retailer === mapping.retailer
    && product?.sku === mapping.sku
  )) || null;
  return Object.freeze({
    state: "matched",
    matchMethod,
    mapping,
    mission,
    candidates: Object.freeze(unique),
    canonicalSignal: Object.freeze({
      id: parsed.envelope.signalId,
      source: "trackalacker",
      eventType: parsed.eventType,
      retailer: mapping.retailer,
      sku: mapping.sku,
      productId: mapping.productId,
      itemId: mapping.itemId,
      title: mapping.title || parsed.productNameRaw,
      price: parsed.price,
      seller: "",
      productUrl: mapping.productUrl,
      sourceProductId: mapping.sourceProductId,
      sourceListingId: mapping.listingId,
      observedAt: parsed.observedAt
    })
  });
}

function resolveTrackalackerSignal(parsed, index, products = [], hints = {}) {
  if (!parsed || parsed.parseState !== "parsed" || !parsed.retailer || !parsed.normalizedProductName) {
    return result("unresolved", "none", [], parsed || {}, products);
  }
  const listingId = cleanId(hints.listingId, 30);
  if (listingId) {
    const candidates = (index.byListing.get(listingId) || []).filter((mapping) => mapping.retailer === parsed.retailer);
    if (candidates.length) return result("matched", "listing-id", candidates, parsed, products);
  }
  const sourceProductId = cleanId(hints.sourceProductId, 30);
  if (sourceProductId) {
    const candidates = index.bySourceProductRetailer.get(`${sourceProductId}|${parsed.retailer}`) || [];
    if (candidates.length) return result("matched", "source-product-retailer", candidates, parsed, products);
  }
  const titleKey = `${parsed.normalizedProductName}|${parsed.retailer}`;
  const exact = index.byTitleRetailer.get(titleKey) || [];
  if (exact.length) return result("matched", "exact-title-retailer", exact, parsed, products);
  const alias = index.byAliasRetailer.get(titleKey) || [];
  if (alias.length) return result("matched", "approved-alias-retailer", alias, parsed, products);
  return result("unresolved", "none", [], parsed, products);
}

module.exports = {
  buildTrackalackerSignalIndex,
  resolveTrackalackerSignal
};
