"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareVersions,
  normalizeReleaseNotes,
  parseChecksumManifest,
  parseVersion,
  releasePlan,
  selectUpdate
} = require("../lib/app-update");

function githubRelease(version, options = {}) {
  const tag = options.tag || `v${version}`;
  const base = `https://github.com/kaywhy331/cart-confirm-desktop/releases/download/${tag}`;
  return {
    tag_name: tag,
    name: `Cart Confirm v${version}`,
    body: options.body || "",
    draft: false,
    prerelease: Boolean(options.prerelease),
    published_at: "2026-08-14T12:00:00Z",
    html_url: `https://github.com/kaywhy331/cart-confirm-desktop/releases/tag/${tag}`,
    assets: [
      {
        name: `Cart-Confirm-Setup-${version}-x64.exe`,
        size: 100,
        browser_download_url: `${base}/Cart-Confirm-Setup-${version}-x64.exe`
      },
      {
        name: "SHA256SUMS.txt",
        size: 120,
        browser_download_url: `${base}/SHA256SUMS.txt`
      }
    ]
  };
}

test("parses and orders stable and unsigned release versions", () => {
  assert.equal(parseVersion("unsigned-v3.4.0").text, "3.4.0");
  assert.equal(parseVersion("v3.4.0").text, "3.4.0");
  assert.equal(parseVersion("3.4"), null);
  assert.equal(compareVersions("3.4.0", "3.3.9") > 0, true);
  assert.equal(compareVersions("3.4.0", "3.4.0"), 0);
});

test("selects the highest complete newer GitHub release", () => {
  const current = githubRelease("3.3.1");
  const unsigned = githubRelease("3.4.0", { tag: "unsigned-v3.4.0", prerelease: true });
  const newest = githubRelease("3.5.0");
  const incomplete = githubRelease("9.0.0");
  incomplete.assets = incomplete.assets.filter((asset) => asset.name !== "SHA256SUMS.txt");

  const selected = selectUpdate([current, unsigned, newest, incomplete], "3.3.1");
  assert.equal(selected.version, "3.5.0");
  assert.equal(selected.setupAsset.name, "Cart-Confirm-Setup-3.5.0-x64.exe");
  assert.equal(selectUpdate([current], "3.3.1"), null);
});

test("requires official repository release assets", () => {
  const release = githubRelease("3.4.0");
  release.assets[0].browser_download_url = "https://example.com/update.exe";
  assert.throws(() => releasePlan(release), /untrusted download address/);

  const wrongRepository = githubRelease("3.4.0");
  wrongRepository.assets[0].browser_download_url = "https://github.com/other/repository/releases/download/v3.4.0/update.exe";
  assert.throws(() => releasePlan(wrongRepository), /official Cart Confirm release path/);
});

test("keeps bounded plain-text release notes for the approval prompt", () => {
  const notes = "## Changes\r\n\r\n- Faster checks\u0000\r\n\r\n\r\n- Clearer status";
  const plan = releasePlan(githubRelease("3.4.0", { body: notes }));
  assert.equal(plan.releaseNotes, "## Changes\n\n- Faster checks\n\n- Clearer status");
  assert.equal(normalizeReleaseNotes("x".repeat(7_000)).length, 6_000);
  assert.match(normalizeReleaseNotes("x".repeat(7_000)), /…$/);
});

test("accepts exactly one checksum for the expected installer", () => {
  const name = "Cart-Confirm-Setup-3.4.0-x64.exe";
  const hash = "a".repeat(64);
  assert.equal(parseChecksumManifest(`${hash}  ${name}\n`, name), hash);
  assert.throws(() => parseChecksumManifest(`${hash}  other.exe\n`, name), /exactly one entry/);
  assert.throws(
    () => parseChecksumManifest(`${hash}  ${name}\n${hash}  ${name}\n`, name),
    /exactly one entry/
  );
  assert.throws(() => parseChecksumManifest(`${hash}  ../${name}\n`, name), /exactly one entry/);
});

test("the updater control is always reachable with an on-demand check", () => {
  const root = path.join(__dirname, "..");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");

  // Renderer can request a check, and the desktop answers with a typed result.
  assert.match(preload, /checkForUpdates: \(\) => ipcRenderer\.invoke\("cart-assist:check-for-updates"\)/);
  assert.match(main, /ipcMain\.handle\("cart-assist:check-for-updates"/);
  assert.match(main, /\{ status: "available", version: plan\.version \}/);
  assert.match(main, /\{ status: "current", currentVersion: app\.getVersion\(\) \}/);

  // The control hides only in unsupported builds; otherwise it always offers
  // either the pending update or a manual check.
  assert.match(renderer, /elements\.updateNotice\.hidden = status === "unavailable";/);
  assert.match(renderer, /updateReady \? "Update" : "Check for updates"/);
  assert.match(renderer, /if \(updateButtonMode === "install"\) void requestAppUpdate\(\);\s*else void requestUpdateCheck\(\);/);
  assert.match(renderer, /Up to date/);
  assert.match(html, /Check for updates<\/button>/);
});

