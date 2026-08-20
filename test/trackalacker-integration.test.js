"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../extension/manifest.json");

const root = path.join(__dirname, "..");

test("TrackaLacker ingestion crosses only the authenticated extension-to-loopback capture boundary", () => {
  const content = fs.readFileSync(path.join(root, "extension", "trackalacker-ingest.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");

  assert.equal(manifest.host_permissions.includes("https://www.trackalacker.com/*"), true);
  assert.equal(manifest.host_permissions.includes("https://howl.link/*"), true);
  assert.deepEqual(manifest.content_scripts[1].js, ["trackalacker-ingest.js"]);
  assert.match(content, /credentials: "include"/);
  assert.match(content, /CART_CONFIRM_CLAIM_TRACKALACKER_IMPORT/);
  assert.match(content, /CART_CONFIRM_TRACKALACKER_CAPTURE/);
  assert.match(background, /senderIsTrackalacker\(sender\)[\s\S]*?postTrackalackerCapture/);
  assert.match(background, /\/trackalacker\/capture[\s\S]*?X-Cart-Assist-Token/);
  assert.match(main, /requestUrl\.pathname === "\/trackalacker\/capture"[\s\S]*?invalid-token[\s\S]*?trackalackerCaptureRequest/);
  assert.match(main, /beginTrackalackerImport[\s\S]*?crypto\.randomUUID\(\)/);
  assert.match(preload, /startTrackalackerImport[\s\S]*?addTrackalackerMissions[\s\S]*?openTrackalackerSource[\s\S]*?openTrackalackerStore/);
  assert.match(main, /trackalacker-open-store[\s\S]*?normalizeProductUrl[\s\S]*?trackalacker-preview/);
  assert.doesNotMatch(`${content}\n${background}\n${main}`, /(?:password|passwd)\s*[:=]\s*["'][^"']+["']/i);
});

test("the crawler is sequential, bounded, retryable, and reports progress before mutating missions", () => {
  const content = fs.readFileSync(path.join(root, "extension", "trackalacker-ingest.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  assert.match(content, /MAX_PRODUCTS = 500/);
  assert.match(content, /MAX_PAGES = 50/);
  assert.match(content, /for \(const summary of inventory\.items\)/);
  assert.match(content, /for \(const listing of product\.listings\)/);
  assert.doesNotMatch(content, /Promise\.all\([^)]*product\.listings/);
  assert.match(content, /FETCH_RETRIES = 2/);
  assert.match(content, /FETCH_TIMEOUT_MS = 12_000/);
  assert.match(content, /CART_CONFIRM_CLAIM_TRACKALACKER_IMPORT[\s\S]*?enrichListing/);
  assert.match(background, /claimedAt > 90_000/);
  assert.match(content, /phase: "product"/);
  assert.match(content, /phase: "complete"/);
});
