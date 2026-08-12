"use strict";

const MAX_LIST_ITEMS = 50;

function singleLine(value, maximum = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function expectedPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? `$${price.toFixed(2)}` : "Price not set";
}

function missionListTitle(product = {}) {
  const title = singleLine(product.title, 80);
  if (title) return title;
  const retailer = singleLine(product.retailer, 20);
  const store = retailer ? retailer.charAt(0).toUpperCase() + retailer.slice(1) : "Store";
  return `${store} ${singleLine(product.sku, 40) || "item"}`;
}

function selectedMissionProducts(products = [], selectedIds = []) {
  const requested = new Set((Array.isArray(selectedIds) ? selectedIds : [])
    .slice(0, MAX_LIST_ITEMS)
    .map((id) => String(id || "")));
  return (Array.isArray(products) ? products : [])
    .filter((product) => requested.has(String(product?.id || "")))
    .slice(0, MAX_LIST_ITEMS);
}

function formatMissionList(products = []) {
  const selected = (Array.isArray(products) ? products : []).slice(0, MAX_LIST_ITEMS);
  if (!selected.length) throw new Error("Select at least one mission to copy.");
  return selected.map((product) => {
    const url = singleLine(product?.productUrl, 1_000);
    if (!url) throw new Error("Every copied mission needs a product URL.");
    return `${missionListTitle(product)} - ${expectedPrice(product?.maxPrice)}\n${url}`;
  }).join("\n\n");
}

module.exports = {
  MAX_LIST_ITEMS,
  expectedPrice,
  formatMissionList,
  missionListTitle,
  selectedMissionProducts
};
