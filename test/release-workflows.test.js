"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const signed = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
const unsigned = fs.readFileSync(
  path.join(root, ".github", "workflows", "unsigned-prerelease.yml"),
  "utf8"
);
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const packageJson = require(path.join(root, "package.json"));

test("packaged desktop dependencies stay inside the application file set", () => {
  assert.ok(packageJson.build.files.includes("lib/**/*"));
  assert.doesNotMatch(main, /require\("\.\/extension\//);
});

test("the stable release lane remains signed and tag-gated", () => {
  assert.match(signed, /tags: \["v\*"\]/);
  assert.match(signed, /verification\.verified/);
  assert.match(signed, /WINDOWS_CERTIFICATE/);
  assert.match(signed, /WINDOWS_CERTIFICATE_PASSWORD/);
  assert.match(signed, /IsNullOrWhiteSpace\(\$env:CSC_LINK\)/);
  assert.match(signed, /IsNullOrWhiteSpace\(\$env:CSC_KEY_PASSWORD\)/);
  assert.match(signed, /Get-AuthenticodeSignature/);
  assert.match(signed, /Status -ne "Valid"/);
  assert.match(signed, /Expected exactly two checksum entries/);
  assert.match(signed, /Malformed checksum entry/);
  assert.match(signed, /Duplicate checksum entry/);
  assert.match(signed, /Checksum names an unexpected artifact/);
  assert.match(signed, /Get-ChildItem dist -Filter \*\.exe \| Sort-Object Name/);
  assert.match(signed, /Resolve-Path dist\/SHA256SUMS\.txt/);
  assert.match(signed, /& gh @arguments/);
  assert.doesNotMatch(signed, /dist\/\*\.exe/);
  assert.doesNotMatch(signed, /unsigned-v/);
});

test("the unsigned lane is manual, main-only, and visibly prerelease-only", () => {
  assert.match(unsigned, /workflow_dispatch:/);
  assert.doesNotMatch(unsigned, /^\s+push:/m);
  assert.match(unsigned, /PUBLISH UNSIGNED PRERELEASE/);
  assert.match(unsigned, /refs\/heads\/main/);
  assert.match(unsigned, /GITHUB_SHA -ne \$mainSha/);
  assert.match(unsigned, /unsigned-v\$packageVersion/);
  assert.match(unsigned, /matching-refs\/tags\/\$tag/);
  assert.match(unsigned, /Could not verify whether tag/);
  assert.match(unsigned, /--prerelease/);
  assert.match(unsigned, /Unknown publisher/);
});

test("the unsigned lane verifies artifacts and refuses signed executables", () => {
  assert.match(unsigned, /Expected exactly two Windows executables/);
  assert.match(unsigned, /SHA256SUMS\.txt/);
  assert.match(unsigned, /Get-FileHash/);
  assert.match(unsigned, /Duplicate checksum entry/);
  assert.match(unsigned, /Get-AuthenticodeSignature/);
  assert.match(unsigned, /Status -ne "NotSigned"/);
  assert.match(unsigned, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
  assert.doesNotMatch(unsigned, /WINDOWS_CERTIFICATE/);
});
