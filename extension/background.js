"use strict";

importScripts("traffic.js");

const Traffic = globalThis.CartConfirmTraffic;

const PORTS = [32191, 32192, 32193, 32194, 32195];
const CONFIG_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 1_500;
const CHECKOUT_LOCK_MS = 10 * 60_000;
const FAST_MODE_RULE_ID = 91001;
const AUTOMATION_STATE_KEY = "cartConfirmAutomationStateV2";
const TRAFFIC_STATE_KEY = "cartConfirmTrafficStateV1";
const FAST_MODE_PAUSE_KEY = "cartConfirmFastModePausedUntil";
const OVERLOAD_DEDUPE_MS = 5_000;
let cached = null;
let appliedFastMode = null;
let fastModePausedUntil = 0;
let automationStateQueue = Promise.resolve();
let trafficStateQueue = Promise.resolve();
let trafficSyncInFlight = false;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function setBadge(config) {
  if (!config) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const armed = Boolean(config.automationEnabled);
  await chrome.action.setBadgeText({ text: armed ? "ARM" : "IDLE" });
  await chrome.action.setBadgeBackgroundColor({ color: armed ? "#991b1b" : "#075985" });
  await chrome.action.setTitle({
    title: armed ? "Cart Confirm automation is armed" : "Cart Confirm is connected and disarmed"
  });
}

async function applyFastMode(enabled) {
  const stored = await chrome.storage.local.get(FAST_MODE_PAUSE_KEY);
  fastModePausedUntil = Math.max(fastModePausedUntil, Number(stored[FAST_MODE_PAUSE_KEY] || 0));
  const shouldEnable = Boolean(enabled) && Date.now() >= fastModePausedUntil;
  if (appliedFastMode === shouldEnable) return;
  const addRules = shouldEnable ? [{
    id: FAST_MODE_RULE_ID,
    priority: 1,
    action: { type: "block" },
    condition: {
      initiatorDomains: ["target.com", "walmart.com", "amazon.com"],
      resourceTypes: ["image", "font", "media"]
    }
  }] : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [FAST_MODE_RULE_ID],
    addRules
  });
  appliedFastMode = shouldEnable;
}

function publicConfig(config) {
  if (!config) return null;
  return {
    products: Array.isArray(config.products) ? config.products : [],
    automationEnabled: Boolean(config.automationEnabled),
    automationRunId: String(config.automationRunId || ""),
    fastMode: Boolean(config.fastMode),
    retryIntervalSeconds: Number(config.retryIntervalSeconds || 15),
    storeNavigationIntervalSeconds: Number(config.storeNavigationIntervalSeconds || 20),
    overloadCooldownSeconds: Number(config.overloadCooldownSeconds || 300),
    firstPartyOnly: true,
    configVersion: config.configVersion,
    appVersion: config.appVersion
  };
}

function retailerFromUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
    if (["target.com", "walmart.com", "amazon.com"].includes(host)) return host.split(".")[0];
  } catch {
    // Invalid URLs cannot contribute traffic state.
  }
  return "";
}

function emptyTrafficState(runId = "") {
  return { runId, retailers: {} };
}

async function readTrafficState(config = null) {
  const stored = await chrome.storage.local.get(TRAFFIC_STATE_KEY);
  const value = stored[TRAFFIC_STATE_KEY];
  const state = value && typeof value === "object" ? value : emptyTrafficState();
  state.retailers = state.retailers && typeof state.retailers === "object" ? state.retailers : {};

  const runId = String(config?.automationRunId || state.runId || "");
  if (config && state.runId !== runId) {
    for (const traffic of Object.values(state.retailers)) {
      if (traffic && typeof traffic === "object") traffic.reservations = {};
    }
    state.runId = runId;
  }
  return state;
}

async function writeTrafficState(state) {
  await chrome.storage.local.set({ [TRAFFIC_STATE_KEY]: state });
}

function withTrafficStateLock(action) {
  const task = trafficStateQueue.then(action, action);
  trafficStateQueue = task.catch(() => {});
  return task;
}

async function reserveNavigation(message, sender) {
  const config = await discoverConfig(true);
  if (!config?.automationEnabled) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, String(message.productId || ""));
  const retailer = String(message.retailer || "");
  if (!product || product.retailer !== retailer) return { ok: false, reason: "product-disabled" };
  const reservationId = String(message.reservationId || "").slice(0, 180);
  if (!reservationId) return { ok: false, reason: "invalid-reservation" };
  const ownerId = `tab:${sender?.tab?.id ?? "unknown"}`;

  return withTrafficStateLock(async () => {
    const state = await readTrafficState(config);
    const result = Traffic.reserveNavigationSlot(state.retailers[retailer], {
      now: Date.now(),
      notBefore: Number(message.notBefore || Date.now()),
      intervalMs: Number(config.storeNavigationIntervalSeconds || 20) * 1000,
      reservationId,
      ownerId,
      productId: product.id
    });
    state.retailers[retailer] = result.state;
    await writeTrafficState(state);
    return {
      ok: true,
      reservationId,
      allowedAt: result.allowedAt,
      waitMs: result.waitMs,
      cooldownUntil: result.state.cooldownUntil
    };
  });
}

async function revalidateNavigation(message, sender) {
  const config = await discoverConfig(true);
  if (!config?.automationEnabled) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, String(message.productId || ""));
  const retailer = String(message.retailer || "");
  if (!product || product.retailer !== retailer) return { ok: false, reason: "product-disabled" };
  const ownerId = `tab:${sender?.tab?.id ?? "unknown"}`;

  return withTrafficStateLock(async () => {
    const state = await readTrafficState(config);
    const result = Traffic.revalidateNavigationSlot(state.retailers[retailer], {
      now: Date.now(),
      reservationId: String(message.reservationId || ""),
      ownerId,
      productId: product.id
    });
    state.retailers[retailer] = result.state;
    await writeTrafficState(state);
    return {
      ok: result.allowed,
      reason: result.reason,
      waitMs: result.waitMs,
      cooldownUntil: result.state.cooldownUntil,
      lastStatus: result.state.lastStatus
    };
  });
}

async function recordOverload(retailer, status = 0, retryAfter = "") {
  if (!["target", "walmart", "amazon"].includes(retailer)) {
    return { ok: false, reason: "unsupported-retailer" };
  }
  const config = await discoverConfig(false);
  const outcome = await withTrafficStateLock(async () => {
    const state = await readTrafficState(config);
    const current = state.retailers[retailer] || {};
    const now = Date.now();
    if (
      current.lastSignalAt
      && now - current.lastSignalAt < OVERLOAD_DEDUPE_MS
      && (!status || current.lastStatus === status)
    ) {
      return { ok: true, deduped: true, cooldownUntil: current.cooldownUntil };
    }
    const result = Traffic.applyOverloadSignal(current, {
      now,
      defaultCooldownMs: Number(config?.overloadCooldownSeconds || 300) * 1000,
      retryAfterMs: Traffic.parseRetryAfter(retryAfter, now),
      status: Number(status || 0)
    });
    state.retailers[retailer] = result.state;
    await writeTrafficState(state);
    return {
      ok: true,
      cooldownUntil: result.cooldownUntil,
      cooldownMs: result.cooldownMs
    };
  });
  if (outcome.ok && !outcome.deduped) {
    await postEvent({
      eventType: "traffic-overload",
      retailer,
      reason: "traffic-overload",
      cooldownUntil: outcome.cooldownUntil,
      message: `${retailer} traffic cooldown activated.`,
      timestamp: new Date().toISOString()
    });
  }
  return outcome;
}

async function recordObservedNavigation(retailer, timestamp = Date.now()) {
  if (!["target", "walmart", "amazon"].includes(retailer)) return;
  const config = await discoverConfig(false);
  await withTrafficStateLock(async () => {
    const state = await readTrafficState(config);
    const current = state.retailers[retailer] && typeof state.retailers[retailer] === "object"
      ? state.retailers[retailer]
      : {};
    current.lastNavigationAt = Math.max(Number(current.lastNavigationAt || 0), Number(timestamp || 0));
    current.reservations ||= {};
    state.retailers[retailer] = current;
    await writeTrafficState(state);
  });
}

async function syncActiveTrafficCooldowns(config) {
  if (trafficSyncInFlight) return;
  trafficSyncInFlight = true;
  try {
    const state = await withTrafficStateLock(() => readTrafficState(config));
    const now = Date.now();
    for (const [retailer, traffic] of Object.entries(state.retailers)) {
      if (Number(traffic?.cooldownUntil || 0) <= now) continue;
      await postEvent({
        eventType: "traffic-overload",
        retailer,
        reason: "traffic-overload",
        cooldownUntil: traffic.cooldownUntil,
        message: `${retailer} traffic cooldown remains active.`,
        timestamp: new Date().toISOString()
      });
    }
  } finally {
    trafficSyncInFlight = false;
  }
}

async function discoverConfig(force = false) {
  if (!force && cached && Date.now() - cached.fetchedAt < CONFIG_TTL_MS) return cached;

  for (const port of PORTS) {
    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      const response = await fetchWithTimeout(`${baseUrl}/config`);
      if (!response.ok) continue;
      const config = await response.json();
      if (!config.token || !Array.isArray(config.products)) continue;
      cached = { ...config, baseUrl, fetchedAt: Date.now() };
      await setBadge(cached);
      await applyFastMode(cached.fastMode).catch(() => {});
      void syncActiveTrafficCooldowns(cached).catch(() => {});
      return cached;
    } catch {
      // Try the next local port.
    }
  }

  cached = null;
  await setBadge(null);
  return null;
}

async function postEvent(payload) {
  let config = await discoverConfig(false);
  if (!config) return { ok: false, reason: "desktop-not-found" };

  const send = () => fetchWithTimeout(`${config.baseUrl}/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify(payload)
  });

  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }
    return { ok: response.ok, ...result };
  } catch {
    cached = null;
    await setBadge(null);
    return { ok: false, reason: "desktop-unreachable" };
  }
}

function productSignature(config, product) {
  return [
    config.automationRunId || "run",
    product.id,
    product.maxPrice,
    product.maxOrderTotal,
    product.quantity,
    product.action
  ].join("|");
}

async function readAutomationState(config) {
  const stored = await chrome.storage.local.get(AUTOMATION_STATE_KEY);
  let state = stored[AUTOMATION_STATE_KEY];
  const runId = String(config.automationRunId || "");
  if (!state || state.runId !== runId) {
    state = { runId, locks: {}, completed: {} };
  }

  const now = Date.now();
  for (const [retailer, lock] of Object.entries(state.locks || {})) {
    if (!lock || lock.expiresAt <= now) delete state.locks[retailer];
  }
  state.locks ||= {};
  state.completed ||= {};
  return state;
}

async function writeAutomationState(state) {
  await chrome.storage.local.set({ [AUTOMATION_STATE_KEY]: state });
}

function withAutomationStateLock(action) {
  const task = automationStateQueue.then(action, action);
  automationStateQueue = task.catch(() => {});
  return task;
}

function configuredProduct(config, productId) {
  return config.products.find((product) => product.id === productId && product.enabled) || null;
}

function lockKey(product) {
  return product.action === "checkout" ? `store:${product.retailer}` : `product:${product.id}`;
}

async function claimProduct(productId, ownerId) {
  const config = await discoverConfig(true);
  if (!config?.automationEnabled) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const signature = productSignature(config, product);
    if (state.completed[signature]) return { ok: false, reason: "completed" };

    const key = lockKey(product);
    const lock = state.locks[key];
    if (lock && lock.ownerId !== ownerId) {
      return {
        ok: false,
        reason: product.action === "checkout" ? "store-busy" : "product-busy",
        activeProductId: lock.productId
      };
    }
    state.locks[key] = {
      productId: product.id,
      ownerId,
      expiresAt: Date.now() + CHECKOUT_LOCK_MS
    };
    await writeAutomationState(state);

    return { ok: true, product, signature };
  });
}

async function getProductState(productId) {
  const config = await discoverConfig(false);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  const state = await readAutomationState(config);
  return {
    ok: true,
    armed: Boolean(config.automationEnabled),
    completed: Boolean(state.completed[productSignature(config, product)]),
    lock: state.locks[lockKey(product)] || null
  };
}

async function completeProduct(productId) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    state.completed[productSignature(config, product)] = new Date().toISOString();
    for (const [key, lock] of Object.entries(state.locks)) {
      if (lock?.productId === product.id) delete state.locks[key];
    }
    await writeAutomationState(state);
    return { ok: true };
  });
}

async function pauseFastModeForChallenge() {
  fastModePausedUntil = Date.now() + 10 * 60_000;
  await chrome.storage.local.set({ [FAST_MODE_PAUSE_KEY]: fastModePausedUntil });
  await applyFastMode(false);
  return { ok: true, pausedUntil: fastModePausedUntil };
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== "object") return { ok: false, reason: "invalid-message" };
  switch (message.type) {
    case "CART_CONFIRM_GET_CONFIG": {
      const config = await discoverConfig(Boolean(message.force));
      return { ok: Boolean(config), config: publicConfig(config) };
    }
    case "CART_CONFIRM_EVENT":
      return postEvent(message.payload);
    case "CART_CONFIRM_CLAIM_PRODUCT":
      return claimProduct(String(message.productId || ""), `tab:${sender?.tab?.id ?? "unknown"}`);
    case "CART_CONFIRM_PRODUCT_STATE":
      return getProductState(String(message.productId || ""));
    case "CART_CONFIRM_COMPLETE_PRODUCT":
      return completeProduct(String(message.productId || ""));
    case "CART_CONFIRM_SECURITY_CHALLENGE":
      return pauseFastModeForChallenge();
    case "CART_CONFIRM_RESERVE_NAVIGATION":
      return reserveNavigation(message, sender);
    case "CART_CONFIRM_REVALIDATE_NAVIGATION":
      return revalidateNavigation(message, sender);
    case "CART_CONFIRM_TRAFFIC_OVERLOAD":
      return recordOverload(String(message.retailer || ""), Number(message.status || 0), message.retryAfter);
    default:
      return { ok: false, reason: "unsupported-message" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, reason: error.message || "background-error" }));
  return true;
});

chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (!Traffic.isOverloadStatus(details.statusCode)) return;
  const retailer = retailerFromUrl(details.url);
  if (!retailer) return;
  const retryAfter = (details.responseHeaders || [])
    .find((header) => String(header.name || "").toLowerCase() === "retry-after")?.value || "";
  void recordOverload(retailer, details.statusCode, retryAfter).catch(() => {});
}, {
  urls: [
    "https://*.target.com/*",
    "https://*.walmart.com/*",
    "https://*.amazon.com/*"
  ],
  types: ["main_frame", "xmlhttprequest"]
}, ["responseHeaders", "extraHeaders"]);

chrome.webRequest.onBeforeRequest.addListener((details) => {
  const retailer = retailerFromUrl(details.url);
  if (retailer) void recordObservedNavigation(retailer, details.timeStamp || Date.now()).catch(() => {});
}, {
  urls: [
    "https://*.target.com/*",
    "https://*.walmart.com/*",
    "https://*.amazon.com/*"
  ],
  types: ["main_frame"]
});

chrome.runtime.onInstalled.addListener(() => {
  appliedFastMode = null;
  void discoverConfig(true);
});
