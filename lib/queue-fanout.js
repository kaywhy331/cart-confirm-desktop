"use strict";

const QUEUE_FANOUT_SPACING_MS = 1_000;
const QUEUE_FANOUT_DRAIN_BUFFER_MS = 3_000;
const QUEUE_FANOUT_MAX_DRAIN_MS = 60_000;
const SUPPORTED_RETAILERS = new Set(["target", "walmart", "amazon"]);

function queueFanoutKey(runId, retailer) {
  const normalizedRunId = String(runId || "").trim();
  const normalizedRetailer = String(retailer || "").toLowerCase();
  if (!normalizedRunId || !SUPPORTED_RETAILERS.has(normalizedRetailer)) return "";
  return `${normalizedRunId}|${normalizedRetailer}`;
}

function planQueueFanout(options = {}) {
  const settings = options.settings || {};
  const event = options.event || {};
  if (
    !settings.automationEnabled
    || settings.monitoringPaused
    || event.eventType !== "queue-waiting"
    || event.availability === "unavailable"
  ) {
    return null;
  }

  const retailer = String(event.retailer || "").toLowerCase();
  const key = queueFanoutKey(settings.automationRunId, retailer);
  if (!key || options.receipts?.[key]) return null;

  const excluded = new Set([
    String(event.productId || ""),
    ...(options.queuedProductIds || []).map(String)
  ]);
  const productIds = (settings.products || [])
    .filter((product) => (
      product
      && product.enabled
      && product.retailer === retailer
      && !excluded.has(String(product.id || ""))
    ))
    .map((product) => product.id);

  if (!productIds.length) return null;
  const openRequestDrainMs = Math.min(
    QUEUE_FANOUT_MAX_DRAIN_MS,
    productIds.length * QUEUE_FANOUT_SPACING_MS + QUEUE_FANOUT_DRAIN_BUFFER_MS
  );
  return Object.freeze({
    key,
    retailer,
    productIds,
    spacingMs: QUEUE_FANOUT_SPACING_MS,
    openRequestDrainMs
  });
}

module.exports = {
  QUEUE_FANOUT_SPACING_MS,
  planQueueFanout,
  queueFanoutKey
};
