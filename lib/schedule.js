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

function productCalendarTime(settings = {}, product = {}) {
  const productTime = String(product?.openAt || "").trim();
  if (productTime) return productTime;
  if (
    settings.scheduledOpenEnabled
    && settings.scheduledOpenAt
    && settings.scheduledRetailer === product?.retailer
  ) {
    return String(settings.scheduledOpenAt);
  }
  return "";
}

function productCalendarOwned(settings = {}, product = {}) {
  return Boolean(productCalendarTime(settings, product));
}

function assertNoNewPastProductSchedules(nextProducts = [], currentProducts = [], now = Date.now()) {
  const currentById = new Map((currentProducts || []).map((product) => [product?.id, product]));
  for (const product of nextProducts || []) {
    if (!product?.openAt) continue;
    const targetTime = new Date(product.openAt).getTime();
    const unchanged = String(currentById.get(product.id)?.openAt || "") === String(product.openAt);
    if (Number.isFinite(targetTime) && targetTime <= now && !unchanged) {
      throw new Error(`Choose a future opening time for ${product.title || product.sku}.`);
    }
  }
}

// Manual/Test/Autopilot-start sweeps launch every enabled mission except
// missions owned by a calendar schedule. Scheduled missions are left for the
// exactly-once scheduler, even when their time is only a moment away, so an
// immediate sweep and the scheduler can never open the same mission twice.
function planImmediateProductOpenings(settings = {}, retailer = "") {
  const enabled = (settings.products || []).filter((product) => (
    product?.enabled && (!retailer || product.retailer === retailer)
  ));
  const scheduled = [];
  const ready = [];
  for (const product of enabled) {
    (productCalendarOwned(settings, product) ? scheduled : ready).push(product);
  }
  return { enabled, ready, scheduled };
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
  assertNoNewPastProductSchedules,
  evaluateProductSchedules,
  evaluateSchedule,
  planImmediateProductOpenings,
  productCalendarOwned,
  productCalendarTime,
  productScheduleKey,
  scheduleKey
};
