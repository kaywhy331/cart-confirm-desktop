"use strict";

const DEFAULT_FRESH_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 250;

function companionConnectionReady(status, now = Date.now(), freshMs = DEFAULT_FRESH_MS) {
  const heartbeatAt = new Date(status?.lastHeartbeatAt || "").getTime();
  const age = Number(now) - heartbeatAt;
  return status?.companion === "connected"
    && Number.isFinite(heartbeatAt)
    && age >= -5_000
    && age <= freshMs;
}

function selectConnectionBootstrap(plan = {}, prepCandidates = []) {
  const candidates = [
    ...(Array.isArray(plan.ready) ? plan.ready : []),
    ...(Array.isArray(plan.enabled) ? plan.enabled : []),
    ...(Array.isArray(prepCandidates) ? prepCandidates : [])
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    const id = String(candidate?.id || "");
    const retailer = String(candidate?.retailer || "");
    const productUrl = String(candidate?.productUrl || "");
    const key = id || `${retailer}|${productUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (["target", "walmart", "amazon"].includes(retailer) && productUrl) {
      return { id, retailer, productUrl };
    }
  }
  return null;
}

function freshHelloReason(hello, startedAt) {
  const seenAt = new Date(hello?.seenAt || "").getTime();
  if (!Number.isFinite(seenAt) || seenAt < startedAt - 1_000) return "";
  return String(hello?.reason || "");
}

async function waitForCompanionConnection(getState, options = {}) {
  const now = options.now || Date.now;
  const delay = options.delay || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = Number(options.startedAt ?? now());
  const timeoutMs = Math.max(0, Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const pollMs = Math.max(10, Number(options.pollMs ?? DEFAULT_POLL_MS));
  const deadline = startedAt + timeoutMs;
  let versionMismatchSeen = false;
  let versionRetryStarted = false;

  while (true) {
    const state = getState() || {};
    const checkedAt = Number(now());
    if (companionConnectionReady(state.status, checkedAt)) return state;
    const helloReason = freshHelloReason(state.companionHello, startedAt);
    if (helloReason === "pairing-mismatch") {
      throw new Error("Chrome opened, but the Cart Confirm companion is paired with a different desktop installation. Remove the unpacked extension, load this app's bundled companion again, and retry.");
    }
    if (helloReason === "version-mismatch") {
      versionMismatchSeen = true;
      if (!versionRetryStarted && options.onVersionMismatch) {
        versionRetryStarted = true;
        await options.onVersionMismatch();
        continue;
      }
    }
    if (checkedAt >= deadline) {
      if (versionMismatchSeen) {
        throw new Error("Chrome tried to reload the updated Cart Confirm companion, but the new version did not connect. Reload the bundled extension once in chrome://extensions and try again.");
      }
      throw new Error(`Chrome opened, but the Cart Confirm companion did not connect within ${Math.ceil(timeoutMs / 1_000)} seconds. Reload the bundled extension in chrome://extensions and try again.`);
    }
    await delay(Math.min(pollMs, deadline - checkedAt));
  }
}

module.exports = {
  companionConnectionReady,
  selectConnectionBootstrap,
  waitForCompanionConnection
};
