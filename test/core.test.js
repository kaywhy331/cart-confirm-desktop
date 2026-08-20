"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeArmedUpdate,
  createInitialStatus,
  createProductStatus,
  eventMessage,
  extractTcin,
  MAX_PRODUCTS,
  MAX_MISSION_GROUPS,
  matchingProduct,
  missionOpenUrl,
  normalizeMissionGroups,
  normalizeProduct,
  normalizeProductImageUrl,
  normalizeSettings,
  normalizeTargetUrl,
  preserveAdminCampaignFields,
  reduceProductStatus,
  reduceStatus,
  toAutomationProduct,
  toRendererProduct,
  validateEvent
} = require("../lib/core");
const { BUILT_IN_PROFILES } = require("../lib/config-profiles");
const {
  detectRetailer,
  extractSku,
  normalizeProductUrl,
  parseWalmartQueue,
  storeUrl
} = require("../lib/retailers");

const PRODUCTS = [
  {
    productUrl: "https://www.target.com/p/name/-/A-1011960739?ref=tracking",
    sku: "1011960739",
    maxPrice: 49.99,
    maxOrderTotal: 125,
    quantity: 2,
    action: "checkout",
    fulfillmentMode: "shipping"
  },
  {
    productUrl: "https://www.walmart.com/ip/example/123456789?athbdg=L1100",
    sku: "123456789",
    maxPrice: 25,
    maxOrderTotal: 0,
    quantity: 3,
    action: "cart",
    fulfillmentMode: "manual"
  },
  {
    productUrl: "https://www.amazon.com/Example/dp/B0ABC12345/ref=abc",
    sku: "B0ABC12345",
    maxPrice: 12.5,
    maxOrderTotal: 25,
    quantity: 1,
    action: "checkout",
    fulfillmentMode: "shipping"
  }
];

test("extracts store-specific product identifiers", () => {
  assert.equal(extractTcin(PRODUCTS[0].productUrl), "1011960739");
  assert.equal(extractSku("walmart", PRODUCTS[1].productUrl), "123456789");
  assert.equal(extractSku("amazon", PRODUCTS[2].productUrl), "B0ABC12345");
  assert.equal(extractSku("amazon", "b0abc12345"), "B0ABC12345");
});

test("automation status and offer messages preserve actionable workflow detail", () => {
  const status = validateEvent({
    eventType: "automation-status",
    retailer: "target",
    productId: "target:1011960739",
    message: "This mission already completed in another tab."
  });
  assert.equal(eventMessage(status), "This mission already completed in another tab.");

  const offer = validateEvent({
    eventType: "offer-observed",
    retailer: "target",
    productId: "target:1011960739",
    eligible: true,
    price: 34.99,
    message: "Test mode is observation-only, so no purchase action was attempted."
  });
  assert.equal(eventMessage(offer), "Test mode is observation-only, so no purchase action was attempted.");

  const retry = validateEvent({
    eventType: "retry-scheduled",
    retailer: "target",
    productId: "target:1011960739",
    reason: "retrying",
    message: "Target is refreshing one waiting mission every 2 seconds."
  });
  assert.equal(eventMessage(retry), "Target is refreshing one waiting mission every 2 seconds.");
});

test("detects retailers and canonicalizes product URLs", () => {
  assert.equal(detectRetailer(PRODUCTS[0].productUrl), "target");
  assert.equal(detectRetailer(PRODUCTS[1].productUrl), "walmart");
  assert.equal(detectRetailer(PRODUCTS[2].productUrl), "amazon");
  assert.equal(
    normalizeTargetUrl(PRODUCTS[0].productUrl),
    "https://www.target.com/p/name/-/A-1011960739"
  );
  assert.equal(normalizeProductUrl(PRODUCTS[1].productUrl), "https://www.walmart.com/ip/123456789");
  assert.equal(normalizeProductUrl(PRODUCTS[2].productUrl), "https://www.amazon.com/dp/B0ABC12345");
  assert.throws(() => normalizeProductUrl("https://example.com/item/1"), /Target\.com, Walmart\.com/);
});

test("normalizes a multi-store buy list and preserves a private token", () => {
  const defaults = normalizeSettings({ products: PRODUCTS });
  assert.equal(defaults.watcherIntervalSeconds, 60);
  assert.equal(defaults.blitzRetryDelayMs, 750);
  assert.equal(defaults.blitzWindowSeconds, 20);
  assert.equal(defaults.walmartQueueCaptureReloads, 0);
  assert.equal(defaults.orderTaxPercent, 12);
  assert.deepEqual(defaults.storeOrderAllowances, { target: 30, walmart: 30, amazon: 30 });
  assert.equal(defaults.products[0].maxOrderTotal, 141.98);
  assert.equal(defaults.products[1].maxOrderTotal, 0);
  assert.equal(defaults.products[2].maxOrderTotal, 44);

  const armedProducts = PRODUCTS.map((product) => ({
    ...product,
    action: "review",
    maxOrderTotal: Math.max(product.maxOrderTotal, product.maxPrice * product.quantity)
  }));
  const existing = normalizeSettings({ products: armedProducts, companionToken: "existing-token" });
  const result = normalizeSettings({
    products: armedProducts,
    automationEnabled: true,
    fastMode: false,
    retryIntervalSeconds: 8,
    eligibilityRefreshIntervalSeconds: 3,
    storeNavigationIntervalSeconds: 25,
    overloadCooldownSeconds: 600,
    watcherIntervalSeconds: 90,
    blitzRetryDelayMs: 500,
    blitzWindowSeconds: 30,
    walmartQueueCaptureReloads: 7,
    configurationProfiles: [{
      id: "custom:launch-night",
      name: "Launch night",
      configuration: BUILT_IN_PROFILES[2].configuration
    }],
    scheduledRetailer: "amazon"
  }, existing);

  assert.equal(result.products.length, 3);
  assert.equal(result.products[1].id, "walmart:123456789");
  assert.equal(result.products[2].productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(result.products[0].quantity, 2);
  assert.equal(result.products[0].maxOrderTotal, 141.98);
  assert.equal(result.companionToken, "existing-token");
  assert.equal(result.automationEnabled, true);
  assert.equal(result.fastMode, false);
  assert.equal(result.eligibilityRefreshIntervalSeconds, 3);
  assert.equal(result.storeNavigationIntervalSeconds, 25);
  assert.equal(result.overloadCooldownSeconds, 600);
  assert.equal(result.watcherIntervalSeconds, 90);
  assert.equal(result.blitzRetryDelayMs, 500);
  assert.equal(result.blitzWindowSeconds, 30);
  assert.equal(result.walmartQueueCaptureReloads, 7);
  assert.equal(result.configurationProfiles[0].name, "Launch night");
  assert.equal(result.configurationProfiles[0].configuration.eligibilityRefreshIntervalSeconds, 2);
  assert.equal(normalizeSettings({ products: armedProducts }, result).configurationProfiles.length, 1);
  assert.equal(result.scheduledRetailer, "amazon");
  assert.equal(result.discordEnabled, false);
  assert.equal(result.discordAutoOpen, true);
  assert.equal(result.products[2].signalEntry, "product");
  assert.equal(result.products[2].signalAutoOpen, true);
});

test("accepts 100 missions and rejects a 101st", () => {
  const products = Array.from({ length: MAX_PRODUCTS + 1 }, (_, index) => {
    const sku = String(1011209000 + index);
    return {
      productUrl: `https://www.target.com/p/item-${index}/-/A-${sku}`,
      sku,
      maxPrice: 20,
      quantity: 1,
      action: "watch",
      fulfillmentMode: "shipping"
    };
  });
  assert.equal(normalizeSettings({ products: products.slice(0, MAX_PRODUCTS) }).products.length, 100);
  assert.throws(() => normalizeSettings({ products }), /at most 100 products/);
});

test("normalizes persisted mission groups and clears unknown product assignments", () => {
  const missionGroups = normalizeMissionGroups([
    { id: "group:launch", name: "  Launch   night  ", collapsed: 1 },
    { id: "group:launch", name: "Duplicate", collapsed: false },
    { id: "", name: "Missing id" },
    null
  ]);
  assert.deepEqual(missionGroups, [{
    id: "group:launch",
    name: "Launch night",
    collapsed: true
  }]);

  const settings = normalizeSettings({
    missionGroups,
    products: [
      { ...PRODUCTS[0], groupId: "group:launch" },
      { ...PRODUCTS[1], groupId: "group:missing" }
    ]
  });
  assert.equal(settings.products[0].groupId, "group:launch");
  assert.equal(settings.products[1].groupId, "");
  assert.deepEqual(settings.missionGroups, missionGroups);

  const retained = normalizeSettings({ products: settings.products }, settings);
  assert.deepEqual(retained.missionGroups, missionGroups);
  assert.equal(retained.products[0].groupId, "group:launch");

  const bounded = normalizeMissionGroups(Array.from({ length: MAX_MISSION_GROUPS + 5 }, (_, index) => ({
    id: `group:${index}`,
    name: `Group ${index}`
  })));
  assert.equal(bounded.length, MAX_MISSION_GROUPS);
});

test("an approved future Walmart prep candidate can arm monitoring before it becomes a mission", () => {
  const candidate = {
    ...PRODUCTS[1],
    openAt: "2026-08-20T12:00:00.000Z",
    action: "review",
    fulfillmentMode: "shipping",
    maxOrderTotal: 100,
    enabled: true
  };
  const settings = normalizeSettings({
    products: [],
    walmartPrepCandidates: [candidate],
    automationEnabled: true
  });
  assert.equal(settings.products.length, 0);
  assert.equal(settings.walmartPrepCandidates[0].id, "walmart:123456789");
  assert.equal(settings.automationEnabled, true);
  assert.throws(() => normalizeSettings({
    products: [],
    walmartPrepCandidates: [{ ...candidate, maxPrice: 0 }],
    automationEnabled: true
  }), /positive maximum unit price/);
});

test("preserves only exact-SKU affiliate links resolved from the current Howl source", () => {
  const howlUrl = "https://howl.me/campaign123";
  const affiliateUrl = "https://www.target.com/p/example/-/A-1011960739?nrtv_cid=abc&clkid=123";
  const resolvedAt = "2026-08-08T18:00:00.000Z";
  const product = normalizeProduct({
    ...PRODUCTS[0],
    groupId: "group:launch",
    howlUrl,
    affiliateUrl,
    affiliateResolvedFrom: howlUrl,
    affiliateResolvedAt: resolvedAt
  });

  assert.equal(product.howlUrl, howlUrl);
  assert.equal(product.affiliateUrl, affiliateUrl);
  assert.equal(product.affiliateResolvedFrom, howlUrl);
  assert.equal(product.affiliateResolvedAt, resolvedAt);
  const automationProduct = toAutomationProduct(product);
  assert.equal(automationProduct.productUrl, product.productUrl);
  assert.equal("howlUrl" in automationProduct, false);
  assert.equal("affiliateUrl" in automationProduct, false);
  assert.equal("affiliateResolvedFrom" in automationProduct, false);
  assert.equal("affiliateResolvedAt" in automationProduct, false);
  assert.equal("groupId" in automationProduct, false);
  const rendererProduct = toRendererProduct(product);
  assert.equal(rendererProduct.affiliateUrl, affiliateUrl);
  assert.equal("howlUrl" in rendererProduct, false);
  assert.equal("affiliateResolvedFrom" in rendererProduct, false);
  assert.equal("affiliateResolvedAt" in rendererProduct, false);
  assert.equal(rendererProduct.groupId, "group:launch");

  const attemptedUserChange = normalizeProduct({
    ...PRODUCTS[0],
    howlUrl: "https://howl.me/untrusted-user-change",
    affiliateUrl: "https://www.target.com/p/example/-/A-1011960739?nrtv_cid=untrusted",
    affiliateResolvedFrom: "https://howl.me/untrusted-user-change",
    affiliateResolvedAt: "2026-08-08T19:00:00.000Z"
  });
  const preserved = preserveAdminCampaignFields([attemptedUserChange], [product])[0];
  assert.equal(preserved.howlUrl, howlUrl);
  assert.equal(preserved.affiliateUrl, affiliateUrl);
  assert.equal(preserved.affiliateResolvedFrom, howlUrl);
  assert.equal(preserved.affiliateResolvedAt, resolvedAt);

  const unprovisioned = preserveAdminCampaignFields([attemptedUserChange], [])[0];
  assert.equal(unprovisioned.howlUrl, "");
  assert.equal(unprovisioned.affiliateUrl, "");

  const stale = normalizeProduct({
    ...PRODUCTS[0],
    howlUrl: "https://howl.me/new-campaign",
    affiliateUrl,
    affiliateResolvedFrom: howlUrl,
    affiliateResolvedAt: resolvedAt
  });
  assert.equal(stale.affiliateUrl, "");
  assert.equal(stale.affiliateResolvedFrom, "");
  assert.equal(stale.affiliateResolvedAt, "");

  assert.throws(() => normalizeProduct({
    ...PRODUCTS[0],
    howlUrl,
    affiliateUrl: "https://www.target.com/p/-/A-95298172?nrtv_cid=wrong",
    affiliateResolvedFrom: howlUrl
  }), /does not match this mission's item ID/);
});

test("validates a user-managed affiliate Open link and keeps it out of automation config", () => {
  const affiliateOpenUrl = "https://www.target.com/p/-/A-1011960739?afid=user-campaign";
  const adminAffiliateUrl = "https://www.target.com/p/example/-/A-1011960739?nrtv_cid=admin";
  const product = normalizeProduct({
    ...PRODUCTS[0],
    affiliateOpenUrl
  });

  assert.equal(product.affiliateOpenUrl, affiliateOpenUrl);
  assert.equal("affiliateOpenUrl" in toAutomationProduct(product), false);
  assert.equal(toRendererProduct(product).affiliateOpenUrl, affiliateOpenUrl);
  assert.equal(missionOpenUrl({ ...product, affiliateUrl: adminAffiliateUrl }), affiliateOpenUrl);
  assert.equal(missionOpenUrl({ ...product, affiliateOpenUrl: "", affiliateUrl: adminAffiliateUrl }), adminAffiliateUrl);
  assert.equal(missionOpenUrl({ ...product, affiliateOpenUrl: "", affiliateUrl: "" }), product.productUrl);

  const changedAffiliateOpenUrl = "https://www.target.com/p/exact/-/A-1011960739?afid=changed";
  const preserved = preserveAdminCampaignFields(
    [{ ...product, affiliateOpenUrl: changedAffiliateOpenUrl }],
    [{ ...product, affiliateUrl: adminAffiliateUrl }]
  )[0];
  assert.equal(preserved.affiliateOpenUrl, changedAffiliateOpenUrl);
  assert.equal(preserved.affiliateUrl, adminAffiliateUrl);

  assert.throws(() => normalizeProduct({
    ...PRODUCTS[0],
    affiliateOpenUrl: "https://www.target.com/p/-/A-95298172?afid=wrong-item"
  }), /exact store and item ID/);
  assert.throws(() => normalizeProduct({
    ...PRODUCTS[0],
    affiliateOpenUrl: "https://www.walmart.com/ip/1011960739"
  }), /exact store and item ID/);
  assert.throws(() => normalizeProduct({
    ...PRODUCTS[0],
    affiliateOpenUrl: "https://howl.me/short-link"
  }), /direct HTTPS link/);
});

test("product image references allow only HTTPS store image hosts and stay out of automation config", () => {
  const imageUrl = "https://target.scene7.com/is/image/Target/GUEST_booster?wid=300#preview";
  const normalizedImageUrl = "https://target.scene7.com/is/image/Target/GUEST_booster?wid=300";
  const product = normalizeProduct({ ...PRODUCTS[0], imageUrl });

  assert.equal(product.imageUrl, normalizedImageUrl);
  assert.equal(normalizeProductImageUrl("https://i5.walmartimages.com/seo/item.jpg", "walmart"), "https://i5.walmartimages.com/seo/item.jpg");
  assert.equal(normalizeProductImageUrl("https://m.media-amazon.com/images/I/item.jpg", "amazon"), "https://m.media-amazon.com/images/I/item.jpg");
  for (const rejected of [
    "http://target.scene7.com/is/image/Target/item",
    "https://target.scene7.com.evil.example/item.jpg",
    "data:image/png;base64,abc",
    "https://i5.walmartimages.com/seo/wrong-store.jpg"
  ]) {
    assert.equal(normalizeProductImageUrl(rejected, "target"), "");
  }

  assert.equal("imageUrl" in toAutomationProduct(product), false);
  assert.equal(toRendererProduct(product).imageUrl, normalizedImageUrl);
  assert.equal(
    preserveAdminCampaignFields([{ ...product }], [product])[0].imageUrl,
    normalizedImageUrl
  );
  assert.equal(validateEvent({
    eventType: "page-observed",
    retailer: "target",
    sku: product.sku,
    imageUrl
  }).imageUrl, normalizedImageUrl);

  const current = { automationEnabled: true, products: [{ ...product, imageUrl: "" }] };
  const next = { automationEnabled: true, products: [product] };
  assert.doesNotThrow(() => assertSafeArmedUpdate(current, next));
});

test("migrates the original Target-only settings", () => {
  const result = normalizeSettings({
    productUrl: PRODUCTS[0].productUrl,
    tcin: "1011960739",
    autoOpenCart: false,
    companionToken: "legacy-token"
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].id, "target:1011960739");
  assert.equal(result.products[0].action, "cart");
  assert.equal(result.companionToken, "legacy-token");
});

test("rejects unsafe or ambiguous product settings", () => {
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], retailer: "amazon" }), /does not match/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], quantity: 0 }), /Quantity/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], maxPrice: -1 }), /Maximum unit price/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], action: "buy-now" }), /Add to cart/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], fulfillmentMode: "drone" }), /shipping, pickup/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[0], signalEntry: "amazon-atc" }), /require an Amazon/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[2], action: "watch", signalEntry: "amazon-atc" }), /requires an Add to cart/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[2], action: "cart", signalEntry: "amazon-buy-now" }), /requires a checkout-review/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[1], signalEntry: "amazon-buy-now" }), /require an Amazon/);
  assert.throws(() => normalizeProduct({ ...PRODUCTS[1], signalEntry: "walmart-buy-now" }), /requires a checkout-review/);
  assert.equal(normalizeProduct({
    ...PRODUCTS[1],
    action: "review",
    maxOrderTotal: 75,
    signalEntry: "walmart-buy-now"
  }).signalEntry, "walmart-buy-now");
  assert.throws(
    () => normalizeSettings({ products: [PRODUCTS[0], PRODUCTS[0]] }),
    /appears more than once/
  );
  assert.throws(() => normalizeSettings({ products: PRODUCTS, retryIntervalSeconds: 1 }), /Retry interval/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, eligibilityRefreshIntervalSeconds: 1 }), /Pre-eligibility refresh interval/);
  assert.throws(
    () => normalizeSettings({
      products: PRODUCTS,
      eligibilityRefreshIntervalSeconds: 30,
      storeNavigationIntervalSeconds: 20
    }),
    /cannot exceed/
  );
  assert.throws(() => normalizeSettings({ products: PRODUCTS, storeNavigationIntervalSeconds: 1 }), /navigation interval/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, overloadCooldownSeconds: 1 }), /Overload cooldown/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, watcherIntervalSeconds: 10 }), /Watcher interval/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, blitzRetryDelayMs: 100 }), /Blitz retry delay/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, blitzWindowSeconds: 2 }), /Blitz persistence window/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, scheduledRetailer: "other" }), /single schedule/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, discordEnabled: true }), /Discord channel ID/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, discordChannelId: "not-a-channel" }), /valid Discord channel ID/);
  assert.throws(
    () => normalizeSettings({ products: PRODUCTS, scheduledOpenEnabled: true, scheduledRetailer: "amazon" }),
    /date and time/
  );
  const repairedMissingTotal = normalizeSettings({
    products: [{ ...PRODUCTS[0], action: "review", maxOrderTotal: 0 }],
    automationEnabled: true
  });
  assert.equal(repairedMissingTotal.products[0].maxOrderTotal, 141.98);
  const customAllowance = normalizeSettings({
    products: [{ ...PRODUCTS[0], action: "review", maxOrderTotal: 50 }],
    storeOrderAllowances: { target: 22.02 },
    automationEnabled: true
  });
  assert.equal(customAllowance.products[0].maxOrderTotal, 134);
  const customTax = normalizeSettings({
    products: [{ ...PRODUCTS[0], action: "review" }],
    orderTaxPercent: 8.25,
    automationEnabled: true
  });
  assert.equal(customTax.products[0].maxOrderTotal, 138.23);
  assert.throws(
    () => normalizeSettings({ products: PRODUCTS, orderTaxPercent: -0.01 }),
    /tax percentage/
  );
  assert.throws(
    () => normalizeSettings({ products: PRODUCTS, storeOrderAllowances: { walmart: -1 } }),
    /Walmart order-total allowance/
  );
  assert.equal(normalizeSettings({ products: [] }).products.length, 0);
  assert.throws(
    () => normalizeSettings({ products: [], automationEnabled: true }),
    /at least one product/
  );
  assert.throws(
    () => normalizeSettings({ products: [{ ...PRODUCTS[0], maxPrice: 0 }], automationEnabled: true }),
    /positive maximum unit price/
  );
  assert.throws(
    () => normalizeSettings({
      products: [{ ...PRODUCTS[0], fulfillmentMode: "manual" }],
      automationEnabled: true
    }),
    /explicitly require shipping or pickup/
  );
  const liveVerifiedCheckout = normalizeSettings({
    products: [PRODUCTS[0]],
    automationEnabled: true
  });
  assert.equal(liveVerifiedCheckout.automationEnabled, true);
  assert.equal(liveVerifiedCheckout.products[0].checkoutEvidence, null);
});

test("review-only products are supported and armed product edits require disarming", () => {
  const review = normalizeProduct({ ...PRODUCTS[0], action: "review" });
  assert.equal(review.action, "review");

  const armed = normalizeSettings({ products: [{ ...PRODUCTS[0], action: "review" }], automationEnabled: true });
  const changed = normalizeSettings({
    products: [{ ...PRODUCTS[0], action: "review", maxPrice: PRODUCTS[0].maxPrice + 1 }],
    automationEnabled: true
  }, armed);
  assert.throws(() => assertSafeArmedUpdate(armed, changed), /Disarm automation/);
  assert.doesNotThrow(() => assertSafeArmedUpdate(armed, { ...changed, automationEnabled: false }));

  const metadataChanged = normalizeSettings({
    products: [{
      ...PRODUCTS[0],
      action: "review",
      itemProfileId: "built-in:shipping-auto-buy",
      msrpRecordId: "msrp:pokemon-etb",
      priceSource: "approved-msrp"
    }],
    automationEnabled: true
  }, armed);
  assert.throws(() => assertSafeArmedUpdate(armed, metadataChanged), /Disarm automation/);

  const grouped = normalizeSettings({
    ...armed,
    missionGroups: [{ id: "group:launch", name: "Launch", collapsed: true }],
    products: armed.products.map((product) => ({ ...product, groupId: "group:launch" }))
  }, armed);
  assert.doesNotThrow(() => assertSafeArmedUpdate(armed, grouped));
});

test("returns store-aware cart and order links", () => {
  assert.equal(storeUrl("target", "cartUrl"), "https://www.target.com/cart");
  assert.equal(storeUrl("walmart", "ordersUrl"), "https://www.walmart.com/orders");
  assert.equal(storeUrl("amazon", "cartUrl"), "https://www.amazon.com/gp/cart/view.html");
});

test("volatile Walmart queue URLs normalize to the canonical product URL", () => {
  const qpdata = encodeURIComponent(JSON.stringify({
    queued: true,
    customMetadata: { state: "pending", item: { itemID: "123456789" } }
  }));
  const queueUrl = `https://www.walmart.com/qp?qpdata=${qpdata}&signature=discard-me`;
  assert.equal(parseWalmartQueue(queueUrl).itemId, "123456789");
  assert.equal(normalizeProductUrl(queueUrl), "https://www.walmart.com/ip/123456789");
});

test("validates and minimizes retailer companion events", () => {
  const event = validateEvent({
    eventType: "offer-observed",
    productId: "amazon:B0ABC12345",
    retailer: "amazon",
    sku: "b0abc12345",
    availability: "available",
    price: 12.499,
    seller: "  Amazon.com  ",
    firstParty: true,
    eligible: true,
    reason: "eligible",
    page: "https://www.amazon.com/dp/B0ABC12345?secret=value",
    timestamp: "2026-08-04T12:00:00.000Z",
    unexpected: "discarded"
  });

  assert.deepEqual(event, {
    eventType: "offer-observed",
    productId: "amazon:B0ABC12345",
    retailer: "amazon",
    sku: "B0ABC12345",
    availability: "available",
    cartCount: undefined,
    quantity: undefined,
    attempt: undefined,
    price: 12.5,
    orderTotal: undefined,
    cooldownUntil: undefined,
    seller: "Amazon.com",
    firstParty: true,
    eligible: true,
    reason: "eligible",
    message: "",
    page: "https://www.amazon.com/dp/B0ABC12345",
    timestamp: "2026-08-04T12:00:00.000Z"
  });
});

test("validates a global retailer overload signal without product data", () => {
  const cooldownUntil = Date.now() + 60_000;
  const event = validateEvent({
    eventType: "traffic-overload",
    retailer: "walmart",
    reason: "traffic-overload",
    cooldownUntil
  });
  assert.equal(event.productId, "");
  assert.equal(event.retailer, "walmart");
  assert.equal(event.cooldownUntil, cooldownUntil);
});

test("status reducers track global and per-product milestones", () => {
  const product = normalizeProduct(PRODUCTS[0]);
  let globalStatus = createInitialStatus();
  let productStatus = createProductStatus(product);
  const events = [
    validateEvent({ eventType: "offer-observed", productId: product.id, retailer: "target", sku: product.sku, price: 42, seller: "Target.com", firstParty: true, eligible: true, reason: "eligible" }),
    validateEvent({ eventType: "added-confirmed", productId: product.id, retailer: "target", sku: product.sku }),
    validateEvent({ eventType: "cart-item-confirmed", productId: product.id, retailer: "target", sku: product.sku }),
    validateEvent({ eventType: "checkout-reached", productId: product.id, retailer: "target", sku: product.sku }),
    validateEvent({ eventType: "order-confirmed", productId: product.id, retailer: "target", sku: product.sku, orderTotal: 108.42 })
  ];

  for (const event of events) {
    globalStatus = reduceStatus(globalStatus, event);
    productStatus = reduceProductStatus(productStatus, event);
  }

  assert.equal(globalStatus.companion, "connected");
  assert.equal(productStatus.observedPrice, 42);
  assert.equal(productStatus.firstParty, true);
  assert.equal(productStatus.cart, "confirmed");
  assert.equal(productStatus.checkout, "reached");
  assert.equal(productStatus.order, "confirmed");
  assert.equal(productStatus.observedOrderTotal, 108.42);
  assert.equal(matchingProduct([product], events[0]), product);
});

test("late delivery of an older observation cannot overwrite a newer safety stop", () => {
  const product = normalizeProduct(PRODUCTS[0]);
  const blocked = validateEvent({
    eventType: "automation-blocked",
    productId: product.id,
    retailer: "target",
    sku: product.sku,
    eligible: false,
    reason: "manual-action-required",
    message: "The cart could not be verified.",
    timestamp: "2026-08-15T20:00:02.000Z"
  });
  const olderQualified = validateEvent({
    eventType: "offer-observed",
    productId: product.id,
    retailer: "target",
    sku: product.sku,
    price: 42,
    seller: "Target.com",
    firstParty: true,
    eligible: true,
    reason: "eligible",
    timestamp: "2026-08-15T20:00:01.000Z"
  });

  const current = reduceProductStatus(createProductStatus(product), blocked);
  const unchanged = reduceProductStatus(current, olderQualified);
  assert.equal(unchanged.reason, "manual-action-required");
  assert.equal(unchanged.eligible, false);
  assert.equal(unchanged.lastMessage, "The cart could not be verified.");
});

test("accept partial quantity defaults on and survives normalization round-trips", () => {
  const defaulted = normalizeProduct({ ...PRODUCTS[0] });
  assert.equal(defaulted.acceptPartial, true);

  const strict = normalizeProduct({ ...PRODUCTS[0], acceptPartial: false });
  assert.equal(strict.acceptPartial, false);
  // Re-normalizing stored settings must not flip a deliberate strict choice.
  assert.equal(normalizeProduct(strict).acceptPartial, false);

  // The extension and renderer payloads both carry the flag.
  assert.equal(toAutomationProduct(strict).acceptPartial, false);
  assert.equal(toRendererProduct(strict).acceptPartial, false);
  assert.equal(toAutomationProduct(defaulted).acceptPartial, true);
});

test("partial-quantity cart events surface the companion's explanation", () => {
  const partialConfirm = validateEvent({
    eventType: "cart-item-confirmed",
    retailer: "target",
    sku: "1011960739",
    quantity: 1,
    message: "The exact Target product is in the cart with 1 of 2 (partial quantity accepted)."
  });
  assert.equal(partialConfirm.quantity, 1);
  assert.equal(
    eventMessage(partialConfirm),
    "The exact Target product is in the cart with 1 of 2 (partial quantity accepted)."
  );

  const fullConfirm = validateEvent({
    eventType: "cart-item-confirmed",
    retailer: "target",
    sku: "1011960739",
    quantity: 2
  });
  assert.equal(eventMessage(fullConfirm), "The exact Target product was confirmed in the cart.");

  const partialQuantity = validateEvent({
    eventType: "quantity-updated",
    retailer: "target",
    sku: "1011960739",
    quantity: 1,
    message: "Target allowed only 1 of the configured 2; partial quantity accepted."
  });
  assert.equal(eventMessage(partialQuantity), "Target allowed only 1 of the configured 2; partial quantity accepted.");
  const fullQuantity = validateEvent({
    eventType: "quantity-updated",
    retailer: "target",
    sku: "1011960739",
    quantity: 2
  });
  assert.equal(eventMessage(fullQuantity), "Target cart quantity was set to 2.");
});
