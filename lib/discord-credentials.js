"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeBotToken } = require("./discord-client");

function requireSecureStorage(safeStorage) {
  const backend = safeStorage?.getSelectedStorageBackend?.();
  if (!safeStorage?.isEncryptionAvailable?.() || backend === "basic_text") {
    throw new Error("Secure operating-system credential storage is unavailable. Cart Confirm will not save a Discord token in plaintext.");
  }
}

function saveDiscordToken(filePath, tokenValue, safeStorage) {
  requireSecureStorage(safeStorage);
  const token = normalizeBotToken(tokenValue);
  const encrypted = safeStorage.encryptString(token);
  if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error("Discord token encryption failed.");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function loadDiscordToken(filePath, safeStorage) {
  try {
    requireSecureStorage(safeStorage);
    const encrypted = fs.readFileSync(filePath);
    return normalizeBotToken(safeStorage.decryptString(encrypted));
  } catch {
    return "";
  }
}

function hasDiscordToken(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function clearDiscordToken(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = { clearDiscordToken, hasDiscordToken, loadDiscordToken, saveDiscordToken };
