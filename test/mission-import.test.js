"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planBulkImport,
  quickAddMission,
  urlEntries
} = require("../lib/mission-import");

test("bulk import extracts, normalizes, deduplicates, and disables URL-only missions", () => {
  const plan = planBulkImport(`
    https://www.target.com/p/pokemon-box/-/A-1011209279?ref=tracking
    https://www.walmart.com/ip/pokemon-bundle/95163305
    https://www.amazon.com/Pokemon-Booster/dp/B0ABC12345?tag=example-20
    https://www.target.com/p/duplicate/-/A-1011209279
    not-a-url
  `, [{ id: "walmart:95163305" }]);

  assert.deepEqual(plan.additions.map((product) => product.id), [
    "target:1011209279",
    "amazon:B0ABC12345"
  ]);
  assert.equal(plan.additions.every((product) => product.enabled === false), true);
  assert.equal(plan.additions.every((product) => product.action === "watch"), true);
  assert.equal(plan.additions.every((product) => product.maxPrice === 0), true);
  assert.equal(plan.additions[0].productUrl.includes("?"), false);
  assert.deepEqual(plan.summary, {
    candidates: 5,
    imported: 2,
    duplicates: 2,
    invalid: 1,
    overCapacity: 0
  });
});

test("bulk import reports capacity overflow without replacing existing missions", () => {
  const plan = planBulkImport([
    "https://www.target.com/p/a/-/A-1011209279",
    "https://www.target.com/p/b/-/A-1008581387"
  ].join("\n"), [{ id: "target:999999999" }], 2);

  assert.equal(plan.additions.length, 1);
  assert.equal(plan.summary.overCapacity, 1);
});

test("URL extraction accepts multiple pasted URLs and marks non-URL lines", () => {
  const entries = urlEntries("https://www.target.com/p/a/-/A-1011209279 https://www.walmart.com/ip/95163305\nmissing");
  assert.equal(entries.length, 3);
  assert.equal(entries[2].reason, "No HTTPS URL was found.");
});

test("quick add trusts only a matching exact ID and positive observed price", () => {
  const mission = quickAddMission({
    retailer: "amazon",
    sku: "B0ABC12345",
    productUrl: "https://www.amazon.com/Pokemon-Booster/dp/B0ABC12345?tag=tracking",
    title: "  Pokémon Booster Box  ",
    price: 34.987
  });

  assert.equal(mission.id, "amazon:B0ABC12345");
  assert.equal(mission.productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(mission.title, "Pokémon Booster Box");
  assert.equal(mission.maxPrice, 34.99);
  assert.equal(mission.action, "watch");
  assert.equal(mission.enabled, true);
  assert.throws(() => quickAddMission({
    retailer: "amazon",
    sku: "B0WRONG1234",
    productUrl: "https://www.amazon.com/dp/B0ABC12345",
    price: 34.99
  }), /do not match/);
  assert.throws(() => quickAddMission({
    retailer: "target",
    sku: "1011209279",
    productUrl: "https://www.target.com/p/a/-/A-1011209279",
    price: null
  }), /current price/);
});
