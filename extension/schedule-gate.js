"use strict";

(() => {
  function calendarOpenAt(product = {}) {
    return String(product.calendarOpenAt || product.openAt || "").trim();
  }

  function calendarOwned(product = {}) {
    return product.calendarOwned === true || Boolean(calendarOpenAt(product));
  }

  function waitingMessage(product = {}, storeLabel = "Store", now = Date.now()) {
    const openAt = calendarOpenAt(product);
    const targetTime = new Date(openAt).getTime();
    if (Number.isFinite(targetTime) && targetTime > now) {
      return `${storeLabel} mission is scheduled for ${new Date(targetTime).toLocaleString()}. This tab is idle until the desktop releases it at that calendar time.`;
    }
    return `${storeLabel} mission still has calendar ownership. This tab is idle so Cart Confirm cannot run early or late; clear or reschedule the time in the app if it was missed.`;
  }

  const api = Object.freeze({ calendarOpenAt, calendarOwned, waitingMessage });
  globalThis.CartConfirmScheduleGate = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
