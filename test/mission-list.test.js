"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_LIST_ITEMS,
  formatMissionList,
  selectedMissionProducts
} = require("../lib/mission-list");

const MISSIONS = [
  {
    id: "target:1011209279",
    retailer: "target",
    sku: "1011209279",
    title: "Pokémon Elite Trainer Box",
    maxPrice: 49.99,
    productUrl: "https://www.target.com/p/example/-/A-1011209279"
  },
  {
    id: "amazon:B0ABC12345",
    retailer: "amazon",
    sku: "B0ABC12345",
    title: "",
    maxPrice: 0,
    productUrl: "https://www.amazon.com/dp/B0ABC12345"
  }
];

test("selected missions format as title, expected price, URL, and blank-line separators", () => {
  assert.equal(formatMissionList(MISSIONS), [
    "Pokémon Elite Trainer Box - $49.99",
    "https://www.target.com/p/example/-/A-1011209279",
    "",
    "Amazon B0ABC12345 - Price not set",
    "https://www.amazon.com/dp/B0ABC12345"
  ].join("\n"));
});

test("selection is deduplicated, ignores unknown IDs, and follows mission order", () => {
  const selected = selectedMissionProducts(MISSIONS, [
    "amazon:B0ABC12345",
    "target:1011209279",
    "amazon:B0ABC12345",
    "missing"
  ]);
  assert.deepEqual(selected.map((mission) => mission.id), [
    "target:1011209279",
    "amazon:B0ABC12345"
  ]);
  assert.throws(() => formatMissionList([]), /Select at least one mission/);
});

test("copy and export retain all 100 missions without accepting a 101st", () => {
  const missions = Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, index) => ({
    id: `target:${1011209000 + index}`,
    retailer: "target",
    sku: String(1011209000 + index),
    title: `Mission ${index + 1}`,
    maxPrice: 20,
    productUrl: `https://www.target.com/p/item-${index}/-/A-${1011209000 + index}`
  }));
  const selected = selectedMissionProducts(missions, missions.map((mission) => mission.id));
  assert.equal(MAX_LIST_ITEMS, 100);
  assert.equal(selected.length, 100);
  assert.equal(selected.at(-1).id, missions[99].id);
  assert.equal(formatMissionList(missions).split("\n\n").length, 100);
});
