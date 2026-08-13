"use strict";

(() => {
  const DEFAULT_MAX_RELOADS = 5;
  const PAGE_SETTLE_MS = 2_000;

  function maxReloads(config = {}) {
    const value = Number(config.walmartQueueCaptureReloads);
    return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_MAX_RELOADS;
  }

  function captureForProduct(config = {}, product = {}) {
    const capture = config.queueCapture;
    if (
      !config.automationEnabled
      || config.monitoringPaused
      || capture?.retailer !== "walmart"
      || capture.runId !== String(config.automationRunId || "")
      || product?.retailer !== "walmart"
      || product.executionMode !== "blitz"
    ) return null;
    return capture;
  }

  function storageKey(capture, product) {
    if (!capture?.runId || !product?.id) return "";
    return `cartConfirmQueueCapture:${capture.runId}:${product.id}`;
  }

  function readAttempts(storage, capture, product) {
    const key = storageKey(capture, product);
    const value = key ? Number(storage?.getItem?.(key)) : 0;
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  function recordReload(storage, capture, product, limit = DEFAULT_MAX_RELOADS) {
    const key = storageKey(capture, product);
    const maximum = Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_MAX_RELOADS;
    const attempts = Math.min(maximum, readAttempts(storage, capture, product) + 1);
    if (key) storage?.setItem?.(key, String(attempts));
    return attempts;
  }

  const api = Object.freeze({
    DEFAULT_MAX_RELOADS,
    PAGE_SETTLE_MS,
    captureForProduct,
    maxReloads,
    readAttempts,
    recordReload,
    storageKey
  });
  globalThis.CartConfirmQueueCapture = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
