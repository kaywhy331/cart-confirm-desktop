"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInitialStatus,
  createProductStatus,
  extractTcin,
  matchingProduct,
  normalizeProduct,
  normalizeSettings,
  normalizeTargetUrl,
  reduceProductStatus,
  reduceStatus,
  validateEvent
} = require("../lib/core");
const {
  detectRetailer,
  extractSku,
  normalizeProductUrl,
  storeUrl
} = require("../lib/retailers");

const PRODUCTS = [
  {
    productUrl: "https://www.target.com/p/name/-/A-1011960739?ref=tracking",
    sku: "1011960739",
    maxPrice: 49.99,
    quantity: 2,
    action: "checkout"
  },
  {
    productUrl: "https://www.walmart.com/ip/example/123456789?athbdg=L1100",
    sku: "123456789",
    maxPrice: 25,
    quantity: 3,
    action: "cart"
  },
  {
    productUrl: "https://www.amazon.com/Example/dp/B0ABC12345/ref=abc",
    sku: "B0ABC12345",
    maxPrice: 12.5,
    quantity: 1,
    action: "checkout"
  }
];

test("extracts store-specific product identifiers", () => {
  assert.equal(extractTcin(PRODUCTS[0].productUrl), "1011960739");
  assert.equal(extractSku("walmart", PRODUCTS[1].productUrl), "123456789");
  assert.equal(extractSku("amazon", PRODUCTS[2].productUrl), "B0ABC12345");
  assert.equal(extractSku("amazon", "b0abc12345"), "B0ABC12345");
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
  const existing = normalizeSettings({ products: PRODUCTS, companionToken: "existing-token" });
  const result = normalizeSettings({
    products: PRODUCTS,
    automationEnabled: true,
    fastMode: false,
    retryIntervalSeconds: 8,
    scheduledRetailer: "amazon"
  }, existing);

  assert.equal(result.products.length, 3);
  assert.equal(result.products[1].id, "walmart:123456789");
  assert.equal(result.products[2].productUrl, "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(result.products[0].quantity, 2);
  assert.equal(result.companionToken, "existing-token");
  assert.equal(result.automationEnabled, true);
  assert.equal(result.fastMode, false);
  assert.equal(result.scheduledRetailer, "amazon");
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
  assert.throws(
    () => normalizeSettings({ products: [PRODUCTS[0], PRODUCTS[0]] }),
    /appears more than once/
  );
  assert.throws(() => normalizeSettings({ products: PRODUCTS, retryIntervalSeconds: 1 }), /Retry interval/);
  assert.throws(() => normalizeSettings({ products: PRODUCTS, scheduledRetailer: "other" }), /single schedule/);
  assert.throws(
    () => normalizeSettings({ products: PRODUCTS, scheduledOpenEnabled: true, scheduledRetailer: "amazon" }),
    /date and time/
  );
  assert.throws(() => normalizeSettings({ products: [] }), /at least one product/);
  assert.throws(
    () => normalizeSettings({ products: [{ ...PRODUCTS[0], maxPrice: 0 }], automationEnabled: true }),
    /positive maximum unit price/
  );
});

test("returns store-aware cart and order links", () => {
  assert.equal(storeUrl("target", "cartUrl"), "https://www.target.com/cart");
  assert.equal(storeUrl("walmart", "ordersUrl"), "https://www.walmart.com/orders");
  assert.equal(storeUrl("amazon", "cartUrl"), "https://www.amazon.com/gp/cart/view.html");
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
    seller: "Amazon.com",
    firstParty: true,
    eligible: true,
    reason: "eligible",
    message: "",
    page: "https://www.amazon.com/dp/B0ABC12345",
    timestamp: "2026-08-04T12:00:00.000Z"
  });
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
    validateEvent({ eventType: "order-confirmed", productId: product.id, retailer: "target", sku: product.sku })
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
  assert.equal(matchingProduct([product], events[0]), product);
});
