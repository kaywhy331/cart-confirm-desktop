"use strict";

const COLLAPSIBLE_TYPES = new Set(["page-observed", "availability", "offer-observed"]);

function activityFingerprint(event = {}) {
  if (!COLLAPSIBLE_TYPES.has(event.eventType)) return "";
  if (event.eventType === "page-observed") {
    return JSON.stringify([event.productId || "", event.page || ""]);
  }
  if (event.eventType === "availability") {
    return JSON.stringify([event.productId || "", event.availability || "unknown"]);
  }
  return JSON.stringify([
    event.productId || "",
    event.availability || "unknown",
    event.price ?? null,
    event.seller || "",
    event.firstParty ?? null,
    event.eligible ?? null,
    event.reason || "",
    event.eligible === true ? event.message || "" : ""
  ]);
}

function shouldRecordActivity(events = [], event = {}) {
  const fingerprint = activityFingerprint(event);
  if (!fingerprint) return true;
  const previous = events.find((candidate) => (
    candidate?.eventType === event.eventType
    && candidate.productId === event.productId
  ));
  return !previous || activityFingerprint(previous) !== fingerprint;
}

module.exports = { activityFingerprint, shouldRecordActivity };
