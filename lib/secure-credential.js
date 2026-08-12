"use strict";

const fs = require("node:fs");
const path = require("node:path");

function requireSecureStorage(safeStorage) {
  const backend = safeStorage?.getSelectedStorageBackend?.();
  if (!safeStorage?.isEncryptionAvailable?.() || backend === "basic_text") {
    throw new Error("Secure operating-system credential storage is unavailable. Cart Confirm will not save an API key in plaintext.");
  }
}

function normalizeOpenAiApiKey(value) {
  const key = String(value || "").trim();
  if (!/^sk-[A-Za-z0-9_.-]{20,500}$/.test(key)) {
    throw new Error("Enter a valid OpenAI API key beginning with sk-. ChatGPT subscriptions do not include API access.");
  }
  return key;
}

function saveEncryptedCredential(filePath, value, safeStorage, normalize = (input) => String(input || "").trim()) {
  requireSecureStorage(safeStorage);
  const credential = normalize(value);
  const encrypted = safeStorage.encryptString(credential);
  if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error("API key encryption failed.");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function loadEncryptedCredential(filePath, safeStorage, normalize = (input) => String(input || "").trim()) {
  try {
    requireSecureStorage(safeStorage);
    return normalize(safeStorage.decryptString(fs.readFileSync(filePath)));
  } catch {
    return "";
  }
}

function hasEncryptedCredential(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function clearEncryptedCredential(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = {
  clearEncryptedCredential,
  hasEncryptedCredential,
  loadEncryptedCredential,
  normalizeOpenAiApiKey,
  requireSecureStorage,
  saveEncryptedCredential
};
