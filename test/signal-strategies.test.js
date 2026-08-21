"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertSafeArmedUpdate, normalizeSettings } = require("../lib/core");
const { planSignalRoute } = require("../lib/signal-routing");
const {
  excludeKeywordsMatch,
  includeKeywordsMatch,
  matchSignalStrategy,
  normalizeSignalStrategies,
  parseKeywordQuery,
  signalPriceBand
} = require("../lib/signal-strategies");

const NOW = Date.parse("2026-08-21T12:00:30.000Z");
const product = {
  id: "target:95298172",
  retailer: "target",
  sku: "95298172",
  title: "Pokemon Destined Rivals Elite Trainer Box",
  productUrl: "https://www.target.com/p/example/-/A-95298172",
  maxPrice: 55,
  maxOrderTotal: 300,
  quantity: 5,
  action: "checkout",
  fulfillmentMode: "shipping",
  msrpRecordId: "msrp:pokemon-etb",
  enabled: true,
  signalAutoOpen: true,
  signalEntry: "product",
  openAt: ""
};
const signal = {
  id: "trackalacker:strategy-test",
  source: "trackalacker",
  productId: product.id,
  retailer: product.retailer,
  title: product.title,
  keywordText: `${product.title}\nIN STOCK at Target!`,
  msrpStatus: "at_msrp",
  price: 49.99,
  observedAt: "2026-08-21T12:00:00.000Z"
};

function strategy(overrides = {}) {
  return {
    id: "signal-strategy:test",
    name: "Test strategy",
    enabled: true,
    priceBand: "any",
    stores: [],
    action: "notify",
    quantity: "max",
    includeKeywords: "",
    excludeKeywords: "",
    ...overrides
  };
}

function settings(strategies = []) {
  return {
    products: [product],
    signalStrategies: strategies,
    msrpCatalog: [{
      id: "msrp:pokemon-etb",
      prices: { target: 49.99, walmart: null, amazon: null }
    }],
    signalsEnabled: true,
    automationEnabled: false,
    monitoringPaused: false,
    discordAutoOpen: true
  };
}

test("normalizes bounded editable strategy fields without changing list priority", () => {
  const normalized = normalizeSignalStrategies([
    strategy({
      id: "signal-strategy:first",
      name: "  First   rule ",
      stores: ["TARGET", "target"],
      priceBand: "msrp",
      action: "prepare_checkout",
      quantity: 3,
      includeKeywords: " pokemon   +  \"elite trainer box\" ",
      excludeKeywords: "used | refurbished"
    }),
    strategy({ id: "signal-strategy:second", name: "Second rule", enabled: false })
  ]);
  assert.deepEqual(normalized.map((item) => item.id), ["signal-strategy:first", "signal-strategy:second"]);
  assert.equal(normalized[0].name, "First rule");
  assert.deepEqual(normalized[0].stores, ["target"]);
  assert.equal(normalized[0].quantity, 3);
  assert.equal(normalized[1].enabled, false);
  assert.throws(() => normalizeSignalStrategies([strategy({ quantity: 6 })]), /1 through 5/);
  assert.throws(() => normalizeSignalStrategies([strategy({ action: "buy_now" })]), /Choose Notify/);
  assert.throws(() => normalizeSignalStrategies([strategy({ includeKeywords: "\"unfinished" })]), /Close every quoted/);
});

test("keyword queries support AND/+, exact quotes, OR alternatives, and exclusions", () => {
  const title = "Pokemon Destined Rivals Elite Trainer Box - New Sealed";
  assert.equal(includeKeywordsMatch("pokemon + \"elite trainer box\"", title), true);
  assert.equal(includeKeywordsMatch("pokemon + \"booster bundle\"", title), false);
  assert.equal(includeKeywordsMatch("'booster bundle' | \"elite trainer box\"", title), true);
  assert.equal(includeKeywordsMatch("pokemon -sealed", title), false);
  assert.equal(includeKeywordsMatch("", title), true, "empty include keywords are catchall");
  assert.equal(excludeKeywordsMatch("used | refurbished | \"open box\"", title), false);
  assert.equal(excludeKeywordsMatch("sealed | used", title), true);
  assert.equal(parseKeywordQuery("pokemon OR 'trainer box'").clauses.length, 2);
});

test("the first enabled matching strategy wins and lower strategies cannot override it", () => {
  const catchall = strategy({ id: "signal-strategy:catchall", name: "Top catchall", action: "notify" });
  const checkout = strategy({
    id: "signal-strategy:checkout",
    name: "Specific checkout",
    priceBand: "msrp",
    stores: ["target"],
    action: "submit_order",
    quantity: 3,
    includeKeywords: "pokemon + \"elite trainer box\""
  });
  const topWins = matchSignalStrategy({ signal, product, settings: settings([catchall, checkout]) });
  assert.equal(topWins.strategy.id, catchall.id);
  assert.equal(topWins.effectiveAction, "watch");

  const specificWins = matchSignalStrategy({ signal, product, settings: settings([checkout, catchall]) });
  assert.equal(specificWins.strategy.id, checkout.id);
  assert.equal(specificWins.effectiveAction, "checkout");
  assert.equal(specificWins.effectiveQuantity, 3);

  const noMatch = matchSignalStrategy({
    signal,
    product,
    settings: settings([
      strategy({ id: "signal-strategy:amazon", stores: ["amazon"] }),
      strategy({ id: "signal-strategy:disabled", enabled: false })
    ])
  });
  assert.equal(noMatch.state, "unmatched");
});

test("strategy actions and quantities can narrow but never escalate the mission contract", () => {
  const narrowedMission = { ...product, action: "review", quantity: 2 };
  const decision = matchSignalStrategy({
    signal,
    product: narrowedMission,
    settings: settings([strategy({ action: "submit_order", quantity: 5 })])
  });
  assert.equal(decision.requestedAction, "checkout");
  assert.equal(decision.effectiveAction, "review");
  assert.equal(decision.actionCapped, true);
  assert.equal(decision.effectiveQuantity, 2);
  assert.equal(decision.quantityCapped, true);

  const maximum = matchSignalStrategy({
    signal: { ...signal, orderLimit: 2 },
    product,
    settings: settings([strategy({ action: "add_to_cart", quantity: "max" })])
  });
  assert.equal(maximum.effectiveQuantity, 2, "Max allowed honors a fresh retailer signal limit under the mission cap");
  assert.equal(maximum.signalLimitApplied, true);
});

test("MSRP bands use TrackaLacker semantics first and approved mission MSRP otherwise", () => {
  const configured = settings();
  assert.equal(signalPriceBand({ msrpStatus: "below_msrp", price: 999 }, product, configured), "below_msrp");
  assert.equal(signalPriceBand({ msrpStatus: "near_msrp" }, product, configured), "msrp");
  assert.equal(signalPriceBand({ msrpStatus: "slightly_above_msrp" }, product, configured), "slightly_above_msrp");
  assert.equal(signalPriceBand({ msrpStatus: "above_msrp" }, product, configured), "above_msrp");
  assert.equal(signalPriceBand({ msrpStatus: "price_surge" }, product, configured), "above_msrp");
  assert.equal(signalPriceBand({ price: 49.98 }, product, configured), "below_msrp");
  assert.equal(signalPriceBand({ price: 49.99 }, product, configured), "msrp");
  assert.equal(signalPriceBand({ price: 52 }, product, configured), "slightly_above_msrp");
  assert.equal(signalPriceBand({ price: 60 }, product, configured), "above_msrp");
  assert.equal(signalPriceBand({ price: 49.99 }, { ...product, msrpRecordId: "" }, configured), "unknown");
});

test("Notify is a real no-navigation route and configured strategies reject unmatched signals", () => {
  const notified = planSignalRoute({
    signal,
    settings: settings([strategy({ name: "Notify me", action: "notify" })]),
    now: NOW
  });
  assert.equal(notified.state, "notified");
  assert.equal(notified.entry, "none");
  assert.equal(notified.url, "");

  const unmatched = planSignalRoute({
    signal,
    settings: settings([strategy({ stores: ["amazon"] })]),
    now: NOW
  });
  assert.equal(unmatched.state, "disabled");
  assert.equal(unmatched.reason, "no-strategy");
});

test("settings persist ordered strategies and require disarming before strategy edits", () => {
  const first = strategy({ id: "signal-strategy:first", action: "add_to_cart", quantity: 1 });
  const second = strategy({ id: "signal-strategy:second", action: "notify" });
  const armed = normalizeSettings({ products: [product], signalStrategies: [first, second], signalsEnabled: true });
  assert.deepEqual(armed.signalStrategies.map((item) => item.id), [first.id, second.id]);
  const reordered = normalizeSettings({ ...armed, signalStrategies: [second, first] }, armed);
  assert.throws(() => assertSafeArmedUpdate(armed, reordered), /Disarm automation/);
  assert.doesNotThrow(() => assertSafeArmedUpdate(armed, { ...reordered, signalsEnabled: false }));
});
