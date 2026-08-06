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

module.exports = { SCHEDULE_GRACE_MS, evaluateSchedule, scheduleKey };
