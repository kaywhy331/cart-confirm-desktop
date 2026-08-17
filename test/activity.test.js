"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createActivityEvent,
  notificationDeliveryMode,
  shouldRecordActivity
} = require("../lib/activity");

const base = {
  productId: "target:95298172",
  retailer: "target",
  sku: "95298172",
  page: "https://www.target.com/p/item/-/A-95298172"
};
const product = {
  id: base.productId,
  title: "Riftbound Zed vs Shen",
  sku: base.sku,
  quantity: 2
};

function activity(event, overrides = {}) {
  return createActivityEvent({ ...base, ...event }, {
    automationEnabled: true,
    product,
    runId: "run-1",
    ...overrides
  });
}

test("the activity feed retains only operator-facing milestones", () => {
  for (const eventType of [
    "availability",
    "automation-status",
    "retry-scheduled",
    "automation-blocked",
    "store-error",
    "traffic-overload",
    "add-clicked",
    "quantity-updated",
    "checkout-clicked",
    "checkout-reached",
    "review-ready"
  ]) {
    assert.equal(activity({ eventType }), null, eventType);
  }
  assert.equal(activity({ eventType: "offer-observed", eligible: false }), null);
  assert.equal(activity({ eventType: "page-observed" }, { automationEnabled: false }), null);

  assert.equal(activity({ eventType: "page-observed" }).eventType, "watch-started");
  assert.equal(activity({ eventType: "offer-observed", eligible: true }).eventType, "offer-observed");
  assert.equal(activity({ eventType: "cart-reached" }).eventType, "cart-reached");
  assert.equal(activity({ eventType: "cart-item-confirmed" }).eventType, "cart-item-confirmed");
  assert.equal(activity({ eventType: "order-confirmed" }).eventType, "order-confirmed");
  assert.equal(activity({ eventType: "notification-sent" }).eventType, "notification-sent");
});

test("milestone entries use concise product, quantity, price, and order language", () => {
  assert.equal(
    activity({ eventType: "page-observed" }).message,
    "Started watching Riftbound Zed vs Shen."
  );
  assert.equal(
    activity({ eventType: "offer-observed", eligible: true, price: 34.99 }).message,
    "Qualified Riftbound Zed vs Shen: the exact first-party offer at $34.99 matched the mission criteria."
  );
  assert.equal(
    activity({ eventType: "cart-reached" }).message,
    "Cart page is open with Riftbound Zed vs Shen — be ready to complete the purchase."
  );
  assert.equal(
    activity({ eventType: "cart-item-confirmed", quantity: 2 }).message,
    "Added 2 × Riftbound Zed vs Shen to cart."
  );
  assert.equal(
    activity({ eventType: "order-confirmed", quantity: 2, orderTotal: 69.98 }).message,
    "Ordered 2 × Riftbound Zed vs Shen; the store confirmed a $69.98 total."
  );
});

test("each milestone records once per mission run and returns on a new run", () => {
  const first = activity({ eventType: "offer-observed", eligible: true, price: 34.99 });
  assert.equal(shouldRecordActivity([], first), true);
  assert.equal(shouldRecordActivity([first], activity({
    eventType: "offer-observed",
    eligible: true,
    price: 35.99
  })), false);
  assert.equal(shouldRecordActivity([first], activity({
    eventType: "offer-observed",
    eligible: true,
    price: 35.99
  }, { runId: "run-2" })), true);
  assert.equal(shouldRecordActivity([first], { ...base, eventType: "offer-observed", eligible: false }), false);
});

test("notification entries deduplicate by notification purpose", () => {
  const first = activity({
    eventType: "notification-sent",
    notificationKey: "eligible",
    message: "Notified: Target offer is eligible."
  });
  assert.equal(shouldRecordActivity([], first), true);
  assert.equal(shouldRecordActivity([first], { ...first, timestamp: new Date().toISOString() }), false);
  assert.equal(shouldRecordActivity([first], {
    ...first,
    notificationKey: "cart-confirmed",
    message: "Notified: Target cart confirmed."
  }), true);
});

test("silent missions retain an Activity-only safety notification", () => {
  assert.equal(notificationDeliveryMode("standard", "automation-blocked"), "desktop");
  assert.equal(notificationDeliveryMode("alarm", "automation-blocked"), "desktop");
  assert.equal(notificationDeliveryMode("silent", "offer-observed"), "none");
  assert.equal(notificationDeliveryMode("silent", "automation-blocked"), "activity");
});
