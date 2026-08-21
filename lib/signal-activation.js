"use strict";

const SIGNAL_ACTIVATION_TTL_MS = 10 * 60_000;

function cleanId(value, length = 160) {
  return String(value || "").trim().slice(0, length);
}

function activeSignalActivations(input = {}, runId = "", now = Date.now()) {
  const currentRunId = cleanId(runId, 80);
  const timestamp = Number(now);
  const active = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return active;
  for (const [productIdValue, activation] of Object.entries(input).slice(-100)) {
    const productId = cleanId(productIdValue, 100);
    const expiresAt = Number(activation?.expiresAt || 0);
    if (
      !productId
      || activation?.productId !== productId
      || cleanId(activation?.runId, 80) !== currentRunId
      || !Number.isFinite(timestamp)
      || !Number.isFinite(expiresAt)
      || expiresAt <= timestamp
    ) continue;
    active[productId] = {
      productId,
      signalId: cleanId(activation.signalId),
      source: ["browser", "discord", "trackalacker"].includes(activation.source)
        ? activation.source
        : "discord",
      runId: currentRunId,
      activatedAt: Math.max(0, Number(activation.activatedAt || 0)),
      expiresAt
    };
  }
  return active;
}

function activateSignalProduct(input = {}, options = {}, now = Date.now()) {
  const productId = cleanId(options.productId, 100);
  const signalId = cleanId(options.signalId);
  const runId = cleanId(options.runId, 80);
  const timestamp = Number(now);
  if (!productId || !signalId || !runId || !Number.isFinite(timestamp)) {
    return activeSignalActivations(input, runId, timestamp);
  }
  const active = activeSignalActivations(input, runId, timestamp);
  active[productId] = {
    productId,
    signalId,
    source: ["browser", "discord", "trackalacker"].includes(options.source)
      ? options.source
      : "discord",
    runId,
    activatedAt: timestamp,
    expiresAt: timestamp + SIGNAL_ACTIVATION_TTL_MS
  };
  return active;
}

module.exports = {
  SIGNAL_ACTIVATION_TTL_MS,
  activateSignalProduct,
  activeSignalActivations
};
