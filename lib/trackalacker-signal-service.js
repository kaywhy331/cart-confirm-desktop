"use strict";

const {
  parseTrackalackerNotification,
  semanticDedupeKey,
  transportDedupeKey
} = require("./trackalacker-notification");
const { resolveTrackalackerSignal } = require("./trackalacker-signal-resolver");
const {
  appendSignalRecord,
  duplicateSemanticRecord,
  duplicateSignalRecord,
  recordDuplicateOccurrence
} = require("./signal-journal");
const { planSignalRoute } = require("./signal-routing");

function iso(value = Date.now()) {
  return new Date(Number(value)).toISOString();
}

function validIdempotencyKey(value) {
  return /^[A-Za-z0-9:._-]{8,180}$/.test(String(value || ""));
}

function routeDecision(route) {
  if (route.state === "pending") return "queued";
  if (route.state === "stale") return "mission_expired";
  if (route.state === "new-product") return "no_matching_mission";
  if (route.reason === "over-price") return "price_exceeds_limit";
  if (route.reason === "order-limit") return "quantity_limit";
  return "mission_disabled";
}

function baseRecord(parsed, resolution, keys, receivedAt, timing) {
  const mapping = resolution?.mapping || {};
  return {
    id: parsed.envelope.signalId,
    signalId: parsed.envelope.signalId,
    source: "trackalacker",
    transport: parsed.envelope.source.transport,
    notificationId: parsed.envelope.source.notificationId,
    transportKey: keys.transportKey,
    semanticKey: keys.semanticKey,
    receivedAt,
    observedAt: parsed.observedAt,
    testSignal: parsed.envelope.testSignal,
    rawTitle: parsed.envelope.notification.title,
    rawBody: parsed.envelope.notification.body || parsed.envelope.notification.textElements.join("\n"),
    eventType: parsed.eventType,
    retailer: parsed.retailer,
    productNameRaw: parsed.productNameRaw,
    normalizedProductName: parsed.normalizedProductName,
    price: parsed.price,
    currency: parsed.currency,
    msrpStatus: parsed.msrpStatus,
    resolutionState: parsed.parseState === "malformed" ? "malformed" : resolution?.state || "unresolved",
    matchMethod: resolution?.matchMethod || "none",
    itemId: mapping.itemId || "",
    productId: mapping.productId || "",
    sourceProductId: mapping.sourceProductId || "",
    sourceListingId: mapping.listingId || "",
    missionDecision: "recorded",
    actionState: "none",
    reason: "",
    timing
  };
}

function responseFor(record, overrides = {}) {
  const missionIds = Array.isArray(overrides.missionIds)
    ? [...new Set(overrides.missionIds.filter(Boolean))]
    : [];
  const { missionIds: _missionIds, ...responseOverrides } = overrides;
  return {
    accepted: true,
    signal_id: record.signalId,
    // A pre-sync mapping is not a CartCollect mission. Keep these fields tied
    // to the exact configured mission lookup so disabled/paused bridge states
    // cannot report a false-positive mission match.
    mission_matches: missionIds.length,
    action: record.missionDecision,
    mission_ids: missionIds,
    reason: record.reason,
    duplicate_of: record.duplicateOf || "",
    ...responseOverrides
  };
}

function processTrackalackerSignal(options = {}) {
  if (!validIdempotencyKey(options.idempotencyKey)) {
    throw new Error("A valid Idempotency-Key header is required.");
  }
  const receivedMs = Number(options.now ?? Date.now());
  const receivedAt = iso(receivedMs);
  const parsed = parseTrackalackerNotification(options.envelope, options.validation);
  const parseCompletedAt = iso(options.clock?.() ?? Date.now());
  const resolution = parsed.parseState === "parsed"
    ? resolveTrackalackerSignal(parsed, options.index, options.settings?.products || [], options.hints)
    : { state: "unresolved", matchMethod: "none", mapping: null, mission: null };
  const resolvedAt = iso(options.clock?.() ?? Date.now());
  const transportKey = transportDedupeKey(parsed);
  const semanticKey = semanticDedupeKey(
    parsed,
    resolution.mapping,
    options.settings?.trackalackerSignalDedupeWindowSeconds
  );
  const keys = { transportKey, semanticKey };
  const semanticInput = {
    productId: resolution.mapping?.productId,
    eventType: parsed.eventType,
    price: parsed.price,
    observedAt: parsed.observedAt
  };
  const duplicate = duplicateSignalRecord(options.journal, {
    signalId: parsed.envelope.signalId,
    transportKey,
    semanticKey
  }) || duplicateSemanticRecord(
    options.journal,
    semanticInput,
    options.settings?.trackalackerSignalDedupeWindowSeconds
  );
  const dedupeCompletedAt = iso(options.clock?.() ?? Date.now());
  if (duplicate) {
    const journal = recordDuplicateOccurrence(options.journal, duplicate, receivedAt, receivedMs);
    return {
      journal,
      parsed,
      resolution,
      route: null,
      record: journal.records.find((candidate) => candidate.id === duplicate.id),
      duplicate: true,
      shouldOpen: false,
      response: {
        accepted: true,
        signal_id: parsed.envelope.signalId,
        mission_matches: resolution.mission ? 1 : 0,
        action: "duplicate_signal",
        mission_ids: resolution.mission ? [resolution.mission.id] : [],
        reason: "This stock event was already acknowledged within the configured dedupe window.",
        duplicate_of: duplicate.signalId
      }
    };
  }

  const timing = {
    sourceCreatedAt: parsed.envelope.source.createdAt,
    listenerReceivedAt: parsed.envelope.source.receivedAt,
    cartcollectReceivedAt: receivedAt,
    parseCompletedAt,
    resolvedAt,
    dedupeCompletedAt,
    missionEvaluatedAt: "",
    actionStartedAt: "",
    acknowledgedAt: ""
  };
  const record = baseRecord(parsed, resolution, keys, receivedAt, timing);
  let route = null;

  if (parsed.envelope.testSignal || parsed.testNotification) {
    record.missionDecision = "test_signal";
    record.reason = "Synthetic and TrackaLacker test notifications are dry-run only.";
  } else if (parsed.parseState !== "parsed") {
    record.missionDecision = "unsupported_event";
    record.reason = "The notification did not match a supported TrackaLacker format.";
  } else if (!parsed.actionable) {
    record.missionDecision = "unsupported_event";
    record.reason = "This TrackaLacker event type is not actionable.";
  } else if (resolution.state === "ambiguous") {
    record.missionDecision = "ambiguous_product";
    record.reason = "Multiple pre-synced variants matched; no mission was selected.";
  } else if (resolution.state !== "matched") {
    record.missionDecision = "unresolved_product";
    record.reason = "No exact pre-synced TrackaLacker listing matched this notification.";
  } else if (!options.settings?.trackalackerSignalBridgeEnabled) {
    record.missionDecision = "bridge_disabled";
    record.reason = "The TrackaLacker signal bridge is disabled.";
  } else if (options.settings?.trackalackerSignalDeliveryPaused) {
    record.missionDecision = "delivery_paused";
    record.reason = "Signal delivery is paused; capture was retained without mission action.";
  } else if (!resolution.mission) {
    record.missionDecision = "no_matching_mission";
    record.reason = "The listing is pre-synced, but no CartCollect mission exists for this store option.";
  } else if (!options.settings?.signalsEnabled || options.settings?.monitoringPaused) {
    record.missionDecision = "signals_not_armed";
    record.reason = "Signals mode is not armed; the signal was recorded without opening a store page.";
  } else {
    route = planSignalRoute({
      signal: resolution.canonicalSignal,
      settings: options.settings,
      autoOpenEnabled: true,
      now: receivedMs
    });
    record.missionDecision = routeDecision(route);
    record.reason = route.note;
    record.actionState = route.state === "pending" ? "pending" : "none";
  }

  record.timing.missionEvaluatedAt = iso(options.clock?.() ?? Date.now());
  record.timing.acknowledgedAt = iso(options.clock?.() ?? Date.now());
  const journal = appendSignalRecord(options.journal, record, receivedMs);
  const storedRecord = journal.records.find((candidate) => candidate.id === record.id);
  return {
    journal,
    parsed,
    resolution,
    route,
    record: storedRecord,
    duplicate: false,
    shouldOpen: route?.state === "pending",
    response: responseFor(storedRecord, {
      missionIds: resolution.mission ? [resolution.mission.id] : []
    })
  };
}

module.exports = {
  processTrackalackerSignal,
  routeDecision,
  validIdempotencyKey
};
