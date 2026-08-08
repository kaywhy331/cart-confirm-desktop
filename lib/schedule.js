"use strict";

const SCHEDULE_GRACE_MS = 2 * 60_000;
const CONSUMED_SCHEDULE_STATES = new Set(["firing", "fired", "missed"]);

function scheduleKey(settings = {}) {
  if (!settings.scheduledOpenEnabled || !settings.scheduledOpenAt || !settings.scheduledRetailer) return "";
  const productIds = (settings.products || [])
    .filter((product) => product.enabled && product.retailer === settings.scheduledRetailer)
    .map((product) => product.id)
    .sort();
  if (!productIds.length) return "";
  return `${settings.scheduledRetailer}|${settings.scheduledOpenAt}|${productIds.join(",")}`;
}

function evaluateSchedule(settings, receipt = null, now = Date.now()) {
  const key = scheduleKey(settings);
  if (!key) return { action: "idle", key: "", targetTime: 0 };

  const targetTime = new Date(settings.scheduledOpenAt).getTime();
  if (!Number.isFinite(targetTime)) return { action: "invalid", key, targetTime: 0 };
  if (receipt?.key === key && CONSUMED_SCHEDULE_STATES.has(receipt.status)) {
    return { action: "consumed", key, targetTime };
  }
  if (now < targetTime) return { action: "wait", key, targetTime };
  if (now - targetTime > SCHEDULE_GRACE_MS) return { action: "missed", key, targetTime };
  return { action: "fire", key, targetTime };
}

function productScheduleKey(product) {
  return product?.openAt ? `${product.id}|${product.openAt}` : "";
}

// Per-product scheduled openings. Each due product yields exactly one action;
// receipts make firing exactly-once, and anything past the grace window is
// marked missed instead of running late.
function evaluateProductSchedules(products = [], receipts = {}, now = Date.now()) {
  const actions = [];
  for (const product of products) {
    if (!product?.enabled) continue;
    const key = productScheduleKey(product);
    if (!key) continue;
    const targetTime = new Date(product.openAt).getTime();
    if (!Number.isFinite(targetTime)) continue;
    const receipt = receipts?.[key];
    if (receipt && CONSUMED_SCHEDULE_STATES.has(receipt.status)) continue;
    if (now < targetTime) continue;
    actions.push({
      productId: product.id,
      key,
      targetTime,
      action: now - targetTime > SCHEDULE_GRACE_MS ? "missed" : "fire"
    });
  }
  return actions;
}

module.exports = {
  SCHEDULE_GRACE_MS,
  evaluateProductSchedules,
  evaluateSchedule,
  productScheduleKey,
  scheduleKey
};
