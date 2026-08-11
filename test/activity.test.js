"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldRecordActivity } = require("../lib/activity");

const base = {
  productId: "target:95298172",
  retailer: "target",
  page: "https://www.target.com/p/item/-/A-95298172"
};

test("unchanged observation states collapse across page refreshes", () => {
  const existing = [
    { ...base, eventType: "offer-observed", availability: "available", price: 34.99, seller: "", firstParty: true, eligible: true, reason: "eligible", message: "Test mode is observation-only." },
    { ...base, eventType: "availability", availability: "available" },
    { ...base, eventType: "page-observed" }
  ];
  assert.equal(shouldRecordActivity(existing, { ...existing[0], timestamp: new Date().toISOString(), attempt: 0 }), false);
  assert.equal(shouldRecordActivity(existing, { ...existing[1], timestamp: new Date().toISOString() }), false);
  assert.equal(shouldRecordActivity(existing, { ...existing[2], timestamp: new Date().toISOString() }), false);
});

test("real offer, availability, route, and operating-mode changes remain visible", () => {
  const existing = [
    { ...base, eventType: "offer-observed", availability: "available", price: 34.99, firstParty: true, eligible: true, reason: "eligible", message: "Test mode is observation-only." },
    { ...base, eventType: "availability", availability: "available" },
    { ...base, eventType: "page-observed" }
  ];
  assert.equal(shouldRecordActivity(existing, { ...existing[0], price: 35.99 }), true);
  assert.equal(shouldRecordActivity(existing, { ...existing[0], message: "Autopilot is starting the auto-buy workflow." }), true);
  assert.equal(shouldRecordActivity(existing, { ...existing[1], availability: "unavailable" }), true);
  assert.equal(shouldRecordActivity(existing, { ...existing[2], page: "https://www.target.com/cart" }), true);
  assert.equal(shouldRecordActivity(existing, { ...base, eventType: "add-clicked", attempt: 1 }), true);
});
