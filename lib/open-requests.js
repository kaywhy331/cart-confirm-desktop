"use strict";

const crypto = require("node:crypto");

// Pending "navigate an existing browser tab" requests that the Chrome companion
// polls over the local loopback server. A request that is never claimed falls
// back to opening a new page from the desktop side.
function createOpenRequestStore(options = {}) {
  const now = options.now || Date.now;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : 15_000;
  const requests = new Map();

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [id, request] of requests) {
      if (request.createdAt < cutoff) {
        request.settle(false);
        requests.delete(id);
      }
    }
  }

  function add(retailer, url, context = {}) {
    prune();
    const id = crypto.randomUUID();
    let resolve;
    const claimedPromise = new Promise((res) => {
      resolve = res;
    });
    const request = {
      id,
      retailer: String(retailer || ""),
      url: String(url || ""),
      productId: String(context.productId || "").slice(0, 80),
      contextRequired: context.contextRequired === true,
      dedicatedTab: context.dedicatedTab === true,
      createdAt: now(),
      done: false,
      claimedPromise,
      settle(claimed) {
        if (request.done) return;
        request.done = true;
        resolve(claimed === true);
      }
    };
    requests.set(id, request);
    return {
      id,
      retailer: request.retailer,
      url: request.url,
      productId: request.productId,
      contextRequired: request.contextRequired,
      dedicatedTab: request.dedicatedTab
    };
  }

  function pending() {
    prune();
    return [...requests.values()]
      .filter((request) => !request.done)
      .map((request) => ({
        id: request.id,
        retailer: request.retailer,
        url: request.url,
        productId: request.productId,
        contextRequired: request.contextRequired,
        dedicatedTab: request.dedicatedTab,
        createdAt: request.createdAt
      }));
  }

  function claim(id) {
    prune();
    const request = requests.get(String(id || ""));
    if (!request) return { ok: false, reason: "not-found" };
    if (request.done) return { ok: false, reason: "already-claimed" };
    request.settle(true);
    return {
      ok: true,
      id: request.id,
      retailer: request.retailer,
      url: request.url,
      productId: request.productId,
      contextRequired: request.contextRequired,
      dedicatedTab: request.dedicatedTab
    };
  }

  function cancel(id) {
    const request = requests.get(String(id || ""));
    if (!request) return;
    request.settle(false);
    requests.delete(request.id);
  }

  async function waitForClaim(id, timeoutMs) {
    const request = requests.get(String(id || ""));
    if (!request) return false;
    const claimed = await Promise.race([
      request.claimedPromise,
      wait(Math.max(0, Number(timeoutMs) || 0)).then(() => false)
    ]);
    if (!claimed) cancel(id);
    return claimed;
  }

  function cancelAll() {
    for (const request of [...requests.values()]) {
      request.settle(false);
      requests.delete(request.id);
    }
  }

  return Object.freeze({ add, pending, claim, cancel, cancelAll, waitForClaim });
}

module.exports = { createOpenRequestStore };
