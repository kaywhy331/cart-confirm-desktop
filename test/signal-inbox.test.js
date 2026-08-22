"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSignals, upsertSignal } = require("../lib/signal-inbox");

test("the signal inbox deduplicates messages and sanitizes persisted Amazon actions", () => {
  const base = {
    id: "discord:1",
    retailer: "amazon",
    sku: "B0GG16Q4X1",
    title: "Cards",
    observedAt: "2026-08-08T17:20:00.000Z",
    amazonBuyNowUrl: "https://www.amazon.com/gp/buy/express/handlers/display.html?ASIN=B0GG16Q4X1&quantity=1&offerListingID=offer&isEligibilityLogicDisabled=1"
  };
  const signals = upsertSignal([base], { ...base, note: "matched", autoOpenState: "opened" });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].note, "matched");
  assert.equal(signals[0].amazonBuyNowUrl.includes("isEligibilityLogicDisabled"), false);
  assert.equal(signals[0].productUrl, "https://www.amazon.com/dp/B0GG16Q4X1");
});

test("invalid signal records fail closed", () => {
  assert.deepEqual(normalizeSignals([{ retailer: "other", sku: "x" }, null]), []);
});

test("the inbox retains an explicit Signals-off receipt state", () => {
  const [signal] = normalizeSignals([{
    id: "trackalacker:signals-off",
    source: "trackalacker",
    retailer: "amazon",
    sku: "B0G3GN6Q72",
    autoOpenState: "not-armed"
  }]);
  assert.equal(signal.autoOpenState, "not-armed");
});
