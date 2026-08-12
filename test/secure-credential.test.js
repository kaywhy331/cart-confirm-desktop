"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clearEncryptedCredential,
  hasEncryptedCredential,
  loadEncryptedCredential,
  normalizeOpenAiApiKey,
  saveEncryptedCredential
} = require("../lib/secure-credential");

function fakeSafeStorage(backend = "kwallet6") {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, "")
  };
}

test("OpenAI API keys use encrypted atomic credential storage", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-credential-"));
  const filePath = path.join(directory, "key.bin");
  const key = "sk-test-key-with-at-least-twenty-characters";
  saveEncryptedCredential(filePath, key, fakeSafeStorage(), normalizeOpenAiApiKey);
  assert.equal(hasEncryptedCredential(filePath), true);
  assert.notEqual(fs.readFileSync(filePath, "utf8"), key);
  assert.equal(loadEncryptedCredential(filePath, fakeSafeStorage(), normalizeOpenAiApiKey), key);
  assert.equal(clearEncryptedCredential(filePath), true);
  assert.equal(hasEncryptedCredential(filePath), false);
  fs.rmSync(directory, { recursive: true });
});

test("API keys are never stored when secure OS encryption is unavailable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-credential-"));
  const filePath = path.join(directory, "key.bin");
  assert.throws(() => saveEncryptedCredential(
    filePath,
    "sk-test-key-with-at-least-twenty-characters",
    fakeSafeStorage("basic_text"),
    normalizeOpenAiApiKey
  ), /will not save an API key in plaintext/);
  assert.equal(hasEncryptedCredential(filePath), false);
  assert.throws(() => normalizeOpenAiApiKey("not-a-key"), /valid OpenAI API key/);
  fs.rmSync(directory, { recursive: true });
});
