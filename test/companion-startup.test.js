"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  companionConnectionReady,
  selectConnectionBootstrap,
  waitForCompanionConnection
} = require("../lib/companion-startup");

test("a companion connection requires a recent retailer-tab heartbeat", () => {
  const now = Date.parse("2026-08-14T20:00:30.000Z");
  assert.equal(companionConnectionReady({
    companion: "connected",
    lastHeartbeatAt: "2026-08-14T20:00:10.000Z"
  }, now), true);
  assert.equal(companionConnectionReady({
    companion: "connected",
    lastHeartbeatAt: "2026-08-14T19:59:00.000Z"
  }, now), false);
  assert.equal(companionConnectionReady({
    companion: "waiting",
    lastHeartbeatAt: "2026-08-14T20:00:29.000Z"
  }, now), false);
});

test("connection bootstrap prefers a due mission, then another enabled mission, then prep", () => {
  const due = { id: "target:1", retailer: "target", productUrl: "https://www.target.com/p/example/-/A-1" };
  const enabled = { id: "amazon:B000000001", retailer: "amazon", productUrl: "https://www.amazon.com/dp/B000000001" };
  const prep = { id: "walmart:3", retailer: "walmart", productUrl: "https://www.walmart.com/ip/3" };
  assert.deepEqual(selectConnectionBootstrap({ ready: [due], enabled: [enabled] }, [prep]), due);
  assert.deepEqual(selectConnectionBootstrap({ ready: [], enabled: [enabled] }, [prep]), enabled);
  assert.deepEqual(selectConnectionBootstrap({ ready: [], enabled: [] }, [prep]), prep);
});

test("automatic connection waits until Chrome sends a fresh heartbeat", async () => {
  let now = 1_000;
  const state = { status: { companion: "waiting", lastHeartbeatAt: "" }, companionHello: null };
  const connected = await waitForCompanionConnection(() => state, {
    startedAt: now,
    timeoutMs: 1_000,
    pollMs: 100,
    now: () => now,
    delay: async (milliseconds) => {
      now += milliseconds;
      if (now >= 1_300) {
        state.status = { companion: "connected", lastHeartbeatAt: new Date(now).toISOString() };
      }
    }
  });
  assert.equal(connected.status.companion, "connected");
  assert.equal(now, 1_300);
});

test("automatic connection gives a bundled version reload one automatic retry", async () => {
  const now = Date.parse("2026-08-14T20:00:00.000Z");
  let retries = 0;
  const state = {
    status: { companion: "waiting", lastHeartbeatAt: "" },
    companionHello: {
      reason: "version-mismatch",
      seenAt: new Date(now).toISOString()
    }
  };
  const connected = await waitForCompanionConnection(() => state, {
    startedAt: now,
    timeoutMs: 1_000,
    now: () => now,
    delay: async () => {},
    onVersionMismatch: async () => {
      retries += 1;
      state.status = { companion: "connected", lastHeartbeatAt: new Date(now).toISOString() };
    }
  });
  assert.equal(connected.status.companion, "connected");
  assert.equal(retries, 1);
});

test("automatic connection reports a pairing mismatch immediately", async () => {
  const now = Date.parse("2026-08-14T20:00:00.000Z");
  await assert.rejects(() => waitForCompanionConnection(() => ({
    status: { companion: "waiting", lastHeartbeatAt: "" },
    companionHello: {
      reason: "pairing-mismatch",
      seenAt: new Date(now).toISOString()
    }
  }), {
    startedAt: now,
    timeoutMs: 1_000,
    now: () => now,
    delay: async () => {}
  }), /paired with a different desktop installation/);
});

test("automatic connection times out with an actionable recovery message", async () => {
  let now = 5_000;
  await assert.rejects(() => waitForCompanionConnection(() => ({
    status: { companion: "waiting", lastHeartbeatAt: "" },
    companionHello: null
  }), {
    startedAt: now,
    timeoutMs: 300,
    pollMs: 100,
    now: () => now,
    delay: async (milliseconds) => { now += milliseconds; }
  }), /did not connect within 1 seconds/);
});
