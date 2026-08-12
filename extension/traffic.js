"use strict";

(() => {
  const OVERLOAD_STATUS_CODES = new Set([429, 502, 503, 504, 520, 521, 522, 523, 524]);
  const RESERVATION_GRACE_MS = 120_000;
  const OVERLOAD_DECAY_MS = 6 * 60 * 60_000;
  const MAX_COOLDOWN_MS = 24 * 60 * 60_000;
  const ACTION_OVERLOAD_WINDOW_MS = 15_000;
  const TARGET_PERSISTENCE_ACTIONS = new Set([
    "target-persistence:add",
    "target-persistence:quantity",
    "target-persistence:cart",
    "target-persistence:checkout",
    "target-persistence:submit"
  ]);

  function finiteTime(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function cloneState(input = {}) {
    return {
      cooldownUntil: finiteTime(input.cooldownUntil),
      lastNavigationAt: finiteTime(input.lastNavigationAt),
      overloadCount: Number.isInteger(input.overloadCount) && input.overloadCount >= 0
        ? input.overloadCount
        : 0,
      lastStatus: Number.isInteger(input.lastStatus) ? input.lastStatus : 0,
      lastSignalAt: finiteTime(input.lastSignalAt),
      reservations: Object.fromEntries(
        Object.entries(input.reservations || {}).map(([id, reservation]) => [id, { ...reservation }])
      )
    };
  }

  function pruneReservations(state, now) {
    for (const [id, reservation] of Object.entries(state.reservations)) {
      if (!reservation || finiteTime(reservation.allowedAt) + RESERVATION_GRACE_MS < now) {
        delete state.reservations[id];
      }
    }
    return state;
  }

  function latestReservedSlot(state, intervalMs) {
    const reservationTimes = Object.values(state.reservations).map((entry) => finiteTime(entry.allowedAt));
    return Math.max(
      state.lastNavigationAt ? state.lastNavigationAt + intervalMs : 0,
      ...reservationTimes.map((time) => time + intervalMs),
      0
    );
  }

  function navigationIntervalMs(config = {}, cadence = "normal") {
    const normalMs = Math.max(
      10_000,
      finiteTime(config.storeNavigationIntervalSeconds, 20) * 1000
    );
    if (cadence !== "eligibility") return normalMs;
    const eligibilityMs = Math.max(
      2_000,
      finiteTime(config.eligibilityRefreshIntervalSeconds, 2) * 1000
    );
    return Math.min(normalMs, eligibilityMs);
  }

  function reserveNavigationSlot(input, options) {
    const now = finiteTime(options.now, Date.now());
    const intervalMs = Math.max(1_000, finiteTime(options.intervalMs, 20_000));
    const reservationId = String(options.reservationId || "");
    if (!reservationId) throw new Error("A navigation reservation ID is required.");
    const state = pruneReservations(cloneState(input), now);
    // A product re-reserving replaces its own earlier slot instead of queueing
    // behind it; stale abandoned slots must not starve the other products.
    const ownerId = String(options.ownerId || "");
    const productId = String(options.productId || "");
    for (const [id, reservation] of Object.entries(state.reservations)) {
      if (id !== reservationId && reservation.ownerId === ownerId && reservation.productId === productId) {
        delete state.reservations[id];
      }
    }
    const notBefore = finiteTime(options.notBefore, now);
    const allowedAt = Math.max(
      now,
      notBefore,
      state.cooldownUntil,
      latestReservedSlot(state, intervalMs)
    );
    state.reservations[reservationId] = {
      allowedAt,
      ownerId: String(options.ownerId || ""),
      productId: String(options.productId || ""),
      intervalMs
    };
    return { state, allowedAt, waitMs: Math.max(0, allowedAt - now) };
  }

  function revalidateNavigationSlot(input, options) {
    const now = finiteTime(options.now, Date.now());
    let state = pruneReservations(cloneState(input), now);
    const reservationId = String(options.reservationId || "");
    let reservation = state.reservations[reservationId];
    if (!reservation) return { state, allowed: false, reason: "reservation-missing", waitMs: 0 };
    if (
      reservation.ownerId !== String(options.ownerId || "")
      || reservation.productId !== String(options.productId || "")
    ) {
      return { state, allowed: false, reason: "reservation-mismatch", waitMs: 0 };
    }

    if (state.cooldownUntil > reservation.allowedAt) {
      delete state.reservations[reservationId];
      const shifted = reserveNavigationSlot(state, {
        now,
        notBefore: state.cooldownUntil,
        intervalMs: reservation.intervalMs,
        reservationId,
        ownerId: reservation.ownerId,
        productId: reservation.productId
      });
      state = shifted.state;
      reservation = state.reservations[reservationId];
    }

    if (now < reservation.allowedAt) {
      return { state, allowed: false, reason: "not-ready", waitMs: reservation.allowedAt - now };
    }

    delete state.reservations[reservationId];
    state.lastNavigationAt = now;
    return { state, allowed: true, reason: "allowed", waitMs: 0 };
  }

  function applyOverloadSignal(input, options) {
    const now = finiteTime(options.now, Date.now());
    const state = pruneReservations(cloneState(input), now);
    const defaultCooldownMs = Math.max(60_000, finiteTime(options.defaultCooldownMs, 300_000));
    const retryAfterMs = finiteTime(options.retryAfterMs);
    if (state.lastSignalAt && now - state.lastSignalAt > OVERLOAD_DECAY_MS) state.overloadCount = 0;
    const escalation = 2 ** Math.min(4, state.overloadCount);
    const cooldownMs = Math.min(MAX_COOLDOWN_MS, Math.max(defaultCooldownMs * escalation, retryAfterMs));
    state.cooldownUntil = Math.max(state.cooldownUntil, now + cooldownMs);
    state.overloadCount += 1;
    state.lastStatus = Number.isInteger(options.status) ? options.status : 0;
    state.lastSignalAt = now;
    return { state, cooldownUntil: state.cooldownUntil, cooldownMs: state.cooldownUntil - now };
  }

  function parseRetryAfter(value, now = Date.now()) {
    const text = String(value || "").trim();
    if (!text) return 0;
    if (/^\d+$/.test(text)) return Math.min(86_400_000, Number(text) * 1000);
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? Math.min(86_400_000, Math.max(0, parsed - now)) : 0;
  }

  function isOverloadStatus(status) {
    return OVERLOAD_STATUS_CODES.has(Number(status));
  }

  function isRelevantOverloadSignal(resourceType, lastAuthorizedActionAt, now = Date.now()) {
    if (resourceType === "main_frame") return true;
    if (resourceType !== "xmlhttprequest") return false;
    const actionAt = finiteTime(lastAuthorizedActionAt);
    const observedAt = finiteTime(now, Date.now());
    return actionAt > 0
      && observedAt >= actionAt
      && observedAt - actionAt <= ACTION_OVERLOAD_WINDOW_MS;
  }

  function canBypassOverloadCooldown(retailer, kind) {
    return retailer === "target" && TARGET_PERSISTENCE_ACTIONS.has(String(kind || ""));
  }

  const api = Object.freeze({
    OVERLOAD_STATUS_CODES,
    ACTION_OVERLOAD_WINDOW_MS,
    MAX_COOLDOWN_MS,
    OVERLOAD_DECAY_MS,
    applyOverloadSignal,
    canBypassOverloadCooldown,
    isOverloadStatus,
    isRelevantOverloadSignal,
    navigationIntervalMs,
    parseRetryAfter,
    reserveNavigationSlot,
    revalidateNavigationSlot
  });

  globalThis.CartConfirmTraffic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
