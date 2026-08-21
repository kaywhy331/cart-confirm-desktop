"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../extension/manifest.json");
const packageJson = require("../package.json");

test("the Manifest V3 companion declares every safety script and required permission", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Quick add");
  assert.equal(manifest.short_name, "Quick add");
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(manifest.content_scripts[0].js, ["retailers.js", "quick-add.js", "catalog-search.js", "evidence.js", "safety.js", "schedule-gate.js", "queue-capture.js", "content.js"]);
  assert.equal(manifest.permissions.includes("activeTab"), true);
  assert.equal(manifest.permissions.includes("notifications"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
  assert.equal(manifest.permissions.includes("storage"), true);
  assert.equal(manifest.permissions.includes("declarativeNetRequest"), true);
  assert.equal(manifest.permissions.includes("webRequest"), true);
  assert.equal(manifest.host_permissions.includes("http://127.0.0.1/*"), true);
  assert.equal(manifest.host_permissions.includes("https://*.walmart.com/*"), true);
  assert.equal(manifest.host_permissions.includes("https://www.trackalacker.com/*"), true);
  assert.deepEqual(manifest.content_scripts[1].js, ["trackalacker-ingest.js"]);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.action.default_title, "Quick add");

  const assets = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
    manifest.action.default_popup,
    "popup.css",
    "popup.js"
  ];
  for (const asset of assets) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", "extension", asset)), true, `${asset} must exist`);
  }
  const background = fs.readFileSync(path.join(__dirname, "..", "extension", manifest.background.service_worker), "utf8");
  assert.equal(manifest.minimum_chrome_version, "121");
  assert.match(background, /importScripts\([^)]*schedule-gate\.js[^)]*retailers\.js[^)]*trackalacker-push\.js[^)]*tab-context\.js[^)]*open-request-tabs\.js[^)]*update-state\.js/);

  const popupHtml = fs.readFileSync(path.join(__dirname, "..", "extension", "popup.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(__dirname, "..", "extension", "popup.js"), "utf8");
  assert.match(popupHtml, /id="closeButton"/);
  assert.match(popupHtml, /id="cancelButton"/);
  assert.match(popupSource, /addEventListener\("blur", \(\) => window\.close\(\)\)/);
});
