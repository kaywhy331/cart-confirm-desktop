"use strict";

(() => {
  const MAX_CUSTOM_PROFILES = 12;
  const PROFILE_FIELDS = Object.freeze([
    "fastMode",
    "watcherIntervalSeconds",
    "retryIntervalSeconds",
    "eligibilityRefreshIntervalSeconds",
    "blitzRetryDelayMs",
    "blitzWindowSeconds",
    "walmartQueueCaptureReloads",
    "storeNavigationIntervalSeconds",
    "overloadCooldownSeconds"
  ]);
  const LIMITS = Object.freeze({
    watcherIntervalSeconds: Object.freeze({ min: 30, max: 3600, label: "Regular watch interval", unit: "seconds" }),
    retryIntervalSeconds: Object.freeze({ min: 5, max: 3600, label: "Scheduled-drop error wait", unit: "seconds" }),
    eligibilityRefreshIntervalSeconds: Object.freeze({ min: 2, max: 60, label: "Scheduled stock refresh", unit: "seconds" }),
    blitzRetryDelayMs: Object.freeze({ min: 250, max: 5000, label: "Target retry-click pause", unit: "milliseconds" }),
    blitzWindowSeconds: Object.freeze({ min: 5, max: 120, label: "Target retry window", unit: "seconds" }),
    walmartQueueCaptureReloads: Object.freeze({ min: 1, max: 20, label: "Walmart queue-capture reloads", unit: "reloads" }),
    storeNavigationIntervalSeconds: Object.freeze({ min: 10, max: 3600, label: "Store page-move gap", unit: "seconds" }),
    overloadCooldownSeconds: Object.freeze({ min: 60, max: 86_400, label: "Store overload rest time", unit: "seconds" })
  });

  function frozenConfiguration(input) {
    return Object.freeze({ ...input });
  }

  const BUILT_IN_PROFILES = Object.freeze([
    Object.freeze({
      id: "built-in:recommended",
      name: "Recommended",
      description: "The normal starting point. Regular watches check once a minute, while scheduled drops use the bounded faster lane.",
      configuration: frozenConfiguration({
        fastMode: true,
        watcherIntervalSeconds: 60,
        retryIntervalSeconds: 15,
        eligibilityRefreshIntervalSeconds: 2,
        blitzRetryDelayMs: 750,
        blitzWindowSeconds: 20,
        walmartQueueCaptureReloads: 5,
        storeNavigationIntervalSeconds: 20,
        overloadCooldownSeconds: 300
      })
    }),
    Object.freeze({
      id: "built-in:low-traffic",
      name: "Low traffic",
      description: "Checks and page moves happen less often, with a longer rest after retailer overloads.",
      configuration: frozenConfiguration({
        fastMode: true,
        watcherIntervalSeconds: 300,
        retryIntervalSeconds: 60,
        eligibilityRefreshIntervalSeconds: 15,
        blitzRetryDelayMs: 2000,
        blitzWindowSeconds: 10,
        walmartQueueCaptureReloads: 3,
        storeNavigationIntervalSeconds: 60,
        overloadCooldownSeconds: 900
      })
    }),
    Object.freeze({
      id: "built-in:scheduled-drop",
      name: "Scheduled drop",
      description: "For a known release time. Calendar-fired missions check quickly after release while fixed safety limits remain in force.",
      configuration: frozenConfiguration({
        fastMode: true,
        watcherIntervalSeconds: 60,
        retryIntervalSeconds: 10,
        eligibilityRefreshIntervalSeconds: 2,
        blitzRetryDelayMs: 750,
        blitzWindowSeconds: 20,
        walmartQueueCaptureReloads: 5,
        storeNavigationIntervalSeconds: 20,
        overloadCooldownSeconds: 300
      })
    })
  ]);

  function wholeNumber(value, field) {
    const limit = LIMITS[field];
    const number = Number(value);
    if (!Number.isInteger(number) || number < limit.min || number > limit.max) {
      throw new Error(`${limit.label} must be a whole number from ${limit.min} to ${limit.max} ${limit.unit}.`);
    }
    return number;
  }

  function normalizeConfiguration(input = {}) {
    const configuration = {
      fastMode: input.fastMode !== false,
      watcherIntervalSeconds: wholeNumber(input.watcherIntervalSeconds, "watcherIntervalSeconds"),
      retryIntervalSeconds: wholeNumber(input.retryIntervalSeconds, "retryIntervalSeconds"),
      eligibilityRefreshIntervalSeconds: wholeNumber(input.eligibilityRefreshIntervalSeconds, "eligibilityRefreshIntervalSeconds"),
      blitzRetryDelayMs: wholeNumber(input.blitzRetryDelayMs, "blitzRetryDelayMs"),
      blitzWindowSeconds: wholeNumber(input.blitzWindowSeconds, "blitzWindowSeconds"),
      walmartQueueCaptureReloads: wholeNumber(input.walmartQueueCaptureReloads ?? 5, "walmartQueueCaptureReloads"),
      storeNavigationIntervalSeconds: wholeNumber(input.storeNavigationIntervalSeconds, "storeNavigationIntervalSeconds"),
      overloadCooldownSeconds: wholeNumber(input.overloadCooldownSeconds, "overloadCooldownSeconds")
    };
    if (configuration.eligibilityRefreshIntervalSeconds > configuration.storeNavigationIntervalSeconds) {
      throw new Error("Scheduled stock refresh cannot be slower than the store page-move gap.");
    }
    return configuration;
  }

  function configurationFrom(source = {}) {
    const picked = {};
    for (const field of PROFILE_FIELDS) picked[field] = source[field];
    return normalizeConfiguration(picked);
  }

  function normalizeCustomProfile(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("A saved profile must be an object.");
    }
    const id = String(input.id || "").trim().slice(0, 80);
    if (!/^custom:[a-z0-9][a-z0-9-]{5,72}$/i.test(id)) {
      throw new Error("A saved profile has an invalid ID.");
    }
    const name = String(input.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) throw new Error("Give the saved profile a name.");
    return {
      id,
      name,
      configuration: normalizeConfiguration(input.configuration || {})
    };
  }

  function normalizeCustomProfiles(input = []) {
    if (!Array.isArray(input)) return [];
    const profiles = [];
    const ids = new Set();
    const names = new Set();
    for (const candidate of input) {
      if (profiles.length >= MAX_CUSTOM_PROFILES) break;
      try {
        const profile = normalizeCustomProfile(candidate);
        const nameKey = profile.name.toLowerCase();
        if (ids.has(profile.id) || names.has(nameKey)) continue;
        ids.add(profile.id);
        names.add(nameKey);
        profiles.push(profile);
      } catch {
        // A malformed saved profile is discarded without risking the user's
        // missions or the rest of settings.json.
      }
    }
    return profiles;
  }

  const api = Object.freeze({
    BUILT_IN_PROFILES,
    MAX_CUSTOM_PROFILES,
    PROFILE_FIELDS,
    configurationFrom,
    normalizeConfiguration,
    normalizeCustomProfile,
    normalizeCustomProfiles
  });
  globalThis.CartConfirmConfigProfiles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
