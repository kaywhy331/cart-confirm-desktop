"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const manifest = require("../extension/manifest.json");
const {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  isAllowedExtensionOrigin,
  isLoopbackHost,
  isTrustedCompanionRequest
} = require("../lib/extension-identity");

function chromeExtensionId(publicKey) {
  const digest = crypto.createHash("sha256").update(Buffer.from(publicKey, "base64")).digest().subarray(0, 16);
  return [...digest]
    .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
    .join("");
}

test("the manifest public key produces the local server's pinned extension origin", () => {
  assert.equal(chromeExtensionId(manifest.key), EXTENSION_ID);
  assert.equal(EXTENSION_ORIGIN, `chrome-extension://${EXTENSION_ID}`);
  assert.equal(isAllowedExtensionOrigin(EXTENSION_ORIGIN), true);
  assert.equal(isAllowedExtensionOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(isAllowedExtensionOrigin(""), false);
});

test("only loopback Host headers are accepted, defeating DNS rebinding", () => {
  assert.equal(isLoopbackHost("127.0.0.1:32191"), true);
  assert.equal(isLoopbackHost("localhost:32195"), true);
  assert.equal(isLoopbackHost("[::1]:32191"), true);
  assert.equal(isLoopbackHost("attacker.example:32191"), false);
  assert.equal(isLoopbackHost("127.0.0.1.attacker.example:32191"), false);
  assert.equal(isLoopbackHost(""), false);
});

test("companion requests are trusted by pinned origin or origin-less pinned id header", () => {
  const host = "127.0.0.1:32191";
  // Chrome variants: CORS-mode requests carry the extension origin; host-permitted GETs carry no origin.
  assert.equal(isTrustedCompanionRequest(EXTENSION_ORIGIN, host, undefined), true);
  assert.equal(isTrustedCompanionRequest("", host, EXTENSION_ID), true);
  assert.equal(isTrustedCompanionRequest(undefined, host, EXTENSION_ID), true);
  // Web pages always reveal a real origin on readable requests, and cannot combine
  // an origin-less request with the pinned id header and a loopback Host.
  assert.equal(isTrustedCompanionRequest("https://evil.example", host, EXTENSION_ID), false);
  assert.equal(isTrustedCompanionRequest("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", host, EXTENSION_ID), false);
  assert.equal(isTrustedCompanionRequest("", host, ""), false);
  assert.equal(isTrustedCompanionRequest("", host, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  // DNS rebinding: right headers, wrong Host.
  assert.equal(isTrustedCompanionRequest(EXTENSION_ORIGIN, "attacker.example:32191", EXTENSION_ID), false);
  assert.equal(isTrustedCompanionRequest("", "attacker.example:32191", EXTENSION_ID), false);
});
