"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  clearDiscordToken,
  hasDiscordToken,
  loadDiscordToken,
  saveDiscordToken
} = require("../lib/discord-credentials");

const TOKEN = "a-valid-local-discord-bot-token-value";
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value, "utf8").reverse(),
  decryptString: (value) => Buffer.from(value).reverse().toString("utf8")
};

test("Discord bot credentials round-trip only through encrypted storage", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-discord-"));
  const filePath = path.join(directory, "token.bin");
  try {
    saveDiscordToken(filePath, TOKEN, fakeSafeStorage);
    assert.equal(hasDiscordToken(filePath), true);
    assert.equal(fs.readFileSync(filePath, "utf8").includes(TOKEN), false);
    assert.equal(loadDiscordToken(filePath, fakeSafeStorage), TOKEN);
    assert.equal(clearDiscordToken(filePath), true);
    assert.equal(hasDiscordToken(filePath), false);
    assert.equal(loadDiscordToken(filePath, fakeSafeStorage), "");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("plaintext fallback is refused when OS encryption is unavailable", () => {
  assert.throws(
    () => saveDiscordToken("unused", TOKEN, { isEncryptionAvailable: () => false }),
    /will not save.*plaintext/i
  );
});

test("Electron's Linux basic_text fallback is refused", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cart-confirm-discord-"));
  const tokenPath = path.join(directory, "token.bin");
  assert.throws(() => saveDiscordToken(tokenPath, TOKEN, {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "basic_text",
    encryptString: (value) => Buffer.from(value)
  }), /will not save.*plaintext/i);
  assert.equal(fs.existsSync(tokenPath), false);
  fs.rmSync(directory, { recursive: true });
});
