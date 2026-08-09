"use strict";

function createStoreOpenQueue(options = {}) {
  const now = options.now || Date.now;
  const customWait = typeof options.wait === "function" ? options.wait : null;
  const intervalMs = options.intervalMs || (() => 20_000);
  const notBefore = options.notBefore || (() => 0);
  const queues = new Map();
  const lastOpenedAt = new Map();
  const waitCancellationResolvers = new Set();
  let epoch = 0;

  async function waitUntilReady(milliseconds, taskEpoch) {
    let cancelWait;
    let timer = null;
    const cancelled = new Promise((resolve) => {
      cancelWait = resolve;
      waitCancellationResolvers.add(resolve);
    });
    const elapsed = customWait
      ? customWait(milliseconds)
      : new Promise((resolve) => { timer = setTimeout(resolve, milliseconds); });
    try {
      await Promise.race([elapsed, cancelled]);
    } finally {
      clearTimeout(timer);
      waitCancellationResolvers.delete(cancelWait);
    }
    return taskEpoch === epoch;
  }

  async function enqueue(retailer, action, options = {}) {
    const key = String(retailer || "");
    if (!key || typeof action !== "function") throw new Error("A store and opening action are required.");
    const spacingOverride = Number(options.spacingMs);
    const taskEpoch = epoch;
    const previous = queues.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      while (true) {
        if (taskEpoch !== epoch) return { cancelled: true };
        const spacing = Math.max(0, Number.isFinite(spacingOverride) && spacingOverride >= 0
          ? spacingOverride
          : Number(intervalMs(key)) || 0);
        const previousOpen = lastOpenedAt.get(key);
        const spacingTarget = previousOpen === undefined ? 0 : previousOpen + spacing;
        const target = Math.max(spacingTarget, Number(notBefore(key)) || 0);
        const waitMs = Math.max(0, target - now());
        if (!waitMs) break;
        if (!await waitUntilReady(waitMs, taskEpoch)) return { cancelled: true };
      }
      if (taskEpoch !== epoch) return { cancelled: true };
      const result = await action();
      lastOpenedAt.set(key, now());
      return result;
    });
    const tracked = task.finally(() => {
      if (queues.get(key) === tracked) queues.delete(key);
    });
    queues.set(key, tracked);
    return tracked;
  }

  // Cancel queued openings and wake spacing/cooldown waits immediately. An
  // action that already crossed the queue boundary owns its own cancellation.
  function cancelPending() {
    epoch += 1;
    for (const resolve of waitCancellationResolvers) resolve();
    waitCancellationResolvers.clear();
  }

  return Object.freeze({ enqueue, cancelPending });
}

module.exports = { createStoreOpenQueue };
