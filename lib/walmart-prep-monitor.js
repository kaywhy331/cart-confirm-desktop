"use strict";

const { checkProductPage } = require("./quiet-monitor");
const { parseWalmartQueue } = require("./retailers");

const PREP_TRIGGER_STATUSES = new Set([404, 503]);

function walmartPrepObservation(input = {}, sku = "") {
  const status = Math.max(0, Math.min(599, Number(input.status) || 0));
  const html = String(input.html || "");
  const page = checkProductPage(html, "walmart", sku);
  const queueState = parseWalmartQueue(input.url);
  const queue = queueState?.itemId === String(sku || "");
  const observation = {
    status,
    availability: page.availability,
    price: page.price,
    queue,
    etag: String(input.etag || "").slice(0, 200),
    lastModified: String(input.lastModified || "").slice(0, 100),
    observedAt: new Date(input.now || Date.now()).toISOString()
  };
  observation.fingerprint = JSON.stringify([
    observation.status,
    observation.availability,
    observation.price,
    observation.queue
  ]);
  return observation;
}

function walmartPrepTransition(previous, current) {
  if (!previous?.fingerprint || !current?.fingerprint || previous.fingerprint === current.fingerprint) {
    return { triggered: false, reason: "unchanged" };
  }
  if (current.queue) return { triggered: true, reason: "queue-visible" };
  if (previous.status === 200 && PREP_TRIGGER_STATUSES.has(current.status)) {
    return { triggered: true, reason: `http-${current.status}` };
  }
  if (PREP_TRIGGER_STATUSES.has(previous.status) && current.status === 200) {
    return { triggered: true, reason: "http-restored" };
  }
  if (previous.availability !== current.availability) {
    return { triggered: true, reason: `availability-${current.availability}` };
  }
  if (previous.price !== current.price && current.price !== null) {
    return { triggered: true, reason: "price-changed" };
  }
  return { triggered: false, reason: "non-actionable-change" };
}

function conditionalHeaders(previous = {}) {
  return {
    ...(previous.etag ? { "If-None-Match": previous.etag } : {}),
    ...(previous.lastModified ? { "If-Modified-Since": previous.lastModified } : {})
  };
}

module.exports = { conditionalHeaders, walmartPrepObservation, walmartPrepTransition };
