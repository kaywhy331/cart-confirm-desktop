"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  combineItems,
  groupProductsByItem,
  itemHasProtectedProgress,
  itemIdForProduct,
  maximumItemExposure,
  setItemsEnabled
} = require("../lib/item-missions");

function route(retailer, sku, overrides = {}) {
  return {
    id: `${retailer}:${sku}`,
    retailer,
    sku,
    title: "Console",
    quantity: 1,
    action: "checkout",
    maxOrderTotal: 100,
    enabled: true,
    ...overrides
  };
}

test("legacy routes remain separate items until the user combines them", () => {
  const routes = [route("target", "1"), route("walmart", "2")];
  assert.equal(groupProductsByItem(routes).length, 2);
  assert.equal(itemIdForProduct(routes[0]), "item:target:1");
});

test("store variants group under one item and toggle together", () => {
  const routes = [
    route("target", "1", { itemId: "item:console" }),
    route("walmart", "2", { itemId: "item:console" })
  ];
  const [item] = groupProductsByItem(routes);
  assert.deepEqual(Object.keys(item.stores), ["target", "walmart"]);
  assert.equal(item.enabled, true);
  assert.ok(setItemsEnabled(routes, item.id, false).every((entry) => entry.enabled === false));
});

test("combine rejects duplicate stores and synchronizes shared fields", () => {
  const routes = [
    route("target", "1", { itemId: "item:first", title: "First", quantity: 2 }),
    route("walmart", "2", { itemId: "item:second", title: "Second" })
  ];
  const combined = combineItems(routes, ["item:first", "item:second"]);
  assert.ok(combined.every((entry) => entry.itemId === "item:first"));
  assert.ok(combined.every((entry) => entry.title === "First" && entry.quantity === 2));
  assert.throws(() => combineItems([
    ...routes,
    route("target", "3", { itemId: "item:third" })
  ], ["item:first", "item:third"]), /one target store option/i);
});

test("maximum exposure counts alternative stores once", () => {
  const routes = [
    route("target", "1", { itemId: "item:console", maxOrderTotal: 110 }),
    route("walmart", "2", { itemId: "item:console", maxOrderTotal: 125 }),
    route("amazon", "3", { itemId: "item:headset", maxOrderTotal: 40 })
  ];
  assert.equal(maximumItemExposure(routes), 165);
});

test("cart or checkout progress stops every alternative store route", () => {
  const routes = [
    route("target", "1", { itemId: "item:console", action: "cart" }),
    route("walmart", "2", { itemId: "item:console", action: "cart" })
  ];
  assert.equal(itemHasProtectedProgress(routes, {}, "item:console"), false);
  assert.equal(itemHasProtectedProgress(routes, {
    "target:1": { cart: "confirmed" }
  }, "item:console"), true);
  assert.equal(itemHasProtectedProgress(routes, {
    "walmart:2": { checkout: "review-ready" }
  }, "item:console"), true);
  assert.equal(itemHasProtectedProgress(routes.map((entry) => ({ ...entry, action: "watch" })), {
    "target:1": { cart: "confirmed" }
  }, "item:console"), false);
});
