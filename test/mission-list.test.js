"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
