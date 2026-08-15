"use strict";

const QUIET_READ_BUDGET_WINDOW_MS = 60 * 60_000;
const MAX_QUIET_READS_PER_HOUR = 4_000;

function consumeQuietRead(
  history,
  now = Date.now(),
  limit = MAX_QUIET_READS_PER_HOUR,
  notBefore = 0
) {
  const recent = (Array.isArray(history) ? history : [])
    .map(Number)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now - QUIET_READ_BUDGET_WINDOW_MS && timestamp <= now)
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
      reason: "quiet-read-budget-exhausted",
      history: recent,
      remaining: 0,
      retryAt: recent[0] + QUIET_READ_BUDGET_WINDOW_MS
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
  MAX_QUIET_READS_PER_HOUR,
  QUIET_READ_BUDGET_WINDOW_MS,
  consumeQuietRead
};
