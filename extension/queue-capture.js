"use strict";

(() => {
  const DEFAULT_MAX_RELOADS = 0;
  const PAGE_SETTLE_MS = 2_000;

  function maxReloads(config = {}) {
    const value = Number(config.walmartQueueCaptureReloads);
    return Number.isInteger(value) && value >= 0 && value <= 20 ? value : DEFAULT_MAX_RELOADS;
  }

  function captureForProduct(config = {}, product = {}, now = Date.now()) {
    const capture = config.queueCaptures?.[String(product?.executionCohortId || "")];
    if (
      !config.automationEnabled
      || config.monitoringPaused
      || capture?.retailer !== "walmart"
      || capture.runId !== String(config.automationRunId || "")
      || !capture.cohortId
      || !Array.isArray(capture.participantProductIds)
      || !capture.participantProductIds.includes(String(product?.id || ""))
      || !Number.isFinite(Number(capture.expiresAt))
      || now >= Number(capture.expiresAt)
      || product?.retailer !== "walmart"
      || product.executionMode !== "blitz"
      || product.executionCohortId !== capture.cohortId
      || now >= Number(product.executionExpiresAt || 0)
    ) return null;
    return capture;
  }

  const api = Object.freeze({
    DEFAULT_MAX_RELOADS,
    PAGE_SETTLE_MS,
    captureForProduct,
    maxReloads
  });
  globalThis.CartConfirmQueueCapture = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
