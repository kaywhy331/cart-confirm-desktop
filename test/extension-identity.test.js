"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const manifest = require("../extension/manifest.json");
const {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  isAllowedExtensionOrigin
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
