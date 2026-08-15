"use strict";

function registerProductFailure(failures, productId, limit = 3) {
  const nextCount = (failures.get(productId) || 0) + 1;
  if (nextCount < limit) {
    failures.set(productId, nextCount);
    return { quarantined: false, count: nextCount };
  }
  failures.delete(productId);
  return { quarantined: true, count: nextCount };
}

function registerStoreFailure(failuresByStore, options = {}) {
  const retailer = String(options.retailer || "");
  const productId = String(options.productId || "");
  const now = Number(options.now ?? Date.now());
  const windowMs = Math.max(1, Number(options.windowMs) || 60_000);
  const distinctLimit = Math.max(1, Number(options.distinctLimit) || 4);
  const recent = failuresByStore.get(retailer) || new Map();
  for (const [candidateId, observedAt] of recent) {
    if (observedAt <= now - windowMs) recent.delete(candidateId);
  }
  recent.set(productId, now);
  failuresByStore.set(retailer, recent);
  const tripped = recent.size >= distinctLimit;
  if (tripped) recent.clear();
  return { tripped, distinctProducts: tripped ? distinctLimit : recent.size };
}

module.exports = { registerProductFailure, registerStoreFailure };
