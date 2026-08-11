"use strict";

const ACTION_BUDGET_WINDOW_MS = 60 * 60_000;
const MAX_STORE_ACTIONS_PER_HOUR = 120;
const TARGET_PERSISTENCE_ACTIONS = new Set([
  "target-persistence:add",
  "target-persistence:quantity",
  "target-persistence:cart",
  "target-persistence:checkout",
  "target-persistence:submit"
]);

function canBypassStoreOverload(retailer, kind) {
  return retailer === "target" && TARGET_PERSISTENCE_ACTIONS.has(String(kind || ""));
}

function consumeStoreAction(history, now = Date.now(), limit = MAX_STORE_ACTIONS_PER_HOUR, notBefore = 0) {
  const recent = (Array.isArray(history) ? history : [])
    .map(Number)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now - ACTION_BUDGET_WINDOW_MS && timestamp <= now)
    .sort((left, right) => left - right);
  const blockedUntil = Number(notBefore);
  if (Number.isFinite(blockedUntil) && blockedUntil > now) {
    return {
      allowed: false,
      reason: "traffic-overload",
      history: recent,
      remaining: Math.max(0, limit - recent.length),
      retryAt: blockedUntil
    };
  }
  if (recent.length >= limit) {
    return {
      allowed: false,
      reason: "traffic-budget-exhausted",
      history: recent,
      remaining: 0,
      retryAt: recent[0] + ACTION_BUDGET_WINDOW_MS
    };
  }
  recent.push(now);
  return {
    allowed: true,
    reason: "",
    history: recent,
    remaining: limit - recent.length,
    retryAt: 0
  };
}

module.exports = {
  ACTION_BUDGET_WINDOW_MS,
  MAX_STORE_ACTIONS_PER_HOUR,
  canBypassStoreOverload,
  consumeStoreAction
};
