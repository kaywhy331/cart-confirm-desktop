"use strict";

importScripts(
  "traffic.js",
  "schedule-gate.js",
  "automation-state.js",
  "retailers.js",
  "offer-policy.js",
  "trackalacker-links.js",
  "trackalacker-push.js",
  "tab-context.js",
  "open-request-tabs.js",
  "update-state.js"
);

const Traffic = globalThis.CartConfirmTraffic;
const Retailers = globalThis.CartConfirmRetailers;
const OfferPolicy = globalThis.CartConfirmOfferPolicy;
const TrackalackerLinks = globalThis.CartConfirmTrackalackerLinks;
const TrackalackerPush = globalThis.CartConfirmTrackalackerPush;
const ScheduleGate = globalThis.CartConfirmScheduleGate;
const AutomationState = globalThis.CartConfirmAutomationState;
const TabContext = globalThis.CartConfirmTabContext;
const OpenRequestTabs = globalThis.CartConfirmOpenRequestTabs;
const UpdateState = globalThis.CartConfirmUpdateState;

const PORTS = [32191, 32192, 32193, 32194, 32195];
const CONFIG_TTL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 1_500;
const FAST_MODE_RULE_ID = 91001;
const AUTOMATION_STATE_KEY = "cartConfirmAutomationStateV3";
const TRAFFIC_STATE_KEY = "cartConfirmTrafficStateV1";
const FAST_MODE_PAUSE_KEY = "cartConfirmFastModePausedUntil";
const PAIRED_TOKEN_KEY = "cartConfirmPairedDesktopTokenV1";
const VERSION_RELOAD_STATE_KEY = "cartConfirmVersionReloadStateV1";
const TAB_PRODUCT_CONTEXT_KEY = "cartConfirmTabProductContextV1";
const TRACKALACKER_PUSH_STATE_KEY = "cartConfirmTrackalackerPushStateV1";
const TRACKALACKER_PUSH_QUEUE_KEY = "cartConfirmTrackalackerPushQueueV1";
const TRACKALACKER_PUSH_QUEUE_LIMIT = 50;
const TRACKALACKER_FOLLOWED_URL = "https://www.trackalacker.com/products/followed";
const TRACKALACKER_NOTIFICATION_SETTINGS_URL = "https://www.trackalacker.com/users/settings/notifications/edit";
const TRACKALACKER_DEVICE_NICKNAME = "Desktop - Windows - Chrome";
const TRACKALACKER_TAB_PATTERNS = Object.freeze([
  "https://trackalacker.com/*",
  "https://www.trackalacker.com/*"
]);
// One authorized click can fan out into several commerce XHRs. Treat their
// overload responses as one incident instead of exponentially extending the
// cooldown for every response in the same burst.
const OVERLOAD_DEDUPE_MS = 30_000;
let cached = null;
let appliedFastMode = null;
let fastModePausedUntil = 0;
let automationStateQueue = Promise.resolve();
let trafficStateQueue = Promise.resolve();
let tabContextQueue = Promise.resolve();
let trafficSyncInFlight = false;
const recentAuthorizedStoreActions = new Map();
let trackalackerImportOwner = null;
let trackalackerPushEnrollmentInFlight = null;
let trackalackerPushDrainInFlight = null;
let trackalackerPushStateQueue = Promise.resolve();
let trackalackerPushQueueQueue = Promise.resolve();
let trackalackerPushConfigQueue = Promise.resolve();
let lastTrackalackerPushStatusSignature = "";
let lastTrackalackerPushStatusAt = 0;
let lastOpenedTrackalackerEnrollmentNonce = "";
let activeTrackalackerEnrollmentNonce = "";
let lastOpenedTrackalackerImportId = "";
let trackalackerPageOpenQueue = Promise.resolve();
const pendingTrackalackerPageRequests = new Map();

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Chrome omits the Origin header on host-permitted GETs, so every request
  // carries the extension id explicitly; the desktop accepts origin-less
  // loopback requests only when this header matches its pinned id.
  const headers = { ...(options.headers || {}), "X-Cart-Assist-Extension": chrome.runtime.id };
  try {
    return await fetch(url, { ...options, headers, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTrackalackerPushState(value = {}) {
  const allowedStates = new Set([
    "disabled",
    "awaiting-page",
    "subscribing",
    "registering",
    "ready",
    "error"
  ]);
  const state = allowedStates.has(String(value.state || "")) ? String(value.state) : "disabled";
  const allowedErrors = new Set([
    "",
    "push-api-unavailable",
    "push-subscription-read-failed",
    "subscription-key-mismatch",
    "push-subscribe-failed",
    "push-enrollment-failed",
    "missing-subscription",
    "incomplete-subscription",
    "subscription-fingerprint-failed",
    "page-bridge-failed",
    "network-error",
    "http-error",
    "notification-display-failed",
    "push-payload-unreadable",
    "signal-delivery-rejected",
    "signal-delivery-http",
    "desktop-unreachable"
  ]);
  const errorCode = String(value.errorCode || "");
  return {
    enabled: value.enabled === true,
    deliveryPaused: value.deliveryPaused === true,
    state,
    ready: value.ready === true,
    subscriptionPresent: value.subscriptionPresent === true,
    registeredFingerprint: /^[a-f0-9]{64}$/.test(String(value.registeredFingerprint || ""))
      ? String(value.registeredFingerprint)
      : "",
    lastHttpStatus: Math.max(0, Math.min(599, Number(value.lastHttpStatus) || 0)),
    errorCode: allowedErrors.has(errorCode) ? errorCode : "",
    lastRegistrationAt: String(value.lastRegistrationAt || "").slice(0, 40),
    lastNotificationAt: String(value.lastNotificationAt || "").slice(0, 40),
    lastDeliveryAt: String(value.lastDeliveryAt || "").slice(0, 40),
    updatedAt: String(value.updatedAt || "").slice(0, 40)
  };
}

async function readTrackalackerPushState() {
  const stored = await chrome.storage.local.get(TRACKALACKER_PUSH_STATE_KEY);
  return normalizeTrackalackerPushState(stored[TRACKALACKER_PUSH_STATE_KEY]);
}

function updateTrackalackerPushState(changes = {}) {
  const task = trackalackerPushStateQueue.then(async () => {
    const current = await readTrackalackerPushState();
    const proposed = normalizeTrackalackerPushState({
      ...current,
      ...changes,
      updatedAt: current.updatedAt
    });
    if (JSON.stringify(proposed) === JSON.stringify(current)) return current;
    const next = { ...proposed, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [TRACKALACKER_PUSH_STATE_KEY]: next });
    return next;
  });
  trackalackerPushStateQueue = task.catch(() => {});
  return task;
}

function normalizeTrackalackerPushQueue(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const entry of value.slice(-TRACKALACKER_PUSH_QUEUE_LIMIT)) {
    if (!entry || typeof entry !== "object" || entry.source?.transport !== "chrome_extension_web_push") continue;
    const sanitized = TrackalackerPush.signalEnvelopeFromPush({
      title: entry.notification?.title,
      body: entry.notification?.body
    }, entry.signalId, entry.source?.receivedAt, chrome.runtime.id);
    if (sanitized) output.push(sanitized);
  }
  return output;
}

async function readTrackalackerPushQueue() {
  const stored = await chrome.storage.local.get(TRACKALACKER_PUSH_QUEUE_KEY);
  return normalizeTrackalackerPushQueue(stored[TRACKALACKER_PUSH_QUEUE_KEY]);
}

function mutateTrackalackerPushQueue(mutator) {
  const task = trackalackerPushQueueQueue.then(async () => {
    const current = await readTrackalackerPushQueue();
    const next = normalizeTrackalackerPushQueue(mutator(current));
    await chrome.storage.local.set({ [TRACKALACKER_PUSH_QUEUE_KEY]: next });
    return next;
  });
  trackalackerPushQueueQueue = task.catch(() => {});
  return task;
}

async function enqueueTrackalackerPush(envelope) {
  return mutateTrackalackerPushQueue((current) => (
    current.some((entry) => entry.signalId === envelope.signalId)
      ? current
      : [...current, envelope]
  ));
}

async function removeQueuedTrackalackerPush(signalId) {
  return mutateTrackalackerPushQueue((current) => current.filter((entry) => entry.signalId !== signalId));
}

function publicTrackalackerPushStatus(state, pendingSignals, enrollmentNonce = "") {
  return {
    state: state.state,
    ready: state.ready,
    subscriptionPresent: state.subscriptionPresent,
    pendingSignals: Math.max(0, Math.min(TRACKALACKER_PUSH_QUEUE_LIMIT, Number(pendingSignals) || 0)),
    lastHttpStatus: state.lastHttpStatus,
    errorCode: state.errorCode,
    lastRegistrationAt: state.lastRegistrationAt,
    lastNotificationAt: state.lastNotificationAt,
    lastDeliveryAt: state.lastDeliveryAt,
    updatedAt: state.updatedAt,
    enrollmentNonce: String(enrollmentNonce || "").slice(0, 80)
  };
}

async function postTrackalackerPushStatus(config, state = null, options = {}) {
  if (!config?.baseUrl || !config?.token) return false;
  const current = state || await readTrackalackerPushState();
  const pending = await readTrackalackerPushQueue();
  const payload = publicTrackalackerPushStatus(
    current,
    pending.length,
    config?.trackalackerPush?.enrollmentNonce
  );
  const signature = JSON.stringify(payload);
  if (
    options.force !== true
    && signature === lastTrackalackerPushStatusSignature
    && Date.now() - lastTrackalackerPushStatusAt < 30_000
  ) return true;
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/trackalacker/push/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cart-Assist-Token": config.token
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return false;
    lastTrackalackerPushStatusSignature = signature;
    lastTrackalackerPushStatusAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

function requestTrackalackerPage(requestKey) {
  if (pendingTrackalackerPageRequests.has(requestKey)) {
    return pendingTrackalackerPageRequests.get(requestKey);
  }
  const task = trackalackerPageOpenQueue.then(async () => {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: TRACKALACKER_TAB_PATTERNS });
    } catch {
      tabs = [];
    }
    const existing = tabs.find((tab) => Number.isInteger(tab?.id));
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      return { opened: true, reused: true };
    }
    await chrome.tabs.create({ url: TRACKALACKER_FOLLOWED_URL, active: true });
    return { opened: true, reused: false };
  });
  trackalackerPageOpenQueue = task.catch(() => {});
  const tracked = task.finally(() => pendingTrackalackerPageRequests.delete(requestKey));
  pendingTrackalackerPageRequests.set(requestKey, tracked);
  return tracked;
}

function ensureTrackalackerEnrollmentPage(config) {
  const nonce = String(config?.trackalackerPush?.enrollmentNonce || "").slice(0, 80);
  if (!nonce || nonce === lastOpenedTrackalackerEnrollmentNonce) return Promise.resolve({ opened: false });
  return requestTrackalackerPage(`enrollment:${nonce}`).then((result) => {
    lastOpenedTrackalackerEnrollmentNonce = nonce;
    return result;
  });
}

function ensureTrackalackerImportPage(config) {
  const importId = String(config?.trackalackerImport?.id || "").slice(0, 80);
  if (!importId || importId === lastOpenedTrackalackerImportId) return Promise.resolve({ opened: false });
  return requestTrackalackerPage(`import:${importId}`).then((result) => {
    lastOpenedTrackalackerImportId = importId;
    return result;
  });
}

async function applyTrackalackerPushConfig(config) {
  const enabled = config?.trackalackerPush?.enabled === true;
  const deliveryPaused = config?.trackalackerPush?.deliveryPaused === true;
  const enrollmentNonce = String(config?.trackalackerPush?.enrollmentNonce || "").slice(0, 80);
  const explicitEnrollment = Boolean(enrollmentNonce);
  const newExplicitEnrollment = explicitEnrollment && enrollmentNonce !== activeTrackalackerEnrollmentNonce;
  activeTrackalackerEnrollmentNonce = explicitEnrollment ? enrollmentNonce : "";
  const current = await readTrackalackerPushState();
  const explicitState = !newExplicitEnrollment && ["subscribing", "registering", "error"].includes(current.state)
    ? current.state
    : "awaiting-page";
  const state = await updateTrackalackerPushState({
    enabled,
    deliveryPaused,
    state: enabled
      ? explicitEnrollment
        ? explicitState
        : current.ready && current.registeredFingerprint
          ? "ready"
          : current.state === "error" ? "error" : "awaiting-page"
      : "disabled",
    ready: enabled && !explicitEnrollment && current.ready && Boolean(current.registeredFingerprint),
    errorCode: enabled && (!explicitEnrollment || !newExplicitEnrollment) ? current.errorCode : "",
    lastHttpStatus: newExplicitEnrollment ? 0 : current.lastHttpStatus
  });
  if (enabled && explicitEnrollment) void ensureTrackalackerEnrollmentPage(config).catch(() => {});
  void postTrackalackerPushStatus(config, state).catch(() => {});
  if (enabled && !deliveryPaused) void drainTrackalackerPushQueue(config).catch(() => {});
  return state;
}

function syncTrackalackerPushConfig(config) {
  const task = trackalackerPushConfigQueue.then(() => applyTrackalackerPushConfig(config));
  trackalackerPushConfigQueue = task.catch(() => {});
  return task;
}

async function setBadge(config) {
  if (!config) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const armed = Boolean(config.automationEnabled);
  const signals = Boolean(config.signalsEnabled);
  const paused = Boolean(config.monitoringPaused);
  await chrome.action.setBadgeText({ text: signals ? "SIG" : armed ? "ARM" : paused ? "STOP" : "IDLE" });
  await chrome.action.setBadgeBackgroundColor({ color: signals ? "#6d28d9" : armed ? "#991b1b" : paused ? "#475569" : "#075985" });
  await chrome.action.setTitle({
    title: signals
      ? armed
        ? "Cart Confirm Signals authorized an exact matched mission"
        : "Cart Confirm Signals is listening; purchase actions wait for an exact match"
      : armed
      ? "Cart Confirm automation is armed"
      : paused
        ? "Cart Confirm is stopped; monitoring is paused"
        : "Cart Confirm is connected and monitoring without buying"
  });
}

async function setConnectionProblemBadge(text, title) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
  await chrome.action.setTitle({ title });
}

// Never leave the badge blank: OFF must be distinguishable from "never tried",
// or a blocked loopback connection looks identical to a missing extension.
async function setDisconnectedBadge() {
  await chrome.action.setBadgeText({ text: "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#475569" });
  await chrome.action.setTitle({
    title: "Cart Confirm desktop app not reachable on 127.0.0.1:32191-32195. Is the app running? Click to retry."
  });
}

async function acceptDesktopIdentity(config) {
  const extensionVersion = chrome.runtime.getManifest().version;
  if (String(config.appVersion || "") !== extensionVersion) return { ok: false, reason: "version-mismatch" };
  const stored = await chrome.storage.local.get([PAIRED_TOKEN_KEY, VERSION_RELOAD_STATE_KEY]);
  const pairedToken = String(stored[PAIRED_TOKEN_KEY] || "");
  if (pairedToken && pairedToken !== config.token) return { ok: false, reason: "pairing-mismatch" };
  if (!pairedToken) await chrome.storage.local.set({ [PAIRED_TOKEN_KEY]: config.token });
  // Clear a completed transition once, rather than issuing a storage write on
  // every five-second config refresh. This also permits a future retry if the
  // desktop was temporarily rolled back after an unsuccessful file update.
  if (stored[VERSION_RELOAD_STATE_KEY]) await chrome.storage.local.remove(VERSION_RELOAD_STATE_KEY);
  return { ok: true };
}

async function attemptBundledVersionReload(appVersion) {
  const extensionVersion = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get(VERSION_RELOAD_STATE_KEY);
  const plan = UpdateState.planVersionReload(
    stored[VERSION_RELOAD_STATE_KEY],
    appVersion,
    extensionVersion,
    Date.now()
  );
  if (!plan.reload) return false;
  await chrome.storage.local.set({ [VERSION_RELOAD_STATE_KEY]: plan.state });
  await setConnectionProblemBadge(
    "UPD",
    `Updating Cart Confirm Companion from v${extensionVersion} to v${String(appVersion || "").slice(0, 20)}`
  );
  setTimeout(() => chrome.runtime.reload(), 250);
  return true;
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
  const products = Array.isArray(config.products) ? config.products : [];
  const activeCohortIds = new Set(products.map((product) => String(product?.executionCohortId || "")).filter(Boolean));
  const queueCaptures = Object.fromEntries(Object.entries(config.queueCaptures || {}).filter(([cohortId]) => activeCohortIds.has(cohortId)));
  return {
    products,
    automationEnabled: Boolean(config.automationEnabled),
    signalsEnabled: Boolean(config.signalsEnabled),
    monitoringPaused: Boolean(config.monitoringPaused),
    automationRunId: String(config.automationRunId || ""),
    queueCaptures,
    fastMode: Boolean(config.fastMode),
    retryIntervalSeconds: Number(config.retryIntervalSeconds || 15),
    eligibilityRefreshIntervalSeconds: Number(config.eligibilityRefreshIntervalSeconds || 2),
    storeNavigationIntervalSeconds: Number(config.storeNavigationIntervalSeconds || 20),
    overloadCooldownSeconds: Number(config.overloadCooldownSeconds || 300),
    watcherIntervalSeconds: Number(config.watcherIntervalSeconds || 60),
    blitzRetryDelayMs: Number(config.blitzRetryDelayMs || 750),
    blitzWindowSeconds: Number(config.blitzWindowSeconds || 20),
    scheduledBlitzDurationSeconds: Number(config.scheduledBlitzDurationSeconds || 120),
    walmartQueueCaptureReloads: Number(config.walmartQueueCaptureReloads ?? 0),
    firstPartyOnly: true,
    catalogSearch: config.catalogSearch && typeof config.catalogSearch === "object"
      ? {
          id: String(config.catalogSearch.id || ""),
          query: String(config.catalogSearch.query || ""),
          retailers: Array.isArray(config.catalogSearch.retailers) ? config.catalogSearch.retailers : [],
          expiresAt: String(config.catalogSearch.expiresAt || "")
        }
      : null,
    trackalackerImport: config.trackalackerImport && typeof config.trackalackerImport === "object"
      ? {
          id: String(config.trackalackerImport.id || ""),
          startedAt: String(config.trackalackerImport.startedAt || ""),
          expiresAt: String(config.trackalackerImport.expiresAt || "")
      }
      : null,
    trackalackerPush: config.trackalackerPush && typeof config.trackalackerPush === "object"
      ? {
          enabled: config.trackalackerPush.enabled === true,
          deliveryPaused: config.trackalackerPush.deliveryPaused === true,
          enrollmentNonce: String(config.trackalackerPush.enrollmentNonce || "").slice(0, 80)
        }
      : { enabled: false, deliveryPaused: false, enrollmentNonce: "" },
    configVersion: config.configVersion,
    appVersion: config.appVersion
  };
}

function automationActive(config) {
  return Boolean(config?.automationEnabled) && config.monitoringPaused !== true;
}

function retailerFromUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    for (const retailer of ["target", "walmart", "amazon"]) {
      const domain = `${retailer}.com`;
      if (host === domain || host.endsWith(`.${domain}`)) return retailer;
    }
  } catch {
    // Invalid URLs cannot contribute traffic state.
  }
  return "";
}

function withTabContextLock(action) {
  const task = tabContextQueue.then(action, action);
  tabContextQueue = task.catch(() => {});
  return task;
}

async function readTabContexts() {
  const stored = await chrome.storage.session.get(TAB_PRODUCT_CONTEXT_KEY);
  return TabContext.normalizeContextMap(stored[TAB_PRODUCT_CONTEXT_KEY], Date.now());
}

async function writeTabContexts(contexts) {
  await chrome.storage.session.set({ [TAB_PRODUCT_CONTEXT_KEY]: contexts });
}

async function saveTabProductContext(tabId, context) {
  if (!Number.isInteger(tabId) || tabId < 0 || !context) return false;
  return withTabContextLock(async () => {
    const contexts = await readTabContexts();
    contexts[String(tabId)] = context;
    await writeTabContexts(contexts);
    return true;
  });
}

async function clearTabProductContext(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return false;
  return withTabContextLock(async () => {
    const contexts = await readTabContexts();
    const key = String(tabId);
    const changed = Boolean(contexts[key]);
    delete contexts[key];
    if (changed) await writeTabContexts(contexts);
    return changed;
  });
}

async function getTabProductContext(config, sender) {
  const tabId = sender?.tab?.id;
  const retailer = retailerFromUrl(sender?.tab?.url);
  if (!Number.isInteger(tabId) || !retailer) return { ok: false, reason: "tab-unavailable", productId: "" };
  const contexts = await readTabContexts();
  const context = TabContext.contextForTab(config, contexts, tabId, retailer, Date.now());
  return context
    ? {
        ok: true,
        productId: context.productId,
        entry: context.entry,
        signalOrderLimit: context.signalOrderLimit
      }
    : { ok: false, reason: "context-unavailable", productId: "", entry: "product", signalOrderLimit: null };
}

async function setTabProductContextFromMessage(config, message, sender) {
  const tabId = sender?.tab?.id;
  const productId = String(message.productId || "");
  const product = (config?.products || []).find((candidate) => candidate?.id === productId);
  const retailer = retailerFromUrl(sender?.tab?.url);
  if (!Number.isInteger(tabId) || !product || product.retailer !== retailer) {
    return { ok: false, reason: "product-context-mismatch" };
  }
  const plan = TabContext.validateOpenRequest(config, {
    retailer,
    productId,
    url: product.openUrl || product.productUrl,
    contextRequired: false,
    signalOrderLimit: message.signalOrderLimit
  }, Date.now());
  if (!plan.ok) return { ok: false, reason: plan.reason };
  await withTabContextLock(async () => {
    const contexts = await readTabContexts();
    const current = contexts[String(tabId)];
    contexts[String(tabId)] = current?.productId === productId && current.entry !== "product"
      ? {
          ...plan.context,
          entry: current.entry,
          signalOrderLimit: current.signalOrderLimit ?? plan.context.signalOrderLimit
        }
      : plan.context;
    await writeTabContexts(contexts);
  });
  return { ok: true, productId };
}

async function consumeDirectEntryContext(sender, productIdValue) {
  const tabId = sender?.tab?.id;
  const productId = String(productIdValue || "");
  if (!Number.isInteger(tabId) || !productId) return { ok: false, reason: "tab-unavailable" };
  return withTabContextLock(async () => {
    const contexts = await readTabContexts();
    const key = String(tabId);
    const context = contexts[key];
    if (!context || context.productId !== productId) return { ok: false, reason: "context-unavailable" };
    contexts[key] = { ...context, entry: "product" };
    await writeTabContexts(contexts);
    return { ok: true, productId };
  });
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
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
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
      intervalMs: Traffic.navigationIntervalMs(config, message.cadence),
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

async function cancelNavigation(message, sender) {
  const config = await discoverConfig(false);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const productId = String(message.productId || "");
  const retailer = String(message.retailer || "");
  const product = config.products.find((candidate) => (
    candidate.id === productId && candidate.retailer === retailer
  ));
  if (!product) return { ok: false, reason: "product-disabled" };
  const ownerId = `tab:${sender?.tab?.id ?? "unknown"}`;

  return withTrafficStateLock(async () => {
    const state = await readTrafficState(config);
    const result = Traffic.cancelNavigationSlot(state.retailers[retailer], {
      now: Date.now(),
      reservationId: String(message.reservationId || ""),
      ownerId,
      productId
    });
    state.retailers[retailer] = result.state;
    await writeTrafficState(state);
    return {
      ok: result.canceled || result.reason === "reservation-missing",
      canceled: result.canceled,
      reason: result.reason
    };
  });
}

async function revalidateNavigation(message, sender) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
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
    if (result.allowed) {
      const budget = await reserveStoreAction(product.id, "automatic-navigation");
      if (!budget.ok) {
        return {
          ok: false,
          reason: budget.reason || "traffic-budget-exhausted",
          waitMs: Math.max(0, Number(budget.retryAt || 0) - Date.now()),
          retryAt: Number(budget.retryAt || 0),
          cooldownUntil: result.state.cooldownUntil,
          lastStatus: result.state.lastStatus
        };
      }
    }
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

const RETAILER_TAB_PATTERNS = Object.freeze({
  target: ["https://target.com/*", "https://*.target.com/*"],
  walmart: ["https://walmart.com/*", "https://*.walmart.com/*"],
  amazon: ["https://amazon.com/*", "https://*.amazon.com/*"]
});

// Chrome throttles content-script timers in hidden tabs, which starves the
// watcher scans and stock-refresh navigations of background missions. Alarms
// fire in the service worker regardless of tab visibility, so a 30-second
// heartbeat pings every store tab; hidden tabs run their overdue navigation
// or an immediate scan, and visible tabs ignore the tick.
const BACKGROUND_TICK_ALARM = "cart-confirm-background-tick";

async function broadcastBackgroundTick() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: Object.values(RETAILER_TAB_PATTERNS).flat() });
  } catch {
    return;
  }
  await Promise.allSettled(tabs.map((tab) => (
    Number.isInteger(tab?.id)
      ? chrome.tabs.sendMessage(tab.id, { type: "CART_CONFIRM_BACKGROUND_TICK" })
      : Promise.resolve()
  )));
}

// Guarded: while a desktop update is replacing the unpacked extension on
// disk, a restarting service worker can execute this new file under the old
// cached manifest, where the alarms permission does not exist yet. A bare
// chrome.alarms call would throw at the top level and kill the entire worker
// — no hellos, no open-request claims — until the extension reloads. The
// heartbeat is an enhancement, so it degrades instead of destroying startup.
if (chrome.alarms?.create && chrome.alarms?.onAlarm) {
  chrome.alarms.create(BACKGROUND_TICK_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BACKGROUND_TICK_ALARM) {
      void broadcastBackgroundTick();
      void drainTrackalackerPushQueue().catch(() => {});
    }
  });
}

// Foreground checks: hidden pages may finish loading without fully
// rendering their stock UI, so after a background mission tab completes a
// load it is made the window's active tab — loaded → checking — and simply
// stays there; the next completed refresh rotates the active tab onward.
// Only the tab strip inside Chrome changes: window focus is never taken, so
// a browser sitting behind other applications stays behind them. Rotations
// are serialized, spaced, and never switch away from a cart or checkout page
// or while a purchase activation owns the tab strip.
const FOREGROUND_CHECK_SPACING_MS = 4_000;
const foregroundCheckState = {
  queue: [],
  queuedTabs: new Set(),
  running: false,
  lastFlashAt: 0,
  lastPurchaseActivationAt: 0
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") void queueForegroundCheck(tab);
});

async function queueForegroundCheck(tab) {
  if (!tab || tab.active || !Number.isInteger(tab.id)) return;
  if (foregroundCheckState.queuedTabs.has(tab.id)) return;
  const url = String(tab.url || tab.pendingUrl || "");
  const retailer = Retailers.detectRetailer(url);
  if (!retailer || OpenRequestTabs.purchaseStageTab(retailer, url)) return;
  const sku = Retailers.extractSkuFromUrl(retailer, url);
  if (!sku) return;
  const config = await discoverConfig(false);
  if (!config || config.monitoringPaused) return;
  const product = (config.products || []).find((candidate) => (
    candidate?.enabled && candidate.retailer === retailer && candidate.sku === sku
  ));
  if (!product) return;
  foregroundCheckState.queuedTabs.add(tab.id);
  foregroundCheckState.queue.push(tab.id);
  void drainForegroundChecks();
}

async function drainForegroundChecks() {
  if (foregroundCheckState.running) return;
  foregroundCheckState.running = true;
  try {
    while (foregroundCheckState.queue.length) {
      const wait = FOREGROUND_CHECK_SPACING_MS - (Date.now() - foregroundCheckState.lastFlashAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const tabId = foregroundCheckState.queue.shift();
      foregroundCheckState.queuedTabs.delete(tabId);
      await runForegroundCheck(tabId).catch(() => {});
    }
  } finally {
    foregroundCheckState.running = false;
  }
}

async function runForegroundCheck(tabId) {
  // A purchase flow owns the tab strip; watcher rotations stand down.
  if (Date.now() - foregroundCheckState.lastPurchaseActivationAt < 20_000) return;
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return; }
  if (tab.active) return;
  let tabWindow;
  try { tabWindow = await chrome.windows.get(tab.windowId); } catch { return; }
  // Activating inside a minimized window still renders nothing.
  if (tabWindow.state === "minimized") return;
  let previous = null;
  try { [previous] = await chrome.tabs.query({ active: true, windowId: tab.windowId }); } catch { previous = null; }
  const previousUrl = String(previous?.url || "");
  if (previous && OpenRequestTabs.purchaseStageTab(Retailers.detectRetailer(previousUrl), previousUrl)) return;
  // Tab activation only — chrome.windows.update is deliberately never called
  // here, so the browser window's stacking order and the user's OS focus are
  // untouched. The activated tab stays put until the next rotation.
  try { await chrome.tabs.update(tabId, { active: true }); } catch { return; }
  foregroundCheckState.lastFlashAt = Date.now();
}
let openRequestsInFlight = false;
let openRequestDrainUntil = 0;
let openRequestDrainTask = null;
const lastHelloAtByPort = new Map();

// Announce this extension to the desktop even when identity checks fail, so
// the app can show "reload the extension" instead of a blanket waiting state.
// Throttled per port: a stale process on a lower port must not suppress the
// hello owed to the real desktop app on a later port.
async function sendCompanionHello(baseUrl, token, reason) {
  if (Date.now() - (lastHelloAtByPort.get(baseUrl) || 0) < 10_000) return;
  lastHelloAtByPort.set(baseUrl, Date.now());
  try {
    await fetchWithTimeout(`${baseUrl}/companion/hello`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cart-Assist-Token": token
      },
      body: JSON.stringify({
        extensionVersion: chrome.runtime.getManifest().version,
        reason: String(reason || "")
      })
    });
  } catch {
    // The desktop keeps showing its waiting state when unreachable.
  }
}

// A qualified purchase workflow runs inside its own tab, and Chrome throttles
// timers and rendering in inactive tabs. Bringing the exact mission tab and
// its window forward keeps Add, cart verification, and checkout at full
// interactive speed from the moment an offer qualifies. Only an armed,
// unpaused configuration may pull focus.
async function activatePurchaseTab(sender, productId = "") {
  const tabId = sender?.tab?.id;
  if (tabId === undefined) return { ok: false, reason: "no-tab" };
  const config = await discoverConfig(false);
  if (!config?.automationEnabled || config.monitoringPaused) return { ok: false, reason: "not-armed" };
  // A completed mission never re-takes the tab strip: its repeated
  // activations would also keep the rotation stand-down clock pinned and
  // starve every other mission's foreground checks.
  if (productId) {
    const state = await readAutomationState(config);
    if (state.completed?.[productId]) return { ok: false, reason: "completed" };
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) await chrome.tabs.update(tabId, { active: true });
    // Ask for attention on the taskbar without yanking the browser above
    // whatever the user is working in; the desktop alarm already alerts them.
    await chrome.windows.update(tab.windowId, { drawAttention: true });
    foregroundCheckState.lastPurchaseActivationAt = Date.now();
    return { ok: true, activated: !tab.active };
  } catch {
    return { ok: false, reason: "tab-activation-failed" };
  }
}

async function claimOpenRequest(config, id) {
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/open-requests/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cart-Assist-Token": config.token
      },
      body: JSON.stringify({ id })
    });
    if (!response.ok) return null;
    const result = await response.json().catch(() => null);
    return result?.ok ? result : null;
  } catch {
    return null;
  }
}

async function reuseTabForOpenRequest(config, request) {
  const retailer = String(request?.retailer || "");
  const url = String(request?.url || "");
  const patterns = RETAILER_TAB_PATTERNS[retailer];
  if (!patterns || retailerFromUrl(url) !== retailer) return;
  const contextPlan = TabContext.validateOpenRequest(config, request, Date.now());
  if (!contextPlan.ok) return;
  const active = OpenRequestTabs.shouldActivateTab(request);
  const tabs = await chrome.tabs.query({ url: patterns });
  // Queue URLs are resolved through the same safe embedded-item parser used
  // by the content script, so a live /qp tab is recognized as its mission and
  // can never be mistaken for a free tab during fan-out.
  const tab = OpenRequestTabs.chooseReusableTab(config, request, tabs);
  const claimed = await claimOpenRequest(config, String(request.id || ""));
  if (!claimed) return;
  const current = await discoverConfig(true);
  if (!current || current.monitoringPaused) return;

  const createContextTab = async (destination = url) => {
    let created = null;
    try {
      created = await chrome.tabs.create({ url: "about:blank", active });
      if (contextPlan.context) await saveTabProductContext(created.id, contextPlan.context);
      await chrome.tabs.update(created.id, { url: destination, active });
      return created;
    } catch (error) {
      if (created?.id !== undefined) {
        await clearTabProductContext(created.id).catch(() => {});
        await chrome.tabs.remove(created.id).catch(() => {});
      }
      throw error;
    }
  };
  try {
    if (tab) {
      if (contextPlan.context) await saveTabProductContext(tab.id, contextPlan.context);
      await chrome.tabs.update(tab.id, { url, active });
      // Attention on the taskbar only — reused open-request tabs must not
      // yank the browser above whatever the user is working in.
      if (active) await chrome.windows.update(tab.windowId, { drawAttention: true }).catch(() => {});
    } else {
      // Every existing tab belongs to another enabled mission. Claim the
      // request and create a tab immediately instead of making the desktop
      // wait through its fallback timeout.
      await createContextTab();
    }
  } catch {
    // The tab closed between query and navigation; the claim already stopped
    // the desktop fallback. Recreate context before direct navigation; if
    // session storage fails, use the configured canonical product page.
    if (tab?.id !== undefined) await clearTabProductContext(tab.id).catch(() => {});
    try {
      await createContextTab();
    } catch {
      const product = (config.products || []).find((candidate) => candidate?.id === contextPlan.context?.productId);
      if (product?.productUrl) await chrome.tabs.create({ url: product.openUrl || product.productUrl, active });
    }
  }
}

async function processOpenRequests(config) {
  if (openRequestsInFlight || !config || config.monitoringPaused) return;
  openRequestsInFlight = true;
  try {
    const response = await fetchWithTimeout(`${config.baseUrl}/open-requests`, {
      headers: { "X-Cart-Assist-Token": config.token }
    });
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const requests = Array.isArray(payload.requests) ? payload.requests : [];
    const { dedicated, ordinary } = OpenRequestTabs.partitionOpenRequests(requests);
    await Promise.all(dedicated.map((request) => reuseTabForOpenRequest(config, request).catch(() => {})));
    for (const request of ordinary) {
      await reuseTabForOpenRequest(config, request).catch(() => {});
    }
  } catch {
    // The desktop opens a fresh page whenever requests cannot be served.
  } finally {
    openRequestsInFlight = false;
  }
}

function wakeOpenRequestDrain(config, durationMs) {
  const boundedDuration = Math.min(60_000, Math.max(0, Number(durationMs) || 0));
  if (!boundedDuration) return;
  openRequestDrainUntil = Math.max(openRequestDrainUntil, Date.now() + boundedDuration);
  if (openRequestDrainTask) return;

  // This is only local loopback polling. It creates no retailer requests; it
  // lets the browser claim each desktop-scheduled tab as soon as its bounded
  // launch lane releases it.
  openRequestDrainTask = (async () => {
    while (Date.now() < openRequestDrainUntil) {
      await processOpenRequests(config).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  })().finally(() => {
    openRequestDrainTask = null;
  });
}

async function discoverConfig(force = false) {
  if (!force && cached && Date.now() - cached.fetchedAt < CONFIG_TTL_MS) return cached;

  let connectionProblem = "";
  for (const port of PORTS) {
    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      const response = await fetchWithTimeout(`${baseUrl}/config`);
      if (!response.ok) continue;
      const config = await response.json();
      if (!config.token || !Array.isArray(config.products)) continue;
      const identity = await acceptDesktopIdentity(config);
      if (!identity.ok) {
        await sendCompanionHello(baseUrl, config.token, identity.reason);
        if (identity.reason === "version-mismatch" && await attemptBundledVersionReload(config.appVersion)) {
          return null;
        }
        connectionProblem ||= identity.reason;
        continue;
      }
      void sendCompanionHello(baseUrl, config.token, "");
      cached = { ...config, baseUrl, fetchedAt: Date.now() };
      await setBadge(cached);
      await applyFastMode(cached.fastMode && !cached.monitoringPaused).catch(() => {});
      void syncActiveTrafficCooldowns(cached).catch(() => {});
      void processOpenRequests(cached).catch(() => {});
      void syncTrackalackerPushConfig(cached).catch(() => {});
      void ensureTrackalackerImportPage(cached).catch(() => {});
      return cached;
    } catch {
      // Try the next local port.
    }
  }

  cached = null;
  await applyFastMode(false).catch(() => {});
  if (connectionProblem === "version-mismatch") {
    await setConnectionProblemBadge("UPD", "Cart Confirm app and extension versions differ; reload the unpacked extension");
  } else if (connectionProblem === "pairing-mismatch") {
    await setConnectionProblemBadge("PAIR", "Cart Confirm desktop pairing changed; review the local installation");
  } else {
    await setDisconnectedBadge();
  }
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
    if (response.ok) wakeOpenRequestDrain(config, result.openRequestDrainMs);
    if (response.ok && result.queueCapture?.retailer === "walmart") {
      cached = null;
      const tabs = await chrome.tabs.query({ url: RETAILER_TAB_PATTERNS.walmart }).catch(() => []);
      await Promise.all(tabs.map((tab) => (
        chrome.tabs.sendMessage(tab.id, { type: "CART_CONFIRM_QUEUE_CAPTURE_CHANGED" }).catch(() => {})
      )));
    }
    return { ok: response.ok, ...result };
  } catch {
    cached = null;
    await setDisconnectedBadge();
    return { ok: false, reason: "desktop-unreachable" };
  }
}

async function postQuickAddMission(product) {
  let config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };

  const send = () => fetchWithTimeout(`${config.baseUrl}/missions/quick-add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify(product)
  });

  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      cached = null;
      void discoverConfig(true);
    }
    return {
      ok: response.ok,
      ...result,
      reason: result.reason || (response.ok ? "" : "quick-add-failed"),
      error: result.error || (response.ok ? "" : "Quick add could not create the item.")
    };
  } catch {
    cached = null;
    await setDisconnectedBadge();
    return { ok: false, reason: "desktop-unreachable", error: "Cart Confirm desktop became unreachable." };
  }
}

async function postCheckoutPreflight(productId, evidence) {
  let config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };
  if (config.automationEnabled || config.signalsEnabled) {
    return { ok: false, reason: "automation-armed", error: "Stop Autopilot or Signals before approving checkout preflight." };
  }
  const product = (config.products || []).find((candidate) => (
    candidate.id === String(productId || "")
    && candidate.enabled
    && candidate.action === "checkout"
  ));
  if (!product) {
    return { ok: false, reason: "product-disabled", error: "This tab is not tied to an enabled auto-submit item." };
  }

  const send = () => fetchWithTimeout(`${config.baseUrl}/missions/checkout-preflight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify({ productId: product.id, evidence })
  });
  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      cached = null;
      void discoverConfig(true);
    }
    return {
      ok: response.ok,
      ...result,
      reason: result.reason || (response.ok ? "" : "checkout-preflight-rejected"),
      error: result.error || (response.ok ? "" : "Checkout preflight could not be approved.")
    };
  } catch {
    cached = null;
    await setDisconnectedBadge();
    return { ok: false, reason: "desktop-unreachable", error: "Cart Confirm desktop became unreachable." };
  }
}

async function postCatalogResults(capture) {
  let config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };

  const send = () => fetchWithTimeout(`${config.baseUrl}/catalog/results`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify(capture)
  });

  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      cached = null;
      void discoverConfig(true);
    }
    return {
      ok: response.ok,
      ...result,
      reason: result.reason || (response.ok ? "" : "catalog-capture-rejected")
    };
  } catch {
    cached = null;
    await setDisconnectedBadge();
    return { ok: false, reason: "desktop-unreachable" };
  }
}

async function postTrackalackerCapture(capture) {
  let config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", error: "Cart Confirm desktop is not reachable." };

  const send = () => fetchWithTimeout(`${config.baseUrl}/trackalacker/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify(capture)
  }, 5_000);

  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      cached = null;
      if (trackalackerImportOwner?.id === String(capture?.importId || "")) {
        trackalackerImportOwner.claimedAt = Date.now();
      }
    }
    return {
      ok: response.ok,
      ...result,
      reason: result.reason || (response.ok ? "" : "trackalacker-capture-rejected"),
      error: result.error || (response.ok ? "" : "TrackaLacker capture was rejected.")
    };
  } catch {
    cached = null;
    await setDisconnectedBadge();
    return { ok: false, reason: "desktop-unreachable", error: "Cart Confirm desktop became unreachable." };
  }
}

async function sendTrackalackerPushEnvelope(envelope, initialConfig) {
  let config = initialConfig || await discoverConfig(false);
  if (!config) return { delivered: false, retryable: true, status: 0 };
  const send = (activeConfig) => fetchWithTimeout(`${activeConfig.baseUrl}/trackalacker/push/signal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": envelope.signalId,
      "X-Cart-Assist-Token": activeConfig.token
    },
    body: JSON.stringify(envelope)
  }, 5_000);
  try {
    let response = await send(config);
    if (response.status === 401) {
      cached = null;
      config = await discoverConfig(true);
      if (!config) return { delivered: false, retryable: true, status: 401 };
      response = await send(config);
    }
    return {
      delivered: response.ok,
      retryable: response.status >= 500 || response.status === 408 || response.status === 429,
      status: response.status
    };
  } catch {
    cached = null;
    return { delivered: false, retryable: true, status: 0 };
  }
}

async function drainTrackalackerPushQueue(initialConfig = null) {
  if (trackalackerPushDrainInFlight) return trackalackerPushDrainInFlight;
  trackalackerPushDrainInFlight = (async () => {
    let config = initialConfig || await discoverConfig(false);
    const state = await readTrackalackerPushState();
    if (!config || !state.enabled || state.deliveryPaused) return { delivered: 0 };
    let delivered = 0;
    while (true) {
      const queue = await readTrackalackerPushQueue();
      const envelope = queue[0];
      if (!envelope) break;
      const result = await sendTrackalackerPushEnvelope(envelope, config);
      if (result.delivered) {
        await removeQueuedTrackalackerPush(envelope.signalId);
        delivered += 1;
        const deliveryState = await readTrackalackerPushState();
        await updateTrackalackerPushState({
          lastDeliveryAt: new Date().toISOString(),
          errorCode: deliveryState.errorCode === "notification-display-failed"
            ? "notification-display-failed"
            : ""
        });
        continue;
      }
      if (!result.retryable && result.status) {
        // A structurally invalid event must not block later valid pushes. The
        // rejected envelope contains only sanitized notification text.
        await removeQueuedTrackalackerPush(envelope.signalId);
        await updateTrackalackerPushState({
          errorCode: "signal-delivery-rejected",
          lastHttpStatus: result.status
        });
        continue;
      }
      await updateTrackalackerPushState({
        errorCode: result.status ? "signal-delivery-http" : "desktop-unreachable",
        lastHttpStatus: result.status
      });
      break;
    }
    const next = await readTrackalackerPushState();
    await postTrackalackerPushStatus(config, next, { force: delivered > 0 });
    return { delivered };
  })().finally(() => {
    trackalackerPushDrainInFlight = null;
  });
  return trackalackerPushDrainInFlight;
}

async function extensionPushSubscription(applicationServerKey) {
  const pushManager = globalThis.registration?.pushManager;
  if (!pushManager?.getSubscription || !pushManager?.subscribe) {
    return { ok: false, reason: "push-api-unavailable", subscription: null };
  }
  let subscription;
  try {
    subscription = await pushManager.getSubscription();
  } catch {
    return { ok: false, reason: "push-subscription-read-failed", subscription: null };
  }
  if (subscription) {
    try {
      if (!TrackalackerPush.applicationServerKeyMatches(subscription, applicationServerKey)) {
        return { ok: false, reason: "subscription-key-mismatch", subscription: null };
      }
    } catch {
      return { ok: false, reason: "push-api-unavailable", subscription: null };
    }
  }
  if (!subscription) {
    try {
      subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    } catch {
      return { ok: false, reason: "push-subscribe-failed", subscription: null };
    }
  }
  return subscription
    ? { ok: true, reason: "", subscription }
    : { ok: false, reason: "missing-subscription", subscription: null };
}

async function inspectTrackalackerPagePush(tabId) {
  try {
    const executions = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: TrackalackerPush.inspectPagePushSubscription,
      args: []
    });
    const result = executions?.[0]?.result;
    const applicationServerKey = /^[A-Za-z0-9_-]{80,100}$/.test(String(result?.applicationServerKey || ""))
      ? String(result.applicationServerKey)
      : "";
    return {
      subscriptionPresent: result?.subscriptionPresent === true,
      applicationServerKey
    };
  } catch {
    return { subscriptionPresent: false, applicationServerKey: "" };
  }
}

function safeEnrollmentResult(value = {}) {
  const status = Math.max(0, Math.min(599, Number(value.status) || 0));
  const allowedCodes = new Set(["enrolled", "already-registered", "http-error", "network-error"]);
  return {
    ok: value.ok === true,
    duplicate: value.duplicate === true,
    pageSubscriptionPresent: value.pageSubscriptionPresent === true,
    status,
    code: allowedCodes.has(String(value.code || "")) ? String(value.code) : status ? "http-error" : "network-error"
  };
}

async function performTrackalackerPushEnrollment(tabId) {
  const config = await discoverConfig(true);
  if (!config?.trackalackerPush?.enabled) {
    const disabled = await updateTrackalackerPushState({ enabled: false, state: "disabled", ready: false });
    if (config) await postTrackalackerPushStatus(config, disabled, { force: true });
    return { ok: false, reason: "bridge-disabled" };
  }
  let state = await updateTrackalackerPushState({
    enabled: true,
    deliveryPaused: config.trackalackerPush.deliveryPaused === true,
    state: "subscribing",
    ready: false,
    errorCode: "",
    lastHttpStatus: 0
  });
  await postTrackalackerPushStatus(config, state, { force: true });

  const pagePush = await inspectTrackalackerPagePush(tabId);
  let applicationServerKey;
  try {
    applicationServerKey = pagePush.applicationServerKey
      ? TrackalackerPush.applicationServerKeyFromBase64Url(pagePush.applicationServerKey)
      : TrackalackerPush.vapidApplicationServerKey();
  } catch {
    applicationServerKey = TrackalackerPush.vapidApplicationServerKey();
  }
  const found = await extensionPushSubscription(applicationServerKey);
  if (!found.ok) {
    state = await updateTrackalackerPushState({
      state: "error",
      ready: false,
      subscriptionPresent: false,
      errorCode: found.reason,
      lastHttpStatus: 0
    });
    await postTrackalackerPushStatus(config, state, { force: true });
    return { ok: false, reason: found.reason, diagnostic: "Push subscription unavailable" };
  }

  const subscription = found.subscription;
  const fingerprint = await TrackalackerPush.subscriptionFingerprint(subscription).catch(() => "");
  const current = await readTrackalackerPushState();
  const explicitEnrollment = Boolean(config.trackalackerPush.enrollmentNonce);
  if (!explicitEnrollment && fingerprint && current.registeredFingerprint === fingerprint) {
    state = await updateTrackalackerPushState({
      state: "ready",
      ready: true,
      subscriptionPresent: true,
      errorCode: "",
      lastHttpStatus: current.lastHttpStatus || 200
    });
    await postTrackalackerPushStatus(config, state, { force: true });
    return {
      ok: true,
      alreadyRegistered: true,
      pageSubscriptionPresent: pagePush.subscriptionPresent,
      diagnostic: "Device already registered"
    };
  }

  let registration;
  try {
    registration = TrackalackerPush.deviceRegistrationPayload(
      subscription,
      TRACKALACKER_DEVICE_NICKNAME
    );
  } catch {
    registration = { ok: false, reason: "incomplete-subscription" };
  }
  if (!registration.ok || !fingerprint) {
    state = await updateTrackalackerPushState({
      state: "error",
      ready: false,
      subscriptionPresent: true,
      errorCode: registration.reason || "subscription-fingerprint-failed",
      lastHttpStatus: 0
    });
    await postTrackalackerPushStatus(config, state, { force: true });
    return { ok: false, reason: registration.reason || "incomplete-subscription", diagnostic: "Push subscription unavailable" };
  }

  state = await updateTrackalackerPushState({
    state: "registering",
    ready: false,
    subscriptionPresent: true,
    errorCode: "",
    lastHttpStatus: 0
  });
  await postTrackalackerPushStatus(config, state, { force: true });

  let result;
  try {
    const executions = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: TrackalackerPush.registerDeviceInPage,
      args: [registration.payload]
    });
    result = safeEnrollmentResult(executions?.[0]?.result);
  } catch {
    result = { ok: false, duplicate: false, status: 0, code: "page-bridge-failed" };
  }

  if (result.ok) {
    state = await updateTrackalackerPushState({
      state: "ready",
      ready: true,
      subscriptionPresent: true,
      registeredFingerprint: fingerprint,
      errorCode: "",
      lastHttpStatus: result.status || 200,
      lastRegistrationAt: new Date().toISOString()
    });
  } else {
    state = await updateTrackalackerPushState({
      state: "error",
      ready: false,
      subscriptionPresent: true,
      errorCode: result.code,
      lastHttpStatus: result.status
    });
  }
  await postTrackalackerPushStatus(config, state, { force: true });
  return {
    ok: result.ok,
    alreadyRegistered: result.duplicate,
    pageSubscriptionPresent: result.pageSubscriptionPresent || pagePush.subscriptionPresent,
    status: result.status,
    reason: result.ok ? "" : result.code,
    diagnostic: TrackalackerPush.safeRegistrationDiagnostic(result)
  };
}

function ensureTrackalackerPushEnrollment(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return Promise.resolve({ ok: false, reason: "trackalacker-tab-required" });
  if (trackalackerPushEnrollmentInFlight) return trackalackerPushEnrollmentInFlight;
  trackalackerPushEnrollmentInFlight = performTrackalackerPushEnrollment(tabId)
    .catch(async () => {
      const state = await updateTrackalackerPushState({
        state: "error",
        ready: false,
        errorCode: "push-enrollment-failed",
        lastHttpStatus: 0
      }).catch(() => null);
      const config = cached || await discoverConfig(false).catch(() => null);
      if (config && state) await postTrackalackerPushStatus(config, state, { force: true }).catch(() => {});
      return { ok: false, reason: "push-enrollment-failed", diagnostic: "Device registration failed" };
    })
    .finally(() => {
      trackalackerPushEnrollmentInFlight = null;
    });
  return trackalackerPushEnrollmentInFlight;
}

async function handleTrackalackerPushEvent(event) {
  const state = await readTrackalackerPushState();
  if (!state.enabled) return;
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    payload = null;
  }
  const receivedAt = new Date().toISOString();
  const signalId = `push:trackalacker:${crypto.randomUUID()}`;
  const presentation = TrackalackerPush.notificationPresentation(payload, signalId);
  let notificationDisplayed = true;
  try {
    await showTrackalackerPushNotification(presentation);
  } catch {
    notificationDisplayed = false;
  }
  const envelope = TrackalackerPush.signalEnvelopeFromPush(
    payload,
    signalId,
    receivedAt,
    chrome.runtime.id
  );
  if (!envelope) {
    const failed = await updateTrackalackerPushState({
      lastNotificationAt: receivedAt,
      errorCode: "push-payload-unreadable"
    });
    const config = cached || await discoverConfig(false);
    if (config) await postTrackalackerPushStatus(config, failed, { force: true });
    return;
  }
  const queue = await enqueueTrackalackerPush(envelope);
  const next = await updateTrackalackerPushState({
    lastNotificationAt: receivedAt,
    errorCode: notificationDisplayed ? "" : "notification-display-failed"
  });
  const config = cached || await discoverConfig(false);
  if (config) await postTrackalackerPushStatus(config, next, { force: true });
  if (!next.deliveryPaused) await drainTrackalackerPushQueue(config);
  return { queued: queue.length };
}

function showTrackalackerPushNotification(presentation) {
  return globalThis.registration.showNotification(presentation.title, presentation.options);
}

async function handleTrackalackerPushSubscriptionChange() {
  const current = await readTrackalackerPushState();
  const state = await updateTrackalackerPushState({
    registeredFingerprint: "",
    ready: false,
    subscriptionPresent: false,
    state: current.enabled ? "awaiting-page" : "disabled",
    errorCode: ""
  });
  const config = cached || await discoverConfig(false);
  if (config) await postTrackalackerPushStatus(config, state, { force: true });
  if (!state.enabled) return;
  const tabs = await chrome.tabs.query({
    url: ["https://trackalacker.com/*", "https://www.trackalacker.com/*"]
  }).catch(() => []);
  const tab = tabs.find((candidate) => Number.isInteger(candidate?.id));
  if (tab) await ensureTrackalackerPushEnrollment(tab.id);
}

async function resolveTrackalackerLink(rawUrl, expectedRetailer) {
  if (!["target", "walmart", "amazon"].includes(expectedRetailer)) {
    return { ok: false, reason: "unsupported-retailer" };
  }
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    return { ok: false, reason: "invalid-link" };
  }
  const direct = TrackalackerLinks.canonicalProductUrl(url.href, expectedRetailer, Retailers);
  if (direct) return { ok: true, ...direct };
  if (!TrackalackerLinks.isAllowedRedirectHost(url.href)) return { ok: false, reason: "unsupported-link-host" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
    const resolved = TrackalackerLinks.canonicalProductUrl(response.url, expectedRetailer, Retailers);
    return resolved ? { ok: true, ...resolved } : { ok: false, reason: "exact-product-link-unavailable" };
  } catch {
    return { ok: false, reason: "link-resolution-failed" };
  } finally {
    clearTimeout(timer);
  }
}

function senderIsTrackalacker(sender) {
  try {
    const host = new URL(String(sender?.tab?.url || "")).hostname.toLowerCase();
    return host === "trackalacker.com" || host.endsWith(".trackalacker.com");
  } catch {
    return false;
  }
}

async function claimTrackalackerImport(importId, sender) {
  if (!senderIsTrackalacker(sender)) return { ok: false, reason: "trackalacker-tab-required" };
  const config = await discoverConfig(true);
  const requested = String(importId || "");
  if (!requested || config?.trackalackerImport?.id !== requested) {
    return { ok: false, reason: "scan-inactive" };
  }
  const tabId = sender?.tab?.id;
  // Each authenticated content fetch is bounded to 12 seconds and retried at
  // most twice. Keep the lease long enough for one slow listing while the
  // active tab refreshes it between products and listings.
  const stale = !trackalackerImportOwner || Date.now() - trackalackerImportOwner.claimedAt > 90_000;
  if (
    !stale
    && trackalackerImportOwner.id === requested
    && trackalackerImportOwner.tabId !== tabId
  ) return { ok: true, claimed: false };
  trackalackerImportOwner = { id: requested, tabId, claimedAt: Date.now() };
  return { ok: true, claimed: true };
}

function releaseTrackalackerImport(importId, sender) {
  if (
    trackalackerImportOwner?.id === String(importId || "")
    && trackalackerImportOwner.tabId === sender?.tab?.id
  ) trackalackerImportOwner = null;
  return { ok: true };
}

async function reserveStoreAction(productId, kind) {
  let config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  const trafficState = await readTrafficState(config);
  const cooldownUntil = Number(trafficState.retailers?.[product.retailer]?.cooldownUntil || 0);
  if (cooldownUntil > Date.now() && !Traffic.canBypassOverloadCooldown(product.retailer, kind)) {
    return { ok: false, reason: "traffic-overload", retryAt: cooldownUntil };
  }

  const send = () => fetchWithTimeout(`${config.baseUrl}/traffic/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify({ retailer: product.retailer, kind: String(kind || "automatic-action").slice(0, 80) })
  });

  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.allowed) {
      recentAuthorizedStoreActions.set(product.retailer, Date.now());
      return { ok: true, remaining: result.remaining };
    }
    return { ok: false, reason: result.reason || "traffic-budget-exhausted", retryAt: result.retryAt };
  } catch {
    return { ok: false, reason: "desktop-unreachable" };
  }
}

async function reserveQueueCaptureAttempt(productId, reservationId) {
  let config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  const capture = queueCaptureForConfiguredProduct(config, product);
  if (!product || product.retailer !== "walmart" || !capture) {
    return { ok: false, reason: "capture-inactive" };
  }
  const send = () => fetchWithTimeout(`${config.baseUrl}/queue-capture/reserve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify({ productId, reservationId })
  });
  try {
    let response = await send();
    if (response.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      response = await send();
    }
    return await response.json().catch(() => ({ ok: false, reason: "invalid-response" }));
  } catch {
    return { ok: false, reason: "desktop-unreachable" };
  }
}

function combinedMembersByStore(config) {
  const stores = config?.combinedOrder?.enabled ? config.combinedOrder.stores || {} : {};
  const byStore = {};
  for (const [retailer, store] of Object.entries(stores)) {
    const ids = (store?.members || []).map((member) => String(member?.id || "")).filter(Boolean);
    if (ids.length) byStore[retailer] = ids;
  }
  return Object.keys(byStore).length ? byStore : null;
}

function combinedMemberIdsFor(config, retailer) {
  return combinedMembersByStore(config)?.[String(retailer || "")] || [];
}

async function readAutomationState(config) {
  const stored = await chrome.storage.local.get(AUTOMATION_STATE_KEY);
  const runId = String(config.automationRunId || "");
  return AutomationState.normalizeState(
    stored[AUTOMATION_STATE_KEY],
    runId,
    Date.now(),
    combinedMembersByStore(config),
    config.products
  );
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
  const product = config.products.find((candidate) => (
    candidate.id === productId
    && candidate.enabled
    && !ScheduleGate.calendarOwned(candidate)
  )) || null;
  if (!product) return null;
  if (
    product.executionMode === "blitz"
    && (!Number.isFinite(Number(product.executionExpiresAt)) || Date.now() >= Number(product.executionExpiresAt))
  ) {
    return { ...product, executionMode: "watcher", executionExpiresAt: 0, executionCohortId: "" };
  }
  return product;
}

function queueCaptureForConfiguredProduct(config, product) {
  if (!product?.executionCohortId) return null;
  const capture = config?.queueCaptures?.[product.executionCohortId];
  return capture?.retailer === "walmart" ? capture : null;
}

// A cart-action mission whose add reached "confirmed" has already achieved
// its deliverable — the exact item and quantity were verified in the cart.
// If its completion bookkeeping was interrupted (Autopilot switched off at
// the alert, one dropped message, a closed tab), the store lane it still
// holds strands every later mission on that retailer forever. Finalizing the
// blocker here is the same completeProduct call the interrupted flow would
// have made; held lanes for review/checkout missions are never touched.
function healStrandedCartHold(state, config, claimResult, now) {
  if (
    claimResult.ok
    || !["store-busy", "product-busy", "item-busy"].includes(claimResult.reason)
    || claimResult.held !== true
    || claimResult.blockingPhase !== "cart-confirmed"
  ) return false;
  const blockerId = String(claimResult.activeProductId || "");
  if (!blockerId) return false;
  const blocker = (config.products || []).find((candidate) => candidate?.id === blockerId);
  // A deleted mission cannot need its lane any more; a configured one may be
  // finalized only when adding to the cart was the whole mission.
  if (blocker && blocker.action !== "cart") return false;
  return AutomationState.complete(state, blocker || { id: blockerId, action: "cart" }, now).ok === true;
}

async function claimProduct(productId, ownerId) {
  const config = await discoverConfig(true);
  // A desktop that cannot be reached is not the same as an operator Stop:
  // reachability failures must stay retryable instead of reading as disarmed.
  if (!config) return { ok: false, reason: "desktop-unreachable" };
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const now = Date.now();
    const claimOptions = { combinedMemberIds: combinedMemberIdsFor(config, product.retailer) };
    let result = AutomationState.claim(state, product, ownerId, now, claimOptions);
    if (healStrandedCartHold(state, config, result, now)) {
      result = AutomationState.claim(state, product, ownerId, now, claimOptions);
    }
    await writeAutomationState(state);
    return { ...result, product: result.ok ? product : undefined };
  });
}

async function prepareProductAddAction(productId, ownerId, proof) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-unreachable" };
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  const checkedOffer = OfferPolicy.validateOffer(product, proof);
  if (!checkedOffer.ok) return checkedOffer;
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const now = Date.now();
    const claimOptions = { combinedMemberIds: combinedMemberIdsFor(config, product.retailer) };
    let claimed = AutomationState.claim(state, product, ownerId, now, claimOptions);
    if (healStrandedCartHold(state, config, claimed, now)) {
      claimed = AutomationState.claim(state, product, ownerId, now, claimOptions);
    }
    if (!claimed.ok) {
      await writeAutomationState(state);
      return claimed;
    }
    const saved = AutomationState.saveProof(state, product, proof, now);
    if (!saved.ok) {
      AutomationState.release(state, product, ownerId);
      await writeAutomationState(state);
      return saved;
    }
    const reserved = AutomationState.beginAddAction(state, product, ownerId, now);
    if (!reserved.ok) AutomationState.release(state, product, ownerId);
    await writeAutomationState(state);
    return {
      ...reserved,
      proof: reserved.ok ? saved.proof : undefined,
      product: reserved.ok ? product : undefined
    };
  });
}

async function authorizeProductAddClick(productId, ownerId, proof) {
  // This is the final Stop/config check and reservation revalidation directly
  // adjacent to the content-script click. It also records the purchase attempt
  // in the same durable write instead of adding another serialized round trip.
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-unreachable" };
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const checkedOffer = OfferPolicy.validateOffer(product, proof);
    if (!checkedOffer.ok) {
      AutomationState.markAddAction(state, product, ownerId, "canceled", Date.now());
      await writeAutomationState(state);
      return checkedOffer;
    }
    AutomationState.saveProof(state, product, proof, Date.now());
    const result = AutomationState.authorizeAddClick(state, product, ownerId, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function getProductState(productId) {
  const config = await discoverConfig(false);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  const state = await readAutomationState(config);
  const productState = AutomationState.productState(state, product, Date.now());
  return {
    ok: true,
    armed: automationActive(config),
    ...productState
  };
}

function popupSender(sender) {
  return sender?.id === chrome.runtime.id
    && sender?.url === chrome.runtime.getURL("popup.html")
    && !sender?.tab;
}

async function operatorTabBinding(config, tabIdValue, productIdValue = "") {
  const tabId = Number(tabIdValue);
  if (!Number.isInteger(tabId) || tabId < 0) return { ok: false, reason: "tab-unavailable" };
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, reason: "tab-unavailable" };
  }
  const retailer = retailerFromUrl(tab.url);
  if (!retailer) return { ok: false, reason: "operator-tab-required" };
  const contexts = await readTabContexts();
  const context = TabContext.contextForTab(config, contexts, tabId, retailer, Date.now());
  if (!context || (productIdValue && context.productId !== String(productIdValue))) {
    return { ok: false, reason: "operator-context-mismatch" };
  }
  const product = config.products.find((candidate) => (
    candidate.id === context.productId
    && candidate.retailer === retailer
    && candidate.sku === context.sku
  ));
  if (!product) return { ok: false, reason: "product-disabled" };
  return { ok: true, tabId, product };
}

async function getActiveTabProductState(tabIdValue, sender) {
  if (!popupSender(sender)) return { ok: false, reason: "popup-only" };
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const binding = await operatorTabBinding(config, tabIdValue);
  if (!binding.ok) return binding;
  const { product, tabId } = binding;
  const state = await readAutomationState(config);
  const resolution = AutomationState.operatorResolution(state, product, `tab:${tabId}`, false, Date.now());
  if (!resolution.ok) return resolution;
  return {
    ok: true,
    tabId,
    productId: product.id,
    retailer: product.retailer,
    sku: product.sku,
    resolutionRequired: true,
    phase: resolution.phase
  };
}

async function completeCombinedMemberProduct(productId, captainProductId) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  const captain = configuredProduct(config, captainProductId);
  if (!product || !captain) return { ok: false, reason: "product-disabled" };
  const memberIds = combinedMemberIdsFor(config, product.retailer);
  if (!memberIds.includes(product.id) || !memberIds.includes(captain.id)) {
    return { ok: false, reason: "not-combined-members" };
  }
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.completeCombinedMember(state, product, captain, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function completeProduct(productId) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.complete(state, product, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function resolveProductKnownNoOrder(input, sender) {
  if (!popupSender(sender)) return { ok: false, reason: "popup-only", released: false };
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", released: false };
  // A paused run remains armed. Releasing a held post-mutation workflow while
  // it could resume would make duplicate-order prevention depend on timing.
  if (config.automationEnabled || config.signalsEnabled) return { ok: false, reason: "automation-armed", released: false };
  if (input?.checkedOrderHistory !== true || input?.abandonMission !== true) {
    return { ok: false, reason: "operator-acknowledgment-required", released: false };
  }
  const binding = await operatorTabBinding(config, input?.tabId, input?.productId);
  if (!binding.ok) return { ...binding, released: false };
  const authorize = () => fetchWithTimeout(`${config.baseUrl}/missions/operator-resolution/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cart-Assist-Token": config.token
    },
    body: JSON.stringify({
      productId: binding.product.id,
      checkedOrderHistory: true,
      abandonMission: true
    })
  });
  let authorization;
  try {
    authorization = await authorize();
    if (authorization.status === 401) {
      config = await discoverConfig(true);
      if (!config) return { ok: false, reason: "desktop-not-found", released: false };
      authorization = await authorize();
    }
  } catch {
    return { ok: false, reason: "desktop-unreachable", released: false };
  }
  if (!authorization.ok) {
    const denied = await authorization.json().catch(() => ({}));
    return { ok: false, reason: denied.reason || "operator-resolution-rejected", released: false };
  }
  const result = await withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const resolved = AutomationState.operatorResolution(
      state,
      binding.product,
      `tab:${binding.tabId}`,
      true,
      Date.now()
    );
    if (resolved.ok) await writeAutomationState(state);
    return resolved;
  });
  if (result.ok) {
    await postEvent({
      eventType: "automation-status",
      productId: binding.product.id,
      retailer: binding.product.retailer,
      sku: binding.product.sku,
      page: binding.product.productUrl,
      timestamp: new Date().toISOString(),
      message: "Operator checked retailer order history, confirmed no order exists, and deliberately released the held item."
    });
  }
  return result;
}

async function beginProductManualReview(productId, ownerId, evidenceHash) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.beginManualReview(
      state,
      product,
      ownerId,
      String(evidenceHash || ""),
      Date.now()
    );
    await writeAutomationState(state);
    return result;
  });
}

async function markProductManualSubmit(productId, ownerId, evidenceHash) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = config.products.find((candidate) => candidate.id === productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.markManualSubmitObserved(
      state,
      product,
      ownerId,
      String(evidenceHash || ""),
      Date.now()
    );
    await writeAutomationState(state);
    return result;
  });
}

async function releaseProduct(productId, ownerId) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found", released: false };
  const product = config.products.find((candidate) => candidate.id === productId);
  if (!product) return { ok: false, reason: "product-disabled", released: false };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.release(state, product, ownerId);
    await writeAutomationState(state);
    return result;
  });
}

async function recordProductAttempt(productId) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.recordAttempt(state, product, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function saveProductProof(productId, proof) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.saveProof(state, product, proof, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function beginProductAddAction(productId, ownerId) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.beginAddAction(state, product, ownerId, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function reserveProductTargetPersistence(productId, ownerId, kind) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.reserveTargetPersistence(
      state,
      product,
      ownerId,
      String(kind || ""),
      { windowMs: Number(config.blitzWindowSeconds || 20) * 1000 },
      Date.now()
    );
    await writeAutomationState(state);
    return result;
  });
}

async function markProductAddAction(productId, ownerId, outcome) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = config.products.find((candidate) => candidate.id === productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.markAddAction(state, product, ownerId, outcome, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function beginProductSubmission(productId, ownerId, evidenceHash) {
  const config = await discoverConfig(true);
  if (!automationActive(config)) return { ok: false, reason: "disarmed" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.beginSubmission(state, product, ownerId, evidenceHash, Date.now());
    await writeAutomationState(state);
    return result;
  });
}

async function markProductSubmission(productId, ownerId, outcome) {
  const config = await discoverConfig(true);
  if (!config) return { ok: false, reason: "desktop-not-found" };
  const product = configuredProduct(config, productId);
  if (!product) return { ok: false, reason: "product-disabled" };
  return withAutomationStateLock(async () => {
    const state = await readAutomationState(config);
    const result = AutomationState.markSubmission(state, product, ownerId, outcome, Date.now());
    await writeAutomationState(state);
    return result;
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
    case "CART_CONFIRM_GET_TAB_PRODUCT_CONTEXT": {
      const config = await discoverConfig(false);
      if (!config) return { ok: false, reason: "desktop-not-found", productId: "" };
      return getTabProductContext(config, sender);
    }
    case "CART_CONFIRM_INSPECT_OPERATOR_RESOLUTION":
      return getActiveTabProductState(message.tabId, sender);
    case "CART_CONFIRM_RESOLVE_OPERATOR_UNCERTAINTY":
      return resolveProductKnownNoOrder(message, sender);
    case "CART_CONFIRM_SET_TAB_PRODUCT_CONTEXT": {
      const config = await discoverConfig(false);
      if (!config) return { ok: false, reason: "desktop-not-found" };
      return setTabProductContextFromMessage(config, message, sender);
    }
    case "CART_CONFIRM_CLEAR_TAB_PRODUCT_CONTEXT":
      return { ok: await clearTabProductContext(sender?.tab?.id) };
    case "CART_CONFIRM_ACTIVATE_TAB":
      return activatePurchaseTab(sender, String(message.productId || ""));
    case "CART_CONFIRM_CONSUME_DIRECT_ENTRY_CONTEXT":
      return consumeDirectEntryContext(sender, message.productId);
    case "CART_CONFIRM_EVENT":
      return postEvent(message.payload);
    case "CART_CONFIRM_QUICK_ADD_MISSION":
      return postQuickAddMission(message.product);
    case "CART_CONFIRM_APPROVE_CHECKOUT_PREFLIGHT":
      return postCheckoutPreflight(String(message.productId || ""), message.evidence);
    case "CART_CONFIRM_CATALOG_RESULTS":
      return postCatalogResults(message.capture);
    case "CART_CONFIRM_TRACKALACKER_CAPTURE":
      if (!senderIsTrackalacker(sender)) return { ok: false, reason: "trackalacker-tab-required" };
      return postTrackalackerCapture(message.capture);
    case "CART_CONFIRM_TRACKALACKER_PUSH_PAGE_READY":
      if (!senderIsTrackalacker(sender)) return { ok: false, reason: "trackalacker-tab-required" };
      return ensureTrackalackerPushEnrollment(sender?.tab?.id);
    case "CART_CONFIRM_RESOLVE_TRACKALACKER_LINK":
      if (!senderIsTrackalacker(sender)) return { ok: false, reason: "trackalacker-tab-required" };
      return resolveTrackalackerLink(String(message.url || ""), String(message.retailer || ""));
    case "CART_CONFIRM_CLAIM_TRACKALACKER_IMPORT":
      return claimTrackalackerImport(String(message.importId || ""), sender);
    case "CART_CONFIRM_RELEASE_TRACKALACKER_IMPORT":
      return releaseTrackalackerImport(String(message.importId || ""), sender);
    case "CART_CONFIRM_CLAIM_PRODUCT":
      return claimProduct(String(message.productId || ""), `tab:${sender?.tab?.id ?? "unknown"}`);
    case "CART_CONFIRM_PREPARE_ADD_ACTION":
      return prepareProductAddAction(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.proof
      );
    case "CART_CONFIRM_AUTHORIZE_ADD_CLICK":
      return authorizeProductAddClick(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.proof
      );
    case "CART_CONFIRM_PRODUCT_STATE":
      return getProductState(String(message.productId || ""));
    case "CART_CONFIRM_COMPLETE_COMBINED_MEMBER":
      return completeCombinedMemberProduct(String(message.productId || ""), String(message.captainProductId || ""));
    case "CART_CONFIRM_COMPLETE_PRODUCT":
      return completeProduct(String(message.productId || ""));
    case "CART_CONFIRM_BEGIN_MANUAL_REVIEW":
      return beginProductManualReview(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.evidenceHash
      );
    case "CART_CONFIRM_MARK_MANUAL_SUBMIT":
      return markProductManualSubmit(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.evidenceHash
      );
    case "CART_CONFIRM_RELEASE_PRODUCT":
      return releaseProduct(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`
      );
    case "CART_CONFIRM_RECORD_ATTEMPT":
      return recordProductAttempt(String(message.productId || ""));
    case "CART_CONFIRM_RESERVE_STORE_ACTION":
      return reserveStoreAction(String(message.productId || ""), message.kind);
    case "CART_CONFIRM_RESERVE_QUEUE_CAPTURE_ATTEMPT":
      return reserveQueueCaptureAttempt(
        String(message.productId || ""),
        String(message.reservationId || "")
      );
    case "CART_CONFIRM_RESERVE_TARGET_PERSISTENCE":
      return reserveProductTargetPersistence(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.kind
      );
    case "CART_CONFIRM_SAVE_PROOF":
      return saveProductProof(String(message.productId || ""), message.proof);
    case "CART_CONFIRM_BEGIN_ADD_ACTION":
      return beginProductAddAction(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`
      );
    case "CART_CONFIRM_MARK_ADD_ACTION":
      return markProductAddAction(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        String(message.outcome || "")
      );
    case "CART_CONFIRM_BEGIN_SUBMISSION":
      return beginProductSubmission(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        message.evidenceHash
      );
    case "CART_CONFIRM_MARK_SUBMISSION":
      return markProductSubmission(
        String(message.productId || ""),
        `tab:${sender?.tab?.id ?? "unknown"}`,
        String(message.outcome || "")
      );
    case "CART_CONFIRM_SECURITY_CHALLENGE":
      return pauseFastModeForChallenge();
    case "CART_CONFIRM_RESERVE_NAVIGATION":
      return reserveNavigation(message, sender);
    case "CART_CONFIRM_CANCEL_NAVIGATION":
      return cancelNavigation(message, sender);
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

self.addEventListener("push", (event) => {
  event.waitUntil(handleTrackalackerPushEvent(event));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(handleTrackalackerPushSubscriptionChange());
});

self.addEventListener("notificationclick", (event) => {
  if (event.notification?.data?.cartConfirmTrackalacker !== true) return;
  event.notification.close();
  const url = TrackalackerPush.notificationUrl(event.notification?.data?.url)
    || "https://www.trackalacker.com/";
  event.waitUntil(chrome.tabs.create({ url, active: true }));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabProductContext(tabId).catch(() => {});
  if (trackalackerImportOwner?.tabId === tabId) trackalackerImportOwner = null;
});

chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (!Traffic.isOverloadStatus(details.statusCode)) return;
  const retailer = retailerFromUrl(details.url);
  if (!retailer) return;
  if (!Traffic.isRelevantOverloadSignal(
    details.type,
    recentAuthorizedStoreActions.get(retailer),
    Date.now()
  )) return;
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

async function refreshTrackalackerPushSubscriptionState() {
  const current = await readTrackalackerPushState();
  let subscription = null;
  try {
    subscription = await globalThis.registration?.pushManager?.getSubscription?.();
  } catch {
    subscription = null;
  }
  const fingerprint = subscription
    ? await TrackalackerPush.subscriptionFingerprint(subscription).catch(() => "")
    : "";
  return updateTrackalackerPushState({
    subscriptionPresent: Boolean(subscription),
    ready: Boolean(subscription && fingerprint && current.registeredFingerprint === fingerprint),
    state: current.enabled
      ? subscription && fingerprint && current.registeredFingerprint === fingerprint ? "ready" : "awaiting-page"
      : "disabled"
  });
}

chrome.runtime.onInstalled.addListener(() => {
  appliedFastMode = null;
  lastHelloAtByPort.clear();
  void refreshTrackalackerPushSubscriptionState()
    .then(() => discoverConfig(true))
    .catch(() => discoverConfig(true));
});

chrome.runtime.onStartup.addListener(() => {
  appliedFastMode = null;
  lastHelloAtByPort.clear();
  void refreshTrackalackerPushSubscriptionState()
    .then(() => discoverConfig(true))
    .catch(() => discoverConfig(true));
});

// Clicking the toolbar icon is a manual re-check: force a fresh discovery and
// an immediate hello so the desktop's step 1 reacts within a second.
chrome.action.onClicked.addListener(() => {
  lastHelloAtByPort.clear();
  void discoverConfig(true);
});
