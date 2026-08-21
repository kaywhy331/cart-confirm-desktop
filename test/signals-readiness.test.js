"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { sourceState } = require("../lib/signals-readiness");

test("Signals cannot start until at least one real source is ready", () => {
  const result = sourceState({
    settings: {},
    status: { companion: "disconnected" },
    signalBridge: {},
    discord: {}
  });

  assert.equal(result.canStart, false);
  assert.equal(result.readyCount, 0);
  assert.match(result.hardIssue, /at least one ready source/);
  assert.match(result.summary, /No signal source is ready/);
});

test("a connected browser page is independently sufficient for Signals", () => {
  const result = sourceState({ status: { companion: "connected" } });

  assert.equal(result.canStart, true);
  assert.equal(result.readyCount, 1);
  assert.equal(result.ready[0].id, "browser");
  assert.equal(result.hardIssue, "");
});

test("TrackaLacker enrollment without followed-product mappings remains actionable", () => {
  const result = sourceState({
    settings: { trackalackerSignalBridgeEnabled: true },
    status: { companion: "disconnected" },
    signalBridge: {
      enabled: true,
      extensionConnected: true,
      listenerReady: true,
      subscriptionPresent: true,
      mappingCount: 0
    }
  });

  const source = result.sources.find((candidate) => candidate.id === "trackalacker");
  assert.equal(source.ready, false);
  assert.equal(source.action, "scan-trackalacker");
  assert.match(source.detail, /no followed-product mappings/);
  assert.equal(result.canStart, false);
});

test("an enrolled, unpaused, mapped TrackaLacker bridge is a ready source", () => {
  const result = sourceState({
    settings: { trackalackerSignalBridgeEnabled: true },
    status: { companion: "disconnected" },
    signalBridge: {
      enabled: true,
      extensionConnected: true,
      listenerReady: true,
      subscriptionPresent: true,
      mappingCount: 12
    }
  });

  assert.equal(result.canStart, true);
  assert.equal(result.readyCount, 1);
  assert.equal(result.ready[0].id, "trackalacker");
  assert.match(result.summary, /TrackaLacker Push/);
});

test("a configured but disconnected Discord source is reported for repair", () => {
  const result = sourceState({
    settings: { discordEnabled: true },
    status: { companion: "connected" },
    discord: { configured: true, connected: false }
  });

  assert.equal(result.canStart, true, "the ready browser source still permits Signals");
  assert.deepEqual(result.configuredProblems.map((source) => source.id), ["discord"]);
  assert.match(result.configuredProblems[0].detail, /Reconnect/);
});
