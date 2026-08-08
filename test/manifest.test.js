"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../extension/manifest.json");
const packageJson = require("../package.json");

test("the Manifest V3 companion declares every safety script and required permission", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.deepEqual(manifest.content_scripts[0].js, ["retailers.js", "safety.js", "content.js"]);
  assert.equal(manifest.permissions.includes("storage"), true);
  assert.equal(manifest.permissions.includes("declarativeNetRequest"), true);
  assert.equal(manifest.permissions.includes("webRequest"), true);
  assert.equal(manifest.host_permissions.includes("http://127.0.0.1/*"), true);
  assert.equal(manifest.host_permissions.includes("https://*.walmart.com/*"), true);

  const scripts = [manifest.background.service_worker, ...manifest.content_scripts.flatMap((entry) => entry.js)];
  for (const script of scripts) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", "extension", script)), true, `${script} must exist`);
  }
  const background = fs.readFileSync(path.join(__dirname, "..", "extension", manifest.background.service_worker), "utf8");
  assert.match(background, /importScripts\([^)]*retailers\.js[^)]*tab-context\.js[^)]*open-request-tabs\.js[^)]*update-state\.js/);
});
