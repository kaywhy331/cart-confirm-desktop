"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("catalog capture is wired through the constrained extension and authenticated loopback boundary", () => {
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");

  assert.match(content, /CatalogSearch\.inspectSearchPage\(document, location\.href, Retailers\)/);
  assert.match(content, /searchId: search\.id/);
  assert.match(background, /CART_CONFIRM_CATALOG_RESULTS[\s\S]*?postCatalogResults\(message\.capture\)/);
  assert.match(background, /\/catalog\/results[\s\S]*?X-Cart-Assist-Token/);
  assert.match(main, /requestUrl\.pathname === "\/catalog\/results"[\s\S]*?invalid-token[\s\S]*?catalogResultsRequest/);
  assert.match(main, /beginCatalogSearch[\s\S]*?crypto\.randomUUID\(\)/);
  assert.match(preload, /searchCatalog[\s\S]*?addCatalogMissions[\s\S]*?clearCatalog/);
});
