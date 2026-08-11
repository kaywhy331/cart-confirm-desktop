"use strict";

const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  safeStorage,
  shell
} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const {
  DEFAULT_SETTINGS,
  MAX_PRODUCTS,
  assertSafeArmedUpdate,
  createInitialStatus,
  createProductStatus,
  matchingProduct,
  normalizeSettings,
  preserveAdminCampaignFields,
  reduceProductStatus,
  reduceStatus,
  toAutomationProduct,
  toRendererProduct,
  validateEvent
} = require("./lib/core");
const { planBulkImport, quickAddMission } = require("./lib/mission-import");
const { migrateStoredSettings } = require("./lib/migrations");
const { canBypassStoreOverload, consumeStoreAction } = require("./lib/action-budget");
const {
  assertNoNewPastProductSchedules,
  evaluateProductSchedules,
  evaluateSchedule,
  planImmediateProductOpenings,
  productCalendarOwned,
  productCalendarTime
} = require("./lib/schedule");
const {
  activateBlitzExecution,
  loadRuntimeState,
  productExecutionMode,
  reconcileProductExecutionContexts,
  saveRuntimeState
} = require("./lib/runtime-state");
const { isAllowedExtensionOrigin, isTrustedCompanionRequest } = require("./lib/extension-identity");
const { createStoreOpenQueue } = require("./lib/store-open-queue");
const { createOpenRequestStore } = require("./lib/open-requests");
const { findChrome } = require("./lib/chrome-launcher");
const { checkProductPage } = require("./lib/quiet-monitor");
const { shouldRecordActivity } = require("./lib/activity");
const {
  companionEventAllowed,
  createAbortRegistry,
  monitoringActive,
  monitoringOperationActive
} = require("./lib/monitoring-control");
const { QUEUE_FANOUT_SPACING_MS, planQueueFanout } = require("./lib/queue-fanout");
const {
  DiscordApiError,
  getDiscordChannelSetup,
  getDiscordMessages,
  normalizeSnowflake
} = require("./lib/discord-client");
const {
  clearDiscordToken,
  hasDiscordToken,
  loadDiscordToken,
  saveDiscordToken
} = require("./lib/discord-credentials");
const { processDiscordMessageBatch } = require("./lib/discord-ingestion");
const { upsertSignal } = require("./lib/signal-inbox");
const { planSignalRoute } = require("./lib/signal-routing");
const { validateRetailerShareUrl } = require("./lib/howl-link");
const {
  RETAILERS,
  extractSku,
  parseRetailUrl,
  retailerLabel,
  storeUrl
} = require("./lib/retailers");

const PORT_CANDIDATES = [32191, 32192, 32193, 32194, 32195];
const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 250;
const NOTIFICATION_COOLDOWN_MS = 15_000;
const COMPANION_TAB_FRESH_MS = 20_000;
const COMPANION_CLAIM_TIMEOUT_MS = 7_000;
// Desktop-initiated openings (manual, test, scheduled) are one page load each,
// so they use a short fixed stagger; the configured per-store spacing governs
// the extension's automatic retry navigation.
const DESKTOP_OPEN_SPACING_MS = 3_000;
const DISCORD_POLL_INTERVAL_MS = 2_500;
const DISCORD_ERROR_RETRY_MS = 10_000;
const QUIET_STORES = Object.freeze(["target", "walmart"]);

let mainWindow = null;
let companionServer = null;
let companionPort = 0;
let settings = null;
let status = createInitialStatus();
let productStatuses = {};
let events = [];
let runtimeState = null;
let startupWasDisarmed = false;
let schedulerTimer = null;
let discordPollTimer = null;
let discordPollInFlight = false;
let discordToken = "";
let discordRoleNames = {};
let discordChannelReady = false;
let discordNextPollAt = 0;
let discordConnectionEpoch = 0;
let configVersion = 1;
let companionHello = null;
let serverDiagnostics = {
  lastContactAt: "",
  lastOrigin: "",
  lastPath: "",
  rejectedOrigin: "",
  rejectedAt: "",
  configServedAt: ""
};
let lastDiagnosticsBroadcastAt = 0;
let stopEpoch = 0;
const lastNotificationAt = new Map();
const storeOverloadUntil = new Map();
const retailerTabSeenAt = new Map();
const productTabSeenAt = new Map();
const pendingNavigationKeys = new Set();
const quietAbortRegistry = createAbortRegistry();
const openRequests = createOpenRequestStore();
const storeOpenQueue = createStoreOpenQueue({
  intervalMs: () => Number(settings?.storeNavigationIntervalSeconds || 20) * 1000,
  notBefore: (retailer) => storeOverloadUntil.get(retailer) || 0
});

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function runtimeStatePath() {
  return path.join(app.getPath("userData"), "runtime-state.json");
}

function discordTokenPath() {
  return path.join(app.getPath("userData"), "discord-bot-token.bin");
}

function emptyDiscordRuntime(channelId = "") {
  return {
    channelId: String(channelId || "").slice(0, 40),
    channelName: "",
    lastMessageId: "",
    baselineAt: "",
    lastPollAt: "",
    lastSignalAt: "",
    lastError: ""
  };
}

function resetDiscordChannel(channelId) {
  discordConnectionEpoch += 1;
  discordChannelReady = false;
  discordRoleNames = {};
  discordNextPollAt = 0;
  runtimeState.discord = emptyDiscordRuntime(channelId);
}

function persistRuntimeState() {
  if (!runtimeState) return;
  runtimeState.events = events;
  runtimeState.storeOverloadUntil = Object.fromEntries(storeOverloadUntil);
  runtimeState = saveRuntimeState(runtimeStatePath(), runtimeState);
}

function resetProductStatuses() {
  productStatuses = Object.fromEntries(
    settings.products.map((product) => [product.id, createProductStatus(product)])
  );
}

function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    stored = {};
  }

  try {
    settings = normalizeSettings(migrateStoredSettings(stored), DEFAULT_SETTINGS);
  } catch {
    settings = normalizeSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS);
  }

  startupWasDisarmed = settings.automationEnabled;
  // Every process launch starts inert. Only an explicit Arm, Test, Open, or
  // Open-all action may lift this pause after the operator sees the dashboard.
  settings = { ...settings, automationEnabled: false, monitoringPaused: true };

  resetProductStatuses();
  persistSettings();
}

function loadPersistedRuntimeState() {
  runtimeState = loadRuntimeState(runtimeStatePath());
  events = runtimeState.events;
  if (runtimeState.discord.channelId !== settings.discordChannelId) {
    runtimeState.discord = emptyDiscordRuntime(settings.discordChannelId);
  }
  storeOverloadUntil.clear();
  for (const [retailer, deadline] of Object.entries(runtimeState.storeOverloadUntil)) {
    if (deadline > Date.now()) storeOverloadUntil.set(retailer, deadline);
  }
  if (startupWasDisarmed) {
    status = {
      ...status,
      lastMessage: "Automation was disarmed and monitoring paused when Cart Confirm started. Review the current run and arm it again explicitly."
    };
  } else {
    status = {
      ...status,
      lastMessage: "Monitoring is paused after startup. Choose Autopilot, Test, Open, or Open all enabled to begin."
    };
  }
}

function persistSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function extensionPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "extension")
    : path.join(__dirname, "extension");
}

function publicSettings() {
  return {
    // The renderer may copy a provisioned retailer link, but it never receives
    // the admin's Howl source URL or resolution metadata.
    products: settings.products.map((product) => ({
      ...toRendererProduct(product),
      executionMode: productExecutionMode(runtimeState, product.id, settings.automationRunId)
    })),
    automationEnabled: settings.automationEnabled,
    monitoringPaused: settings.monitoringPaused,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    eligibilityRefreshIntervalSeconds: settings.eligibilityRefreshIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
    watcherIntervalSeconds: settings.watcherIntervalSeconds,
    blitzRetryDelayMs: settings.blitzRetryDelayMs,
    blitzWindowSeconds: settings.blitzWindowSeconds,
    scheduledOpenEnabled: settings.scheduledOpenEnabled,
    scheduledOpenAt: settings.scheduledOpenAt,
    scheduledRetailer: settings.scheduledRetailer,
    discordEnabled: settings.discordEnabled,
    discordChannelId: settings.discordChannelId,
    discordAutoOpen: settings.discordAutoOpen,
    firstPartyOnly: true
  };
}

function snapshot() {
  return {
    settings: publicSettings(),
    status,
    companionHello,
    serverDiagnostics,
    productStatuses,
    events,
    signals: (runtimeState?.signals || []).map((signal) => ({
      ...signal,
      desired: settings.products.some((product) => product.id === signal.productId)
    })),
    discord: {
      enabled: settings.discordEnabled,
      configured: hasDiscordToken(discordTokenPath()),
      credentialUsable: Boolean(discordToken),
      connected: Boolean(
        settings.discordEnabled
        && discordToken
        && runtimeState?.discord?.lastPollAt
        && !runtimeState?.discord?.lastError
      ),
      channelId: settings.discordChannelId,
      channelName: runtimeState?.discord?.channelName || "",
      lastPollAt: runtimeState?.discord?.lastPollAt || "",
      lastSignalAt: runtimeState?.discord?.lastSignalAt || "",
      lastError: runtimeState?.discord?.lastError || ""
    },
    retailers: Object.fromEntries(
      Object.values(RETAILERS).map((retailer) => [retailer.id, {
        id: retailer.id,
        label: retailer.label,
        skuLabel: retailer.skuLabel,
        cartUrl: retailer.cartUrl,
        ordersUrl: retailer.ordersUrl
      }])
    ),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      companionPort,
      extensionPath: extensionPath()
    }
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cart-assist:update", snapshot());
  }
}

function appendMissionProducts(additions, message) {
  if (!Array.isArray(additions) || !additions.length) return snapshot();
  if (settings.automationEnabled) {
    throw new Error("Switch Autopilot off before adding missions.");
  }
  if (settings.products.length + additions.length > MAX_PRODUCTS) {
    throw new Error(`A buy list can contain at most ${MAX_PRODUCTS} products.`);
  }

  const previousProducts = settings.products;
  settings = {
    ...settings,
    products: [...previousProducts, ...additions]
  };
  reconcileProductExecutionContexts(
    runtimeState,
    previousProducts,
    settings.products,
    settings.automationRunId
  );
  for (const product of additions) {
    productStatuses[product.id] = createProductStatus(product);
  }
  status = { ...status, lastMessage: String(message || "Missions added.").slice(0, 240) };
  persistSettings();
  persistRuntimeState();
  configVersion += 1;
  broadcast();
  return snapshot();
}

function quickAddMissionRequest(input) {
  if (settings.automationEnabled) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "automation-armed", error: "Switch Autopilot off before using Quick add." }
    };
  }

  let product;
  try {
    product = quickAddMission(input);
  } catch (error) {
    return {
      statusCode: 400,
      payload: { ok: false, reason: "invalid-product", error: error.message }
    };
  }
  const existing = settings.products.find((candidate) => candidate.id === product.id);
  if (existing) {
    return {
      statusCode: 200,
      payload: {
        ok: true,
        duplicate: true,
        product: { id: existing.id, title: existing.title, maxPrice: existing.maxPrice }
      }
    };
  }
  if (settings.products.length >= MAX_PRODUCTS) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "mission-limit", error: `The mission list already contains ${MAX_PRODUCTS} products.` }
    };
  }

  appendMissionProducts(
    [product],
    `${product.title || `${retailerLabel(product.retailer)} ${product.sku}`} was added from Chrome as a watch mission.`
  );
  return {
    statusCode: 201,
    payload: {
      ok: true,
      duplicate: false,
      product: { id: product.id, title: product.title, maxPrice: product.maxPrice }
    }
  };
}

function addEvent(event) {
  if (event.eventType === "heartbeat") return;
  if (!shouldRecordActivity(events, event)) return;
  events = [
    {
      ...event,
      message: productStatuses[event.productId]?.lastMessage || status.lastMessage
    },
    ...events
  ].slice(0, MAX_EVENTS);
  persistRuntimeState();
}

function notifyOnce(key, title, body, force = false) {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  if (!force && now - (lastNotificationAt.get(key) || 0) < NOTIFICATION_COOLDOWN_MS) return;
  lastNotificationAt.set(key, now);
  new Notification({ title, body, silent: false }).show();
}

function reserveStoreAction(retailer, kind = "navigation") {
  if (!["target", "walmart", "amazon"].includes(retailer)) {
    return { allowed: false, reason: "unsupported-retailer" };
  }
  const now = Date.now();
  const overloadDeadline = canBypassStoreOverload(retailer, kind)
    ? 0
    : storeOverloadUntil.get(retailer) || 0;
  const result = consumeStoreAction(
    runtimeState?.storeActionHistory?.[retailer],
    now,
    undefined,
    overloadDeadline
  );
  runtimeState.storeActionHistory[retailer] = result.history;
  persistRuntimeState();
  return result.allowed
    ? { allowed: true, remaining: result.remaining, kind }
    : { allowed: false, reason: result.reason, retryAt: result.retryAt, kind };
}

function companionTabLikely(retailer) {
  return Date.now() - (retailerTabSeenAt.get(retailer) || 0) < COMPANION_TAB_FRESH_MS;
}

// The companion only exists inside Chrome, so pages are opened there directly.
// The OS default browser is a last resort (and is reported so the UI can warn).
function openPageInChrome(url) {
  const chromePath = findChrome();
  if (!chromePath) {
    return shell.openExternal(url, { activate: true }).then(() => "default-browser");
  }
  return new Promise((resolve) => {
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      void shell.openExternal(url, { activate: true }).finally(() => resolve("default-browser"));
    };
    try {
      const child = spawn(chromePath, [url], { detached: true, stdio: "ignore" });
      child.once("error", fallback);
      child.unref();
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve("chrome");
      }, 250);
    } catch {
      fallback();
    }
  });
}

async function openExternalRetailer(url, options = {}) {
  const { parsed, retailer } = parseRetailUrl(url);
  const productId = String(options.productId || "").slice(0, 80);
  const contextRequired = options.requireCompanionContext === true;
  let fallbackUrl = parsed.href;
  if (contextRequired) {
    const fallback = parseRetailUrl(options.fallbackUrl);
    if (fallback.retailer !== retailer) {
      throw new Error("A direct store entry requires a same-store product-page fallback.");
    }
    fallbackUrl = fallback.parsed.href;
  }
  const requestedSpacing = Number(options.spacingMs);
  const spacingMs = Number.isFinite(requestedSpacing) && requestedSpacing >= QUEUE_FANOUT_SPACING_MS
    ? requestedSpacing
    : DESKTOP_OPEN_SPACING_MS;
  const actionKind = String(options.actionKind || "desktop-navigation").slice(0, 80);
  const navigationKey = `${retailer}|${parsed.href}`;
  if (pendingNavigationKeys.has(navigationKey)) {
    return { retailer, url: parsed.href, via: "already-queued" };
  }
  pendingNavigationKeys.add(navigationKey);
  try {
    const result = await storeOpenQueue.enqueue(retailer, async () => {

      const taskEpoch = stopEpoch;
      const budget = reserveStoreAction(retailer, actionKind);
      if (!budget.allowed) {
        throw new Error(`${retailerLabel(retailer)} reached the fixed 120-action hourly safety budget.`);
      }
      // Ask a connected companion to reuse an existing store tab first; a
      // request nobody claims falls back to opening a fresh page.
      if (companionTabLikely(retailer)) {
        const request = openRequests.add(retailer, parsed.href, { productId, contextRequired });
        if (await openRequests.waitForClaim(request.id, COMPANION_CLAIM_TIMEOUT_MS)) {
          return {
            retailer,
            url: parsed.href,
            via: "companion-tab",
            contextAttached: Boolean(productId),
            directFallback: false
          };
        }
      }
      if (taskEpoch !== stopEpoch) return { retailer, url: parsed.href, via: "cancelled" };
      // Direct Amazon and Walmart action URLs can redirect before a content script has a chance
      // to identify the mission. Without a companion claim, open the canonical
      // product page so browser verification remains tied to the right ASIN.
      const launchUrl = contextRequired ? fallbackUrl : parsed.href;
      const via = await openPageInChrome(launchUrl);
      return {
        retailer,
        url: launchUrl,
        via,
        contextAttached: false,
        directFallback: contextRequired && launchUrl !== parsed.href
      };
    }, { spacingMs });
    return result?.cancelled ? { retailer, url: parsed.href, via: "cancelled" } : result;
  } finally {
    pendingNavigationKeys.delete(navigationKey);
  }
}

function findProduct(productId) {
  const product = settings.products.find((candidate) => candidate.id === productId);
  if (!product) throw new Error("That product is no longer in the buy list.");
  return product;
}

// Any explicit "go" action lifts a Stop's monitoring pause.
function resumeMonitoring() {
  if (!settings.monitoringPaused) return;
  settings = { ...settings, monitoringPaused: false };
  persistSettings();
  configVersion += 1;
  broadcast();
  discordNextPollAt = 0;
  void pollDiscordSignals();
}

async function openProduct(productId, options = {}) {
  const product = productId
    ? findProduct(productId)
    : settings.products.find((candidate) => candidate.enabled);
  if (!product) throw new Error("Enable at least one product first.");
  const requestedUrl = String(options.urlOverride || product.productUrl);
  const requested = parseRetailUrl(requestedUrl);
  const requestedSku = extractSku(requested.retailer, requested.parsed.href);
  if (requested.retailer !== product.retailer || requestedSku !== product.sku) {
    throw new Error("The requested signal entry does not match this mission's store and product ID.");
  }
  if (options.resumeMonitoring === false) {
    if (
      settings.monitoringPaused
      || !settings.automationEnabled
      || (options.stopEpoch !== undefined && options.stopEpoch !== stopEpoch)
    ) {
      return { productId: product.id, via: "cancelled", entry: "product", directFallback: false };
    }
  } else {
    resumeMonitoring();
  }
  const directEntry = requested.parsed.href !== product.productUrl;
  const opened = await openExternalRetailer(requested.parsed.href, {
    ...options,
    productId: product.id,
    requireCompanionContext: directEntry,
    fallbackUrl: product.productUrl
  });
  return {
    productId: product.id,
    via: opened.via,
    entry: opened.directFallback ? "product" : directEntry ? "direct" : "product",
    directFallback: opened.directFallback === true
  };
}

async function openBuyList(retailer = "", options = {}) {
  const plan = planImmediateProductOpenings(settings, retailer);
  if (!plan.enabled.length) {
    throw new Error(retailer
      ? `Enable at least one ${retailerLabel(retailer)} product first.`
      : "Enable at least one product first.");
  }

  resumeMonitoring();
  const { backgroundFirst = false, ...openOptions } = options;
  const backgroundProducts = backgroundFirst
    ? plan.ready.filter((product) => (
        QUIET_STORES.includes(product.retailer)
        && productExecutionMode(runtimeState, product.id, settings.automationRunId) === "watcher"
      ))
    : [];
  const backgroundIds = new Set(backgroundProducts.map((product) => product.id));
  const browserProducts = plan.ready.filter((product) => !backgroundIds.has(product.id));
  const results = await Promise.all(browserProducts.map((product) => (
    openExternalRetailer(product.productUrl, { ...openOptions, productId: product.id })
  )));
  return {
    count: results.filter((result) => !["already-queued", "cancelled"].includes(result.via)).length,
    reused: results.filter((result) => result.via === "companion-tab").length,
    deduped: results.filter((result) => result.via === "already-queued").length,
    defaultBrowser: results.some((result) => result.via === "default-browser"),
    background: backgroundProducts.length,
    scheduled: plan.scheduled.length,
    armed: settings.automationEnabled
  };
}

async function openStorePage(retailer, type) {
  const url = storeUrl(String(retailer || ""), type);
  if (!url) throw new Error("Choose a supported store.");
  resumeMonitoring();
  await openExternalRetailer(url);
  return url;
}

function validateProductEvent(event) {
  if (event.eventType === "heartbeat") return { event, product: null };
  if (event.eventType === "traffic-overload") {
    return event.retailer && event.cooldownUntil
      ? { event, product: null }
      : { event, product: null, error: "invalid-traffic-signal" };
  }

  const product = matchingProduct(settings.products, event);
  if (!product) return { event, product: null, error: "product-mismatch" };
  if (
    (event.retailer && event.retailer !== product.retailer)
    || (event.sku && event.sku !== product.sku)
  ) {
    return { event, product: null, error: "product-mismatch" };
  }

  const checkedEvent = {
    ...event,
    productId: product.id,
    retailer: product.retailer,
    sku: product.sku
  };

  if (checkedEvent.eventType === "offer-observed" && checkedEvent.eligible) {
    if (checkedEvent.firstParty !== true) {
      checkedEvent.eligible = false;
      checkedEvent.reason = "seller-unverified";
    } else if (checkedEvent.price === undefined) {
      checkedEvent.eligible = false;
      checkedEvent.reason = "price-unavailable";
    } else if (checkedEvent.price > product.maxPrice) {
      checkedEvent.eligible = false;
      checkedEvent.reason = "over-price";
    }
  }

  return { event: checkedEvent, product };
}

function sendEventNotification(event, product, queueFanout = null) {
  if (event.eventType === "traffic-overload") {
    notifyOnce(
      `${event.retailer}:traffic-overload`,
      `${retailerLabel(event.retailer)} traffic cooldown`,
      "Queued and automatic page openings for this store are paused.",
      true
    );
    return;
  }
  if (!product) return;
  if (product.alertLevel === "silent") return;
  const force = product.alertLevel === "alarm";
  const store = retailerLabel(product.retailer);
  const key = `${product.id}:${event.eventType}:${event.reason || ""}`;

  if (event.eventType === "offer-observed" && event.eligible) {
    notifyOnce(
      key,
      `${store} offer is eligible`,
      `${product.title || product.sku} is first-party at $${event.price.toFixed(2)} (cap $${product.maxPrice.toFixed(2)}).`,
      force
    );
  } else if (event.eventType === "automation-blocked") {
    notifyOnce(key, `${store} safety check stopped`, event.message || "The offer did not pass every configured check.");
  } else if (event.eventType === "cart-item-confirmed") {
    notifyOnce(key, `${store} cart confirmed`, `${product.title || product.sku}, quantity ${product.quantity}, is in the cart.`, force);
  } else if (event.eventType === "checkout-reached") {
    notifyOnce(key, `${store} checkout reached`, "The browser companion is validating the order review before submission.");
  } else if (event.eventType === "order-confirmed") {
    notifyOnce(key, `${store} order confirmed`, `${product.sku} reached an order-confirmation page.`, true);
  } else if (event.eventType === "review-ready") {
    notifyOnce(key, `${store} final review ready`, "Review the complete order in the browser and submit it manually.", true);
  } else if (event.eventType === "queue-waiting") {
    notifyOnce(
      key,
      `${store} purchase queue`,
      queueFanout
        ? `Official queue active. Entering ${queueFanout.productIds.length} other enabled mission${queueFanout.productIds.length === 1 ? "" : "s"} one second apart, then waiting without refreshes.`
        : "The companion is waiting for the official retailer queue without refreshing it."
    );
  }
}

function triggerQueueFanout(event) {
  if (!runtimeState) return null;
  const queuedProductIds = Object.entries(productStatuses)
    .filter(([, productStatus]) => productStatus?.reason === "retailer-queue")
    .map(([productId]) => productId);
  const decision = planQueueFanout({
    settings,
    event,
    receipts: runtimeState.queueFanoutReceipts,
    queuedProductIds
  });
  if (!decision) return null;

  const recordedAt = new Date().toISOString();
  runtimeState.queueFanoutReceipts[decision.key] = { status: "firing", recordedAt };
  persistRuntimeState();
  status = {
    ...status,
    lastMessage: `Official ${retailerLabel(decision.retailer)} queue detected. Entering ${decision.productIds.length} other enabled mission${decision.productIds.length === 1 ? "" : "s"} one second apart; queued tabs will not refresh.`
  };

  const runId = settings.automationRunId;
  const taskEpoch = stopEpoch;
  void Promise.allSettled(decision.productIds.map((productId) => openProduct(productId, {
    spacingMs: decision.spacingMs,
    actionKind: "official-queue-fanout",
    resumeMonitoring: false,
    stopEpoch: taskEpoch
  }))).then((results) => {
    const unsuccessful = results.filter((result) => (
      result.status === "rejected"
      || result.value?.via === "cancelled"
    )).length;
    runtimeState.queueFanoutReceipts[decision.key] = {
      status: unsuccessful ? "partial" : "fired",
      recordedAt: new Date().toISOString()
    };
    persistRuntimeState();
    if (unsuccessful && settings.automationEnabled && settings.automationRunId === runId) {
      status = {
        ...status,
        lastMessage: `${retailerLabel(decision.retailer)} queue fan-out finished, but ${unsuccessful} mission${unsuccessful === 1 ? "" : "s"} could not open because a safety budget, Stop, or browser action blocked it.`
      };
      notifyOnce(
        `queue-fanout-partial:${decision.key}`,
        `${retailerLabel(decision.retailer)} queue fan-out incomplete`,
        `${unsuccessful} mission${unsuccessful === 1 ? "" : "s"} did not open. Cart Confirm will not repeat the burst automatically.`,
        true
      );
      broadcast();
    }
  });
  return decision;
}

function updateSignalRecord(signalId, changes) {
  const current = runtimeState?.signals?.find((signal) => signal.id === signalId);
  if (!current) return;
  runtimeState.signals = upsertSignal(runtimeState.signals, { ...current, ...changes });
  persistRuntimeState();
  broadcast();
}

function signalSummary(signal) {
  const details = [];
  if (Number.isFinite(signal.price)) details.push(`$${signal.price.toFixed(2)}`);
  if (Number.isInteger(signal.stock)) details.push(`stock ${signal.stock}`);
  if (Number.isInteger(signal.orderLimit)) details.push(`limit ${signal.orderLimit}`);
  return details.length ? details.join(" · ") : "restock signal";
}

function handleDiscordSignal(signal, historical) {
  if (runtimeState.signals.some((candidate) => candidate.id === signal.id)) return;
  const route = planSignalRoute({ signal, settings, historical, now: Date.now() });
  const record = {
    ...signal,
    autoOpenState: route.state,
    note: route.note
  };
  runtimeState.signals = upsertSignal(runtimeState.signals, record);
  runtimeState.discord.lastSignalAt = signal.observedAt;
  persistRuntimeState();
  broadcast();

  if (historical || settings.monitoringPaused) return;
  const label = signal.title || `${retailerLabel(signal.retailer)} ${signal.sku}`;
  if (route.state === "new-product") {
    notifyOnce(
      `discord-new:${signal.id}`,
      `${retailerLabel(signal.retailer)} signal: new product`,
      `${label} (${signalSummary(signal)}). Add it as desired to react automatically next time.`,
      true
    );
    return;
  }
  if (route.state !== "pending") {
    notifyOnce(
      `discord-recorded:${signal.id}`,
      `${retailerLabel(signal.retailer)} signal recorded`,
      `${label} matched, but no page was opened: ${route.note}`,
      true
    );
    return;
  }

  notifyOnce(
    `discord-match:${signal.id}`,
    `${retailerLabel(signal.retailer)} desired restock`,
    `${label} matched (${signalSummary(signal)}). Opening ${route.entry === "product"
      ? "the product page"
      : route.entry === "amazon-atc"
        ? "Amazon Add to Cart"
        : route.entry === "amazon-buy-now"
          ? "Amazon Buy Now"
          : "Walmart Buy Now"}.`,
    true
  );
  const taskEpoch = stopEpoch;
  void openProduct(route.product.id, {
    urlOverride: route.url,
    spacingMs: QUEUE_FANOUT_SPACING_MS,
    actionKind: `discord-signal-${route.entry}`,
    resumeMonitoring: false,
    stopEpoch: taskEpoch
  }).then((result) => {
    if (result.via === "cancelled") {
      updateSignalRecord(signal.id, {
        autoOpenState: "disabled",
        note: "Stop cancelled this signal opening before a store page was opened."
      });
      return;
    }
    updateSignalRecord(signal.id, {
      autoOpenState: "opened",
      autoOpenedAt: new Date().toISOString(),
      note: result.directFallback
        ? "The direct store entry needed browser context that was not available, so the canonical product page opened for full in-tab verification."
        : `${route.note} Opened via ${result.via}.`
    });
  }).catch((error) => {
    updateSignalRecord(signal.id, {
      autoOpenState: "failed",
      note: String(error?.message || "The browser entry failed.").slice(0, 180)
    });
  });
}

async function ensureDiscordChannelSetup(epoch, token, channelId) {
  if (discordChannelReady) return;
  const setup = await getDiscordChannelSetup(token, channelId);
  if (
    epoch !== discordConnectionEpoch
    || token !== discordToken
    || channelId !== settings.discordChannelId
  ) return;
  discordRoleNames = setup.roleNames;
  discordChannelReady = true;
  runtimeState.discord.channelId = setup.channelId;
  runtimeState.discord.channelName = setup.channelName;
}

async function pollDiscordSignals(options = {}) {
  if (
    discordPollInFlight
    || !settings?.discordEnabled
    || settings.monitoringPaused
    || !discordToken
    || Date.now() < discordNextPollAt
  ) return;
  discordPollInFlight = true;
  const pollEpoch = discordConnectionEpoch;
  const token = discordToken;
  const channelId = settings.discordChannelId;
  try {
    await ensureDiscordChannelSetup(pollEpoch, token, channelId);
    if (
      pollEpoch !== discordConnectionEpoch
      || token !== discordToken
      || channelId !== settings.discordChannelId
    ) return;
    const cursor = runtimeState.discord.lastMessageId;
    const historical = !cursor && !runtimeState.discord.baselineAt;
    const messages = await getDiscordMessages(token, channelId, {
      after: cursor || undefined,
      limit: historical ? 50 : 100
    });
    if (
      pollEpoch !== discordConnectionEpoch
      || token !== discordToken
      || channelId !== settings.discordChannelId
    ) return;
    const batch = processDiscordMessageBatch(messages, runtimeState.discord, {
      roleNames: discordRoleNames,
      now: Date.now()
    });
    for (const signal of batch.signals) handleDiscordSignal(signal, batch.historical);
    runtimeState.discord.lastMessageId = batch.lastMessageId;
    runtimeState.discord.baselineAt = batch.baselineAt;
    runtimeState.discord.lastPollAt = batch.lastPollAt;
    runtimeState.discord.lastError = "";
    discordNextPollAt = 0;
    persistRuntimeState();
    if (!options.silent) broadcast();
  } catch (error) {
    if (
      pollEpoch !== discordConnectionEpoch
      || token !== discordToken
      || channelId !== settings.discordChannelId
    ) return;
    const retryMs = error instanceof DiscordApiError && error.retryAfterMs
      ? error.retryAfterMs
      : DISCORD_ERROR_RETRY_MS;
    discordNextPollAt = Date.now() + retryMs;
    runtimeState.discord.lastError = String(error?.message || "Discord signal polling failed.").slice(0, 240);
    persistRuntimeState();
    broadcast();
  } finally {
    discordPollInFlight = false;
  }
}

function startDiscordPoller() {
  if (discordPollTimer) clearInterval(discordPollTimer);
  discordPollTimer = setInterval(() => void pollDiscordSignals(), DISCORD_POLL_INTERVAL_MS);
  void pollDiscordSignals();
}

function findSignal(signalId) {
  return runtimeState?.signals?.find((signal) => signal.id === String(signalId || "")) || null;
}

async function openSignal(signalId, requestedEntry = "product") {
  const signal = findSignal(signalId);
  if (!signal) throw new Error("That restock signal is no longer in the inbox.");
  const product = settings.products.find((candidate) => candidate.id === signal.productId);
  if (!product) {
    if (requestedEntry !== "product") throw new Error("Add this product as a desired mission before using a direct store entry.");
    resumeMonitoring();
    const opened = await openExternalRetailer(signal.productUrl, { actionKind: "discord-signal-manual" });
    return { productId: "", via: opened.via };
  }
  if (requestedEntry === "product") return openProduct(product.id);
  const route = planSignalRoute({
    signal,
    settings: {
      ...settings,
      monitoringPaused: false,
      discordAutoOpen: true,
      products: settings.products.map((candidate) => (
        candidate.id === product.id
          ? { ...candidate, signalAutoOpen: true, signalEntry: requestedEntry }
          : candidate
      ))
    },
    now: Date.now()
  });
  if (route.entry !== requestedEntry) {
    throw new Error("Direct entry requires Autopilot, a fresh under-cap price, a matching sanitized link, and Amazon.com as seller for Amazon. Open the product page instead.");
  }
  return openProduct(product.id, {
    urlOverride: route.url,
    spacingMs: QUEUE_FANOUT_SPACING_MS,
    actionKind: `discord-signal-manual-${requestedEntry}`
  });
}

function handleCompanionEvent(rawEvent) {
  const validated = validateEvent(rawEvent);
  if (!companionEventAllowed(settings, validated.eventType)) {
    return { accepted: false, reason: "monitoring-paused" };
  }
  const result = validateProductEvent(validated);
  if (result.error) return { accepted: false, reason: result.error };

  const { event, product } = result;
  if (event.retailer && RETAILERS[event.retailer]) {
    retailerTabSeenAt.set(event.retailer, Date.now());
  }
  if (product) productTabSeenAt.set(product.id, Date.now());
  if (event.eventType === "traffic-overload") {
    const previousCooldown = storeOverloadUntil.get(event.retailer) || 0;
    if (event.cooldownUntil <= previousCooldown) return { accepted: true, deduped: true };
    storeOverloadUntil.set(
      event.retailer,
      event.cooldownUntil
    );
    if (runtimeState) runtimeState.storeOverloadUntil[event.retailer] = event.cooldownUntil;
  }
  status = reduceStatus(status, event);
  if (product) {
    const current = productStatuses[product.id] || createProductStatus(product);
    productStatuses = {
      ...productStatuses,
      [product.id]: reduceProductStatus(current, event)
    };
  }
  addEvent(event);
  const queueFanout = event.eventType === "queue-waiting" && product
    ? triggerQueueFanout(event)
    : null;
  sendEventNotification(event, product, queueFanout);
  broadcast();
  return {
    accepted: true,
    openRequestDrainMs: queueFanout?.openRequestDrainMs || 0
  };
}

// Track what actually reaches the local server, so the UI can distinguish
// "nothing arrives" (blocked loopback, dead extension) from "arrives but is
// rejected" (wrong extension identity) from "config fetched but no report".
function noteServerContact(req, requestUrl, rejected) {
  const origin = String(req.headers.origin || "").slice(0, 120);
  const now = new Date().toISOString();
  serverDiagnostics = {
    ...serverDiagnostics,
    lastContactAt: now,
    lastOrigin: origin,
    lastPath: requestUrl.pathname.slice(0, 80),
    ...(rejected ? { rejectedOrigin: origin || "(no origin header)", rejectedAt: now } : {})
  };
  if (Date.now() - lastDiagnosticsBroadcastAt > 3000) {
    lastDiagnosticsBroadcastAt = Date.now();
    broadcast();
  }
}

function corsOrigin(req) {
  const origin = String(req.headers.origin || "");
  return isAllowedExtensionOrigin(origin) ? origin : "";
}

function hasAllowedLocalOrigin(req) {
  return isTrustedCompanionRequest(
    req.headers.origin,
    req.headers.host,
    req.headers["x-cart-assist-extension"]
  );
}

function writeJson(req, res, statusCode, payload) {
  const origin = corsOrigin(req);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.end(JSON.stringify(payload));
}

function readJsonRequest(req, res, handler) {
  let body = "";
  let finished = false;
  req.on("data", (chunk) => {
    if (finished) return;
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      finished = true;
      writeJson(req, res, 413, { error: "payload-too-large" });
    }
  });
  req.on("end", () => {
    if (finished) return;
    try {
      const result = handler(JSON.parse(body));
      writeJson(req, res, result.statusCode, result.payload);
    } catch (error) {
      writeJson(req, res, 400, { error: error.message });
    }
  });
}

function extensionConfig() {
  return {
    // Howl source and resolved tracking URLs are sharing-only. Chrome receives
    // only the canonical purchasing fields used by the automation pipeline.
    products: settings.products.map((product) => ({
      ...toAutomationProduct(product),
      calendarOwned: productCalendarOwned(settings, product),
      calendarOpenAt: productCalendarTime(settings, product),
      executionMode: productExecutionMode(runtimeState, product.id, settings.automationRunId)
    })),
    automationEnabled: settings.automationEnabled,
    monitoringPaused: settings.monitoringPaused,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    eligibilityRefreshIntervalSeconds: settings.eligibilityRefreshIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
    watcherIntervalSeconds: settings.watcherIntervalSeconds,
    blitzRetryDelayMs: settings.blitzRetryDelayMs,
    blitzWindowSeconds: settings.blitzWindowSeconds,
    firstPartyOnly: true,
    token: settings.companionToken,
    configVersion,
    appVersion: app.getVersion()
  };
}

function startServerOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);

      if (req.method === "OPTIONS") {
        const origin = corsOrigin(req);
        noteServerContact(req, requestUrl, !origin);
        res.statusCode = origin ? 204 : 403;
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cart-Assist-Token, X-Cart-Assist-Extension");
          res.setHeader("Access-Control-Max-Age", "600");
          res.setHeader("Vary", "Origin");
        }
        res.end();
        return;
      }

      if (!hasAllowedLocalOrigin(req)) {
        noteServerContact(req, requestUrl, true);
        writeJson(req, res, 403, { error: "extension-origin-required" });
        return;
      }
      noteServerContact(req, requestUrl, false);

      if (req.method === "GET" && requestUrl.pathname === "/config") {
        serverDiagnostics = { ...serverDiagnostics, configServedAt: new Date().toISOString() };
        writeJson(req, res, 200, extensionConfig());
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/event") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }

        readJsonRequest(req, res, (body) => {
          const eventResult = handleCompanionEvent(body);
          return { statusCode: eventResult.accepted ? 202 : 200, payload: eventResult };
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/missions/quick-add") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => quickAddMissionRequest(body));
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/companion/hello") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => {
          companionHello = {
            version: String(body?.extensionVersion || "").slice(0, 20),
            reason: String(body?.reason || "").slice(0, 40),
            seenAt: new Date().toISOString()
          };
          broadcast();
          return { statusCode: 200, payload: { ok: true } };
        });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/open-requests") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        writeJson(req, res, 200, {
          requests: settings.monitoringPaused ? [] : openRequests.pending()
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/open-requests/claim") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => {
          if (settings.monitoringPaused) {
            return {
              statusCode: 409,
              payload: { ok: false, reason: "monitoring-paused" }
            };
          }
          const result = openRequests.claim(String(body?.id || ""));
          return { statusCode: result.ok ? 200 : 409, payload: result };
        });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/traffic/reserve") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => {
          if (!monitoringActive(settings)) {
            return {
              statusCode: 409,
              payload: { allowed: false, reason: "disarmed" }
            };
          }
          const retailer = String(body?.retailer || "");
          const kind = String(body?.kind || "automatic-action").slice(0, 80);
          const result = reserveStoreAction(retailer, kind);
          return { statusCode: result.allowed ? 200 : 429, payload: result };
        });
        return;
      }

      writeJson(req, res, 404, { error: "not-found" });
    });

    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function startCompanionServer() {
  for (const port of PORT_CANDIDATES) {
    try {
      companionServer = await startServerOnPort(port);
      companionPort = port;
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("The local companion ports are already in use.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 900,
    minWidth: 940,
    minHeight: 700,
    backgroundColor: "#0b1120",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: "no-user-gesture-required"
    }
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith("file://")) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("cart-assist:snapshot", () => snapshot());

  ipcMain.handle("cart-assist:save-settings", (_event, nextSettings) => {
    const wasArmed = settings.automationEnabled;
    const previousProducts = settings.products;
    const previousDiscordChannelId = settings.discordChannelId;
    const userSettings = nextSettings && typeof nextSettings === "object"
      ? {
          ...nextSettings,
          products: Array.isArray(nextSettings.products)
            ? nextSettings.products.map(toAutomationProduct)
            : nextSettings.products
        }
      : nextSettings;
    let normalized = normalizeSettings(userSettings, settings);
    normalized = {
      ...normalized,
      products: preserveAdminCampaignFields(normalized.products, settings.products)
    };
    assertSafeArmedUpdate(settings, normalized);
    if (normalized.scheduledOpenEnabled && new Date(normalized.scheduledOpenAt).getTime() <= Date.now()) {
      throw new Error("Choose a future date and time for the single store schedule.");
    }
    assertNoNewPastProductSchedules(normalized.products, settings.products, Date.now());
    if (normalized.automationEnabled && !wasArmed) {
      normalized = { ...normalized, automationRunId: crypto.randomUUID(), monitoringPaused: false };
    }
    reconcileProductExecutionContexts(
      runtimeState,
      previousProducts,
      normalized.products,
      normalized.automationRunId
    );
    settings = normalized;
    if (settings.discordChannelId !== previousDiscordChannelId) {
      resetDiscordChannel(settings.discordChannelId);
    }
    persistSettings();
    configVersion += 1;
    status = createInitialStatus();
    persistRuntimeState();
    resetProductStatuses();
    lastNotificationAt.clear();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:bulk-import", (_event, text) => {
    const input = String(text || "");
    if (input.length > 50_000) {
      throw new Error("The bulk import is too large. Paste no more than 50,000 characters.");
    }
    if (settings.automationEnabled) {
      throw new Error("Switch Autopilot off before importing missions.");
    }
    const plan = planBulkImport(input, settings.products);
    const nextSnapshot = plan.additions.length
      ? appendMissionProducts(
          plan.additions,
          `${plan.additions.length} disabled watch mission${plan.additions.length === 1 ? "" : "s"} imported for review.`
        )
      : snapshot();
    return {
      snapshot: nextSnapshot,
      summary: plan.summary,
      issues: plan.issues
    };
  });

  ipcMain.handle("cart-assist:stop-all", () => {
    stopEpoch += 1;
    discordConnectionEpoch += 1;
    discordNextPollAt = 0;
    quietAbortRegistry.abortAll();
    storeOpenQueue.cancelPending();
    openRequests.cancelAll();
    settings = {
      ...settings,
      automationEnabled: false,
      monitoringPaused: true,
      scheduledOpenEnabled: false,
      products: settings.products.map((product) => (
        product.openAt ? { ...product, openAt: "" } : product
      ))
    };
    runtimeState.productExecutionContexts = {};
    persistSettings();
    persistRuntimeState();
    configVersion += 1;
    status = {
      ...status,
      lastMessage: "Stopped. Autopilot off, monitoring paused, queued openings cancelled, scheduled times cleared."
    };
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:open-product", (_event, productId) => openProduct(productId));
  ipcMain.handle("cart-assist:open-buy-list", (_event, input = {}) => openBuyList("", {
    backgroundFirst: input?.backgroundFirst === true
  }));
  ipcMain.handle("cart-assist:open-cart", (_event, retailer) => openStorePage(retailer, "cartUrl"));
  ipcMain.handle("cart-assist:open-orders", (_event, retailer) => openStorePage(retailer, "ordersUrl"));

  ipcMain.handle("cart-assist:copy-affiliate-link", (_event, input) => {
    const destination = validateRetailerShareUrl(input?.affiliateUrl, {
      retailer: input?.retailer,
      sku: input?.sku
    });
    clipboard.writeText(destination.url);
    return destination;
  });

  ipcMain.handle("cart-assist:discord-connect", async (_event, input) => {
    if (
      !safeStorage.isEncryptionAvailable()
      || safeStorage.getSelectedStorageBackend?.() === "basic_text"
    ) {
      throw new Error("Secure operating-system credential storage is unavailable. Cart Confirm will not save a Discord token in plaintext.");
    }
    const channelId = normalizeSnowflake(input?.channelId || settings.discordChannelId);
    const token = String(input?.token || "").trim() || discordToken;
    if (!token) throw new Error("Paste an official Discord bot token to connect.");

    // A later Connect, Disconnect, or Forget action supersedes this request.
    // Guard again after Discord responds so a slow validation cannot restore a
    // credential the user removed while it was in flight.
    const connectEpoch = ++discordConnectionEpoch;

    // Validate channel access before changing the active connection. Neither
    // the token nor Discord response bodies are ever written to the feed.
    const setup = await getDiscordChannelSetup(token, channelId);
    if (connectEpoch !== discordConnectionEpoch) {
      throw new Error("That Discord connection request was cancelled before it completed.");
    }
    saveDiscordToken(discordTokenPath(), token, safeStorage);

    const channelChanged = channelId !== settings.discordChannelId;
    if (channelChanged) runtimeState.discord = emptyDiscordRuntime(channelId);
    discordToken = token;
    discordRoleNames = setup.roleNames;
    discordChannelReady = true;
    discordNextPollAt = 0;
    settings = normalizeSettings({
      ...settings,
      discordEnabled: true,
      discordChannelId: channelId
    }, settings);
    runtimeState.discord.channelId = channelId;
    runtimeState.discord.channelName = setup.channelName;
    runtimeState.discord.lastError = "";
    persistSettings();
    persistRuntimeState();
    broadcast();
    await pollDiscordSignals();
    return snapshot();
  });

  ipcMain.handle("cart-assist:discord-disconnect", () => {
    discordConnectionEpoch += 1;
    discordChannelReady = false;
    discordRoleNames = {};
    discordNextPollAt = 0;
    settings = { ...settings, discordEnabled: false };
    runtimeState.discord.lastError = "";
    persistSettings();
    persistRuntimeState();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:discord-forget", () => {
    discordConnectionEpoch += 1;
    clearDiscordToken(discordTokenPath());
    discordToken = "";
    discordChannelReady = false;
    discordRoleNames = {};
    discordNextPollAt = 0;
    settings = { ...settings, discordEnabled: false };
    runtimeState.discord.lastError = "";
    persistSettings();
    persistRuntimeState();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:discord-clear-signals", () => {
    runtimeState.signals = [];
    persistRuntimeState();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:open-signal", (_event, signalId, entry) => (
    openSignal(signalId, String(entry || "product"))
  ));

  ipcMain.handle("cart-assist:show-extension", () => {
    shell.showItemInFolder(path.join(extensionPath(), "manifest.json"));
    return extensionPath();
  });
  ipcMain.handle("cart-assist:copy-extension-path", () => {
    clipboard.writeText(extensionPath());
    return extensionPath();
  });
  ipcMain.handle("cart-assist:clear-events", () => {
    events = [];
    persistRuntimeState();
    broadcast();
    return snapshot();
  });
  ipcMain.handle("cart-assist:test-event", () => {
    if (!companionPort) throw new Error("The local companion server is not running.");
    if (settings.automationEnabled) throw new Error("Switch Autopilot off before testing.");
    return openBuyList();
  });
}

// --- Quiet monitor: rotating read-only background stock checks ---
// While Autopilot is on, missions without a live tab get their product pages
// fetched (no cookies, no cart actions) round-robin per store, inside the
// same per-store spacing and 120-action hourly budget. A verified stock flip
// opens the real page in Chrome, where the in-tab pipeline re-verifies
// everything before acting. Amazon pages rarely expose structured data to
// plain fetches, so quiet checks cover Target and Walmart.
const QUIET_MIN_SPACING_MS = 30_000;
const QUIET_TAB_FRESH_MS = 90_000;
const QUIET_FETCH_TIMEOUT_MS = 8_000;
const QUIET_FAILURE_LIMIT = 4;
const QUIET_AUTO_OPEN_COOLDOWN_MS = 5 * 60_000;
const QUIET_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const quietState = {
  lastCheckAt: new Map(),
  rotation: new Map(),
  lastAvailability: new Map(),
  failures: new Map(),
  lastAutoOpenAt: new Map(),
  disabledStores: new Set()
};

function recordQuietEvent(rawEvent, taskEpoch) {
  if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
  try {
    const event = validateEvent(rawEvent);
    const product = settings.products.find((candidate) => candidate.id === event.productId);
    if (!product || productCalendarOwned(settings, product)) return;
    const current = productStatuses[product.id] || createProductStatus(product);
    productStatuses = {
      ...productStatuses,
      [product.id]: reduceProductStatus(current, event)
    };
    addEvent(event);
    broadcast();
  } catch {
    // A malformed synthetic event is dropped rather than crashing the tick.
  }
}

async function quietCheck(product, taskEpoch) {
  const retailer = product.retailer;
  if (!monitoringOperationActive(settings, taskEpoch, stopEpoch) || productCalendarOwned(settings, product)) return;
  const controller = quietAbortRegistry.create();
  const timer = setTimeout(() => controller.abort(), QUIET_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(product.productUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": QUIET_USER_AGENT,
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    if (!response.ok) {
      if ([429, 502, 503, 504].includes(response.status)) {
        storeOverloadUntil.set(retailer, Date.now() + settings.overloadCooldownSeconds * 1000);
        persistRuntimeState();
      }
      throw new Error(`status ${response.status}`);
    }
    const body = await response.text();
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    const currentProduct = settings.products.find((candidate) => candidate.id === product.id);
    if (!currentProduct?.enabled || productCalendarOwned(settings, currentProduct)) return;
    const outcome = checkProductPage(body, retailer, product.sku);
    if (outcome.availability === "unknown") throw new Error("unreadable");

    quietState.failures.set(retailer, 0);
    const previous = quietState.lastAvailability.get(product.id);
    quietState.lastAvailability.set(product.id, outcome.availability);
    if (previous !== outcome.availability) {
      recordQuietEvent({
        eventType: "availability",
        productId: product.id,
        retailer,
        sku: product.sku,
        availability: outcome.availability,
        price: outcome.price === null ? undefined : outcome.price,
        page: product.productUrl,
        timestamp: new Date().toISOString()
      }, taskEpoch);
    }
    if (outcome.availability === "available" && previous !== "available") {
      if (Date.now() - (quietState.lastAutoOpenAt.get(product.id) || 0) > QUIET_AUTO_OPEN_COOLDOWN_MS) {
        quietState.lastAutoOpenAt.set(product.id, Date.now());
        notifyOnce(
          `quiet-stock:${product.id}`,
          `${retailerLabel(retailer)} stock detected`,
          `${product.title || product.sku} looks in stock — opening it in Chrome now.`,
          true
        );
        void openProduct(product.id, {
          actionKind: "background-stock-open",
          resumeMonitoring: false,
          stopEpoch: taskEpoch
        }).catch(() => {});
      }
    }
  } catch {
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    const failures = (quietState.failures.get(retailer) || 0) + 1;
    quietState.failures.set(retailer, failures);
    if (failures === QUIET_FAILURE_LIMIT) {
      quietState.disabledStores.add(retailer);
      status = {
        ...status,
        lastMessage: `${retailerLabel(retailer)} background checks are unavailable (blocked or unreadable). Keep a ${retailerLabel(retailer)} tab open in Chrome instead.`
      };
      broadcast();
    }
  } finally {
    clearTimeout(timer);
    quietAbortRegistry.release(controller);
  }
}

function quietMonitorTick() {
  if (!settings.automationEnabled || settings.monitoringPaused) return;
  const now = Date.now();
  for (const retailer of QUIET_STORES) {
    if (quietState.disabledStores.has(retailer)) continue;
    if ((storeOverloadUntil.get(retailer) || 0) > now) continue;
    const spacing = Math.max(QUIET_MIN_SPACING_MS, Number(settings.watcherIntervalSeconds || 60) * 1000);
    if (now - (quietState.lastCheckAt.get(retailer) || 0) < spacing) continue;
    const missions = settings.products.filter((product) => (
      product.enabled
      && product.retailer === retailer
      && !productCalendarOwned(settings, product)
      && productExecutionMode(runtimeState, product.id, settings.automationRunId) === "watcher"
      && now - (productTabSeenAt.get(product.id) || 0) > QUIET_TAB_FRESH_MS
    ));
    if (!missions.length) continue;
    const rotation = (quietState.rotation.get(retailer) ?? -1) + 1;
    quietState.rotation.set(retailer, rotation);
    const mission = missions[rotation % missions.length];
    const budget = reserveStoreAction(retailer, "background-check");
    if (!budget.allowed) {
      quietState.lastCheckAt.set(retailer, now);
      continue;
    }
    quietState.lastCheckAt.set(retailer, now);
    void quietCheck(mission, stopEpoch);
  }
}

function clearProductOpenAt(productId) {
  settings = {
    ...settings,
    products: settings.products.map((product) => (
      product.id === productId ? { ...product, openAt: "" } : product
    ))
  };
  persistSettings();
  configVersion += 1;
}

function handleProductSchedule(decision) {
  const product = settings.products.find((candidate) => candidate.id === decision.productId);
  if (!product) return;
  const label = product.title || `${retailerLabel(product.retailer)} ${product.sku}`;
  if (decision.action === "fire") {
    activateBlitzExecution(
      runtimeState,
      [product],
      settings.automationRunId,
      decision.key,
      Date.now()
    );
  }
  runtimeState.productScheduleReceipts[decision.key] = {
    status: decision.action === "fire" ? "firing" : "missed",
    recordedAt: new Date().toISOString()
  };
  persistRuntimeState();

  if (decision.action === "missed") {
    status = {
      ...status,
      lastMessage: `The scheduled opening for ${label} was missed by more than two minutes. Save a new future time.`
    };
    notifyOnce(`product-schedule-missed:${decision.key}`, "Scheduled opening missed", `${label} was not opened. Save a new future time.`, true);
    broadcast();
    return;
  }

  // Clearing calendar ownership is the exact browser-release boundary. A
  // missed schedule deliberately keeps its past openAt value so an already
  // open tab cannot interpret "missed" as permission to run late.
  clearProductOpenAt(decision.productId);
  status = { ...status, lastMessage: `Scheduled opening: ${label} is opening now.` };
  broadcast();
  const taskEpoch = stopEpoch;
  void openProduct(decision.productId, {
    spacingMs: QUEUE_FANOUT_SPACING_MS,
    actionKind: "scheduled-drop"
  })
    .then((result) => {
      if (taskEpoch !== stopEpoch || result?.via === "cancelled") return;
      runtimeState.productScheduleReceipts[decision.key] = {
        status: "fired",
        recordedAt: new Date().toISOString()
      };
      persistRuntimeState();
      notifyOnce(
        `product-schedule:${decision.key}`,
        `${retailerLabel(product.retailer)} scheduled opening`,
        `${label} was opened at its scheduled time.`,
        true
      );
    })
    .catch((error) => {
      if (taskEpoch !== stopEpoch) return;
      notifyOnce(`product-schedule-error:${decision.key}`, "Scheduled opening failed", error.message, true);
    });
}

function startScheduler() {
  schedulerTimer = setInterval(() => {
    if (status.companion === "connected" && status.lastHeartbeatAt) {
      const heartbeatAge = Date.now() - new Date(status.lastHeartbeatAt).getTime();
      if (heartbeatAge > 30_000) {
        status = { ...status, companion: "waiting" };
        broadcast();
      }
    }

    quietMonitorTick();

    // Startup and Stop are hard pause boundaries. Scheduled work remains
    // pending until an explicit Arm, Test, or Open action resumes monitoring.
    if (settings.monitoringPaused) return;

    for (const productDecision of evaluateProductSchedules(
      settings.products,
      runtimeState?.productScheduleReceipts,
      Date.now()
    )) {
      handleProductSchedule(productDecision);
    }

    const decision = evaluateSchedule(settings, runtimeState?.scheduleReceipt, Date.now());
    if (decision.action === "missed") {
      runtimeState.scheduleReceipt = {
        key: decision.key,
        status: "missed",
        recordedAt: new Date().toISOString()
      };
      settings = { ...settings, scheduledOpenEnabled: false };
      persistSettings();
      persistRuntimeState();
      notifyOnce(
        "scheduled-open-missed",
        "Scheduled buy list was not opened",
        "The scheduled time was missed by more than two minutes. Save a new future time.",
        true
      );
      broadcast();
      return;
    }
    if (decision.action !== "fire") return;

    const scheduledRetailer = settings.scheduledRetailer;
    const scheduledProducts = settings.products.filter((product) => (
      product.enabled && product.retailer === scheduledRetailer
    ));
    activateBlitzExecution(
      runtimeState,
      scheduledProducts,
      settings.automationRunId,
      decision.key,
      Date.now()
    );
    runtimeState.scheduleReceipt = {
      key: decision.key,
      status: "firing",
      recordedAt: new Date().toISOString()
    };
    settings = { ...settings, scheduledOpenEnabled: false };
    persistSettings();
    persistRuntimeState();
    broadcast();

    const taskEpoch = stopEpoch;
    void openBuyList(scheduledRetailer, {
      spacingMs: QUEUE_FANOUT_SPACING_MS,
      actionKind: "scheduled-drop"
    })
      .then(() => {
        if (taskEpoch !== stopEpoch) return;
        runtimeState.scheduleReceipt = {
          key: decision.key,
          status: "fired",
          recordedAt: new Date().toISOString()
        };
        persistRuntimeState();
        notifyOnce(
          "scheduled-open",
          `${retailerLabel(scheduledRetailer)} buy list opened`,
          "The single scheduled time was reached. Enabled products for the selected store are opening.",
          true
        );
      })
      .catch((error) => {
        if (taskEpoch !== stopEpoch) return;
        notifyOnce("scheduled-open-error", "Scheduled buy list could not open", error.message, true);
      });
  }, 1000);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.kevinyang.cartconfirm");
    loadSettings();
    loadPersistedRuntimeState();
    discordToken = loadDiscordToken(discordTokenPath(), safeStorage);
    if (hasDiscordToken(discordTokenPath()) && !discordToken) {
      settings = { ...settings, discordEnabled: false };
      runtimeState.discord.lastError = "The saved Discord token could not be decrypted on this computer. Paste a replacement token or remove the saved token.";
      persistSettings();
      persistRuntimeState();
    }
    registerIpc();

    try {
      await startCompanionServer();
    } catch (error) {
      dialog.showErrorBox("Companion server error", error.message);
    }

    createWindow();
    startScheduler();
    startDiscordPoller();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (discordPollTimer) clearInterval(discordPollTimer);
  if (companionServer) companionServer.close();
});
