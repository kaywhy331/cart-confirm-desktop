"use strict";

const SIGNAL_ACTIVATION_TTL_MS = 10 * 60_000;

function cleanId(value, length = 160) {
  return String(value || "").trim().slice(0, length);
}

function actionOverride(value) {
  const action = String(value || "");
  return ["cart", "review", "checkout"].includes(action) ? action : "";
}

function quantityOverride(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : null;
}

function offerBinding(input = {}) {
  const maximumPrice = Number(input.maximumPrice);
  const observedAt = new Date(input.observedAt || "");
  return {
    maximumPrice: Number.isFinite(maximumPrice) && maximumPrice > 0 && maximumPrice <= 1_000_000
      ? Math.round(maximumPrice * 100) / 100
      : null,
    seller: String(input.seller || "").replace(/\s+/g, " ").trim().slice(0, 120),
    firstParty: typeof input.firstParty === "boolean" ? input.firstParty : null,
    allowThirdPartySeller: input.allowThirdPartySeller === true,
    observedAt: Number.isNaN(observedAt.getTime()) ? "" : observedAt.toISOString()
  };
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
      expiresAt,
      action: actionOverride(activation.action),
      quantity: quantityOverride(activation.quantity),
      acceptPartial: activation.acceptPartial === true,
      strategyId: cleanId(activation.strategyId, 80),
      strategyName: cleanId(activation.strategyName, 80),
      offerBinding: offerBinding(activation.offerBinding)
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
    expiresAt: timestamp + SIGNAL_ACTIVATION_TTL_MS,
    action: actionOverride(options.action),
    quantity: quantityOverride(options.quantity),
    acceptPartial: options.acceptPartial === true,
    strategyId: cleanId(options.strategyId, 80),
    strategyName: cleanId(options.strategyName, 80),
    offerBinding: offerBinding(options.offerBinding)
  };
  return active;
}

function activateSignalProductIfIdle(input = {}, options = {}, now = Date.now()) {
  const productId = cleanId(options.productId, 100);
  const active = activeSignalActivations(input, options.runId, now);
  const existing = active[productId] || null;
  if (existing) return { activations: active, activation: existing, created: false };
  const activations = activateSignalProduct(active, options, now);
  return {
    activations,
    activation: activations[productId] || null,
    created: Boolean(activations[productId])
  };
}

module.exports = {
  SIGNAL_ACTIVATION_TTL_MS,
  activateSignalProduct,
  activateSignalProductIfIdle,
  activeSignalActivations,
  offerBinding
};
