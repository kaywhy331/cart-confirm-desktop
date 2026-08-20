"use strict";

(function exposeItemMissions(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ItemMissions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
  const MAX_ITEMS = 100;
  const SHARED_FIELDS = Object.freeze([
    "title",
    "openAt",
    "quantity",
    "action",
    "alertLevel",
    "fulfillmentMode",
    "itemProfileId",
    "groupId",
    "signalAutoOpen",
    "acceptPartial"
  ]);

  function clean(value, maximum = 120) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function legacyItemId(product = {}) {
    const routeId = clean(product.id || `${product.retailer || "store"}:${product.sku || "item"}`, 180);
    return `item:${routeId}`;
  }

  function itemIdForProduct(product = {}) {
    return clean(product.itemId, 180) || legacyItemId(product);
  }

  function groupProductsByItem(products = []) {
    const items = [];
    const byId = new Map();
    for (const product of Array.isArray(products) ? products : []) {
      if (!product || typeof product !== "object") continue;
      const itemId = itemIdForProduct(product);
      let item = byId.get(itemId);
      if (!item) {
        item = {
          id: itemId,
          itemId,
          variants: [],
          stores: Object.create(null),
          primary: null
        };
        byId.set(itemId, item);
        items.push(item);
      }
      const variant = product.itemId === itemId ? product : { ...product, itemId };
      item.variants.push(variant);
      if (!item.stores[variant.retailer]) item.stores[variant.retailer] = variant;
    }

    for (const item of items) {
      item.variants.sort((left, right) => (
        RETAILERS.indexOf(left.retailer) - RETAILERS.indexOf(right.retailer)
      ));
      item.primary = item.variants.find((variant) => variant.enabled !== false) || item.variants[0] || null;
      item.enabled = item.variants.some((variant) => variant.enabled !== false);
      item.allEnabled = item.variants.length > 0 && item.variants.every((variant) => variant.enabled !== false);
      for (const field of SHARED_FIELDS) item[field] = item.primary?.[field];
      item.title = clean(item.title, 80);
      item.imageUrl = item.variants.find((variant) => variant.imageUrl)?.imageUrl || "";
    }
    return items;
  }

  function updateItems(products, itemIds, updater) {
    const selected = new Set(Array.isArray(itemIds) ? itemIds : [itemIds]);
    return (Array.isArray(products) ? products : []).map((product) => {
      if (!selected.has(itemIdForProduct(product))) return product;
      return updater({ ...product }, product);
    });
  }

  function applySharedFields(products, itemId, values = {}) {
    return updateItems(products, itemId, (product) => {
      for (const field of SHARED_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(values, field)) product[field] = values[field];
      }
      return product;
    });
  }

  function setItemsEnabled(products, itemIds, enabled) {
    return updateItems(products, itemIds, (product) => ({ ...product, enabled: Boolean(enabled) }));
  }

  function combineItems(products, itemIds, requestedItemId = "") {
    const selected = [...new Set(Array.isArray(itemIds) ? itemIds : [])].filter(Boolean);
    if (selected.length < 2) throw new Error("Select at least two items to combine.");
    const selectedSet = new Set(selected);
    const grouped = groupProductsByItem(products).filter((item) => selectedSet.has(item.id));
    if (grouped.length !== selected.length) throw new Error("One or more selected items no longer exist.");
    const stores = new Set();
    for (const item of grouped) {
      for (const variant of item.variants) {
        if (stores.has(variant.retailer)) {
          throw new Error(`Only one ${variant.retailer} store option can belong to an item.`);
        }
        stores.add(variant.retailer);
      }
    }
    const first = grouped[0];
    const nextItemId = clean(requestedItemId, 180) || first.id;
    const shared = Object.fromEntries(SHARED_FIELDS.map((field) => [field, first[field]]));
    return (Array.isArray(products) ? products : []).map((product) => {
      if (!selectedSet.has(itemIdForProduct(product))) return product;
      return { ...product, ...shared, itemId: nextItemId };
    });
  }

  // Store variants are alternatives for one desired item. Exposure is the
  // highest possible spend among its stores, never the sum of all stores.
  function maximumItemExposure(products = []) {
    return groupProductsByItem(products).reduce((total, item) => {
      if (!item.enabled || item.action === "watch") return total;
      const alternatives = item.variants
        .filter((variant) => variant.enabled !== false)
        .map((variant) => Number(variant.maxOrderTotal || (Number(variant.maxPrice || 0) * Number(variant.quantity || 1))))
        .filter(Number.isFinite);
      return total + (alternatives.length ? Math.max(...alternatives) : 0);
    }, 0);
  }

  function itemHasProtectedProgress(products = [], statuses = {}, itemId = "") {
    const targetId = clean(itemId, 180);
    if (!targetId) return false;
    const item = groupProductsByItem(products).find((candidate) => candidate.id === targetId);
    return Boolean(item?.variants.some((variant) => {
      if (variant.enabled === false || variant.action === "watch") return false;
      const status = statuses?.[variant.id] || {};
      return status.cart === "confirmed"
        || status.checkout === "reached"
        || status.checkout === "review-ready"
        || status.order === "confirmed";
    }));
  }

  return {
    MAX_ITEMS,
    RETAILERS,
    SHARED_FIELDS,
    applySharedFields,
    combineItems,
    groupProductsByItem,
    itemHasProtectedProgress,
    itemIdForProduct,
    legacyItemId,
    maximumItemExposure,
    setItemsEnabled,
    updateItems
  };
});
