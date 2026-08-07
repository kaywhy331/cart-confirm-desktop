"use strict";

function createStoreOpenQueue(options = {}) {
  const now = options.now || Date.now;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const intervalMs = options.intervalMs || (() => 20_000);
  const notBefore = options.notBefore || (() => 0);
  const queues = new Map();
  const lastOpenedAt = new Map();
  let epoch = 0;

  async function enqueue(retailer, action) {
    const key = String(retailer || "");
    if (!key || typeof action !== "function") throw new Error("A store and opening action are required.");
    const taskEpoch = epoch;
    const previous = queues.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      while (true) {
        if (taskEpoch !== epoch) return { cancelled: true };
        const spacing = Math.max(0, Number(intervalMs(key)) || 0);
        const previousOpen = lastOpenedAt.get(key);
        const spacingTarget = previousOpen === undefined ? 0 : previousOpen + spacing;
        const target = Math.max(spacingTarget, Number(notBefore(key)) || 0);
        const waitMs = Math.max(0, target - now());
        if (!waitMs) break;
        await wait(waitMs);
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

  // Cancel every queued opening that has not yet run; in-flight actions finish.
  function cancelPending() {
    epoch += 1;
  }

  return Object.freeze({ enqueue, cancelPending });
}

module.exports = { createStoreOpenQueue };
