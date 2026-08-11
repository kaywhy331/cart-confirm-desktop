"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BUILT_IN_PROFILES,
  MAX_CUSTOM_PROFILES,
  configurationFrom,
  normalizeCustomProfiles
} = require("../lib/config-profiles");

test("built-in configuration profiles are valid and contain only safe global fields", () => {
  assert.deepEqual(BUILT_IN_PROFILES.map((profile) => profile.name), [
    "Recommended",
    "Low traffic",
    "Scheduled drop"
  ]);
  for (const profile of BUILT_IN_PROFILES) {
    assert.deepEqual(configurationFrom(profile.configuration), profile.configuration);
    assert.equal("products" in profile.configuration, false);
    assert.equal("automationEnabled" in profile.configuration, false);
  }
});

test("custom profiles are bounded, deduplicated, and strip purchase data", () => {
  const source = Array.from({ length: MAX_CUSTOM_PROFILES + 2 }, (_, index) => ({
    id: `custom:profile-${index}`,
    name: `Profile ${index}`,
    configuration: {
      ...BUILT_IN_PROFILES[0].configuration,
      products: [{ id: "target:unsafe" }],
      automationEnabled: true
    }
  }));
  source.splice(1, 0, { ...source[0], id: "custom:duplicate-name" });
  source.splice(2, 0, { id: "bad", name: "Invalid", configuration: {} });

  const profiles = normalizeCustomProfiles(source);
  assert.equal(profiles.length, MAX_CUSTOM_PROFILES);
  assert.equal(profiles.filter((profile) => profile.name === "Profile 0").length, 1);
  assert.equal(profiles.every((profile) => !("products" in profile.configuration)), true);
  assert.equal(profiles.every((profile) => !("automationEnabled" in profile.configuration)), true);
});
