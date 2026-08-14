"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareVersions,
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
