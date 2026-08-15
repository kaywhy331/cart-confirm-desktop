"use strict";

const ACTIVITY_EVENT_TYPES = new Set([
  "watch-started",
  "offer-observed",
  "cart-item-confirmed",
  "order-confirmed",
  "notification-sent"
]);

function productLabel(event = {}, product = {}) {
  return String(product.title || product.sku || event.sku || "this product").trim();
}

function quantityPrefix(event = {}, product = {}) {
  const quantity = Number.isInteger(event.quantity)
    ? event.quantity
    : Number.isInteger(product.quantity)
      ? product.quantity
      : 0;
  return quantity > 0 ? `${quantity} × ` : "";
}

function createActivityEvent(rawEvent = {}, context = {}) {
  const product = context.product || {};
  const runId = String(context.runId || rawEvent.runId || "");
  const label = productLabel(rawEvent, product);
  const event = { ...rawEvent, runId };

  switch (rawEvent.eventType) {
    case "page-observed":
      if (context.automationEnabled !== true) return null;
      return {
        ...event,
        eventType: "watch-started",
        sourceEventType: "page-observed",
        message: `Started watching ${label}.`
      };
    case "watch-started":
      return {
        ...event,
        message: rawEvent.message || `Started watching ${label}.`
      };
    case "offer-observed":
      if (rawEvent.eligible !== true) return null;
      return {
        ...event,
        message: `Qualified ${label}: the exact first-party offer${Number.isFinite(rawEvent.price) ? ` at $${rawEvent.price.toFixed(2)}` : ""} matched the mission criteria.`
      };
    case "cart-item-confirmed":
      return {
        ...event,
        message: `Added ${quantityPrefix(rawEvent, product)}${label} to cart.`
      };
    case "order-confirmed":
      return {
        ...event,
        message: `Ordered ${quantityPrefix(rawEvent, product)}${label}${Number.isFinite(rawEvent.orderTotal) ? `; the store confirmed a $${rawEvent.orderTotal.toFixed(2)} total` : "; the store displayed its confirmation"}.`
      };
    case "notification-sent":
      return {
        ...event,
        message: rawEvent.message || "Notification sent."
      };
    default:
      return null;
  }
}

function activityFingerprint(event = {}) {
  if (!ACTIVITY_EVENT_TYPES.has(event.eventType)) return "";
  if (event.eventType === "offer-observed" && event.eligible !== true) return "";
  const common = [
    event.eventType,
    event.productId || "",
    event.runId || ""
  ];
  if (event.eventType === "notification-sent") {
    common.push(event.notificationKey || event.message || "");
  }
  return JSON.stringify(common);
}

function shouldRecordActivity(events = [], event = {}) {
  const fingerprint = activityFingerprint(event);
  if (!fingerprint) return false;
  return !events.some((candidate) => activityFingerprint(candidate) === fingerprint);
}

module.exports = {
  ACTIVITY_EVENT_TYPES,
  activityFingerprint,
  createActivityEvent,
  shouldRecordActivity
};
