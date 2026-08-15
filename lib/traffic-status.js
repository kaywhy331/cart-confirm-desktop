"use strict";

const OVERLOAD_STATUS_CODES = new Set([429, 502, 503, 504, 520, 521, 522, 523, 524]);

function parseRetryAfter(value, now = Date.now()) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Math.min(86_400_000, Number(text) * 1000);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.min(86_400_000, Math.max(0, parsed - now)) : 0;
}

function isOverloadStatus(status) {
  return OVERLOAD_STATUS_CODES.has(Number(status));
}

module.exports = { OVERLOAD_STATUS_CODES, isOverloadStatus, parseRetryAfter };
