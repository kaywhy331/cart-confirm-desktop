"use strict";

const PORTS = [32191, 32192, 32193, 32194, 32195];
const CONFIG_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 1_500;
const CHECKOUT_LOCK_MS = 10 * 60_000;
const FAST_MODE_RULE_ID = 91001;
const AUTOMATION_STATE_KEY = "cartConfirmAutomationStateV2";
const FAST_MODE_PAUSE_KEY = "cartConfirmFastModePausedUntil";
let cached = null;
let appliedFastMode = null;
let fastModePausedUntil = 0;
let automationStateQueue = Promise.resolve();

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
    firstPartyOnly: true,
    configVersion: config.configVersion,
    appVersion: config.appVersion
  };
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

chrome.runtime.onInstalled.addListener(() => {
  appliedFastMode = null;
  void discoverConfig(true);
});
