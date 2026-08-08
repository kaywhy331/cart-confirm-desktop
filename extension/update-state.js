"use strict";

(() => {
  function cleanVersion(value) {
    return String(value || "").trim().slice(0, 40);
  }

  function planVersionReload(input, appVersion, extensionVersion, now = Date.now()) {
    const target = cleanVersion(appVersion);
    const current = cleanVersion(extensionVersion);
    if (!target || !current || target === current) {
      return { reload: false, state: null };
    }

    const transition = `${current}->${target}`;
    if (input?.transition === transition) {
      return { reload: false, state: input };
    }
    return {
      reload: true,
      state: { transition, attemptedAt: now }
    };
  }

  const api = Object.freeze({ planVersionReload });
  globalThis.CartConfirmUpdateState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
