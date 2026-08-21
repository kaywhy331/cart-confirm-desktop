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
  selectUpdate,
  userFacingReleaseNotes
} = require("../lib/app-update");

function githubRelease(version, options = {}) {
  const tag = options.tag || `v${version}`;
  const base = `https://github.com/kaywhy331/cart-confirm-desktop/releases/download/${tag}`;
  const assets = [
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
  ];
  return {
    tag_name: tag,
    name: `Cart Confirm v${version}`,
    body: options.body || "",
    draft: false,
    prerelease: Boolean(options.prerelease),
    published_at: "2026-08-14T12:00:00Z",
    html_url: `https://github.com/kaywhy331/cart-confirm-desktop/releases/tag/${tag}`,
    assets
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

test("Check for updates installs and reloads the matching bundled extension", () => {
  const root = path.join(__dirname, "..");
  const packageJson = require(path.join(root, "package.json"));
  const manifest = require(path.join(root, "extension", "manifest.json"));
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const extensionResource = packageJson.build.extraResources.find((entry) => entry.from === "extension");

  assert.deepEqual(extensionResource, {
    from: "extension",
    to: "extension",
    filter: ["**/*"]
  });
  assert.equal(manifest.version, packageJson.version);
  assert.match(main, /path\.join\(process\.resourcesPath, "extension"\)/);
  assert.match(main, /install the desktop app and bundled Chrome extension files together/);
  assert.match(background, /String\(config\.appVersion \|\| ""\) !== extensionVersion/);
  assert.match(background, /setTimeout\(\(\) => chrome\.runtime\.reload\(\), 250\)/);
});

test("the update dialog shows only user-facing bullets from the release body", () => {
  const body = [
    "## What's new in v3.6.8",
    "",
    "- The Update button now shows short, plain bullet points",
    "- No more wall of technical text",
    "",
    "## Unsigned prerelease",
    "",
    "These Windows executables are intentionally **unsigned**.",
    "",
    "    abc123  Cart-Confirm-Setup-3.6.8-x64.exe"
  ].join("\n");
  assert.equal(
    userFacingReleaseNotes(body),
    "• The Update button now shows short, plain bullet points\n• No more wall of technical text"
  );

  // Older releases carry only boilerplate — the caller gets an empty string
  // and shows its own plain fallback instead of checksums.
  const boilerplateOnly = "## Unsigned prerelease\n\nThese executables are unsigned.\n\n    abc  Setup.exe";
  assert.equal(userFacingReleaseNotes(boilerplateOnly), "");

  // A body without the heading still surfaces any plain bullets it has.
  assert.equal(userFacingReleaseNotes("- Fixed a bug\n- Faster checks"), "• Fixed a bug\n• Faster checks");

  // Bounded: at most ten bullets reach the dialog.
  const many = Array.from({ length: 14 }, (_, index) => `- Change ${index + 1}`).join("\n");
  assert.equal(userFacingReleaseNotes(many).split("\n").length, 10);

  // The desktop dialog uses the extractor with a plain fallback line.
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(main, /userFacingReleaseNotes\(plan\.releaseNotes\)\s*\n?\s*\|\| "A newer Cart Confirm version is ready\./);
});

test("every release publishes bullets from WHATS-NEW.md and enforces their presence", () => {
  const root = path.join(__dirname, "..");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "unsigned-prerelease.yml"), "utf8");
  const whatsNew = fs.readFileSync(path.join(root, "WHATS-NEW.md"), "utf8");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

  // The workflow refuses to publish without a bulleted section for the
  // version being released, and injects those bullets ahead of the
  // unsigned-build boilerplate.
  assert.match(workflow, /WHATS-NEW\.md has no '## \$packageVersion' section; write user-facing bullets before publishing\./);
  assert.match(workflow, /contains no '- ' bullets/);
  assert.match(workflow, /"## What's new in v\$packageVersion",/);

  // The current version already has its user-facing bullets written.
  const lines = whatsNew.split(/\r?\n/);
  const start = lines.indexOf(`## ${version}`);
  assert.notEqual(start, -1, `WHATS-NEW.md is missing a section for ${version}`);
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    section.push(line);
  }
  assert.ok(section.some((line) => line.startsWith("- ")), `WHATS-NEW.md section for ${version} has no bullets`);
});
