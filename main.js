"use strict";

const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  shell
} = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const {
  DEFAULT_SETTINGS,
  assertSafeArmedUpdate,
  createInitialStatus,
  createProductStatus,
  matchingProduct,
  normalizeSettings,
  reduceProductStatus,
  reduceStatus,
  validateEvent
} = require("./lib/core");
const { migrateStoredSettings } = require("./lib/migrations");
const { consumeStoreAction } = require("./lib/action-budget");
const { evaluateSchedule } = require("./lib/schedule");
const { loadRuntimeState, saveRuntimeState } = require("./lib/runtime-state");
const { isAllowedExtensionOrigin, isTrustedCompanionRequest } = require("./lib/extension-identity");
const { createStoreOpenQueue } = require("./lib/store-open-queue");
const { createOpenRequestStore } = require("./lib/open-requests");
const { findChrome } = require("./lib/chrome-launcher");
const {
  RETAILERS,
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
const pendingNavigationKeys = new Set();
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
  if (startupWasDisarmed) {
    settings = { ...settings, automationEnabled: false };
  }

  resetProductStatuses();
  persistSettings();
}

function loadPersistedRuntimeState() {
  runtimeState = loadRuntimeState(runtimeStatePath());
  events = runtimeState.events;
  storeOverloadUntil.clear();
  for (const [retailer, deadline] of Object.entries(runtimeState.storeOverloadUntil)) {
    if (deadline > Date.now()) storeOverloadUntil.set(retailer, deadline);
  }
  if (startupWasDisarmed) {
    status = {
      ...status,
      lastMessage: "Automation was disarmed when Cart Confirm started. Review the current run and arm it again explicitly."
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
    products: settings.products,
    automationEnabled: settings.automationEnabled,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
    scheduledOpenEnabled: settings.scheduledOpenEnabled,
    scheduledOpenAt: settings.scheduledOpenAt,
    scheduledRetailer: settings.scheduledRetailer,
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

function addEvent(event) {
  if (event.eventType === "heartbeat") return;
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
  const result = consumeStoreAction(
    runtimeState?.storeActionHistory?.[retailer],
    now,
    undefined,
    storeOverloadUntil.get(retailer) || 0
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

async function openExternalRetailer(url) {
  const { parsed, retailer } = parseRetailUrl(url);
  const navigationKey = `${retailer}|${parsed.href}`;
  if (pendingNavigationKeys.has(navigationKey)) {
    return { retailer, url: parsed.href, via: "already-queued" };
  }
  pendingNavigationKeys.add(navigationKey);
  try {
    const result = await storeOpenQueue.enqueue(retailer, async () => {
      const taskEpoch = stopEpoch;
      const budget = reserveStoreAction(retailer, "desktop-navigation");
      if (!budget.allowed) {
        throw new Error(`${retailerLabel(retailer)} reached the fixed 120-action hourly safety budget.`);
      }
      // Ask a connected companion to reuse an existing store tab first; a
      // request nobody claims falls back to opening a fresh page.
      if (companionTabLikely(retailer)) {
        const request = openRequests.add(retailer, parsed.href);
        if (await openRequests.waitForClaim(request.id, COMPANION_CLAIM_TIMEOUT_MS)) {
          return { retailer, url: parsed.href, via: "companion-tab" };
        }
      }
      if (taskEpoch !== stopEpoch) return { retailer, url: parsed.href, via: "cancelled" };
      const via = await openPageInChrome(parsed.href);
      return { retailer, url: parsed.href, via };
    });
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

async function openProduct(productId) {
  const product = productId
    ? findProduct(productId)
    : settings.products.find((candidate) => candidate.enabled);
  if (!product) throw new Error("Enable at least one product first.");
  const opened = await openExternalRetailer(product.productUrl);
  return { productId: product.id, via: opened.via };
}

async function openBuyList(retailer = "") {
  const enabledProducts = settings.products.filter((product) => (
    product.enabled && (!retailer || product.retailer === retailer)
  ));
  if (!enabledProducts.length) {
    throw new Error(retailer
      ? `Enable at least one ${retailerLabel(retailer)} product first.`
      : "Enable at least one product first.");
  }

  const results = await Promise.all(enabledProducts.map((product) => openExternalRetailer(product.productUrl)));
  return {
    count: results.filter((result) => !["already-queued", "cancelled"].includes(result.via)).length,
    reused: results.filter((result) => result.via === "companion-tab").length,
    deduped: results.filter((result) => result.via === "already-queued").length,
    defaultBrowser: results.some((result) => result.via === "default-browser"),
    armed: settings.automationEnabled
  };
}

async function openStorePage(retailer, type) {
  const url = storeUrl(String(retailer || ""), type);
  if (!url) throw new Error("Choose a supported store.");
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

function sendEventNotification(event, product) {
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
  const store = retailerLabel(product.retailer);
  const key = `${product.id}:${event.eventType}:${event.reason || ""}`;

  if (event.eventType === "offer-observed" && event.eligible) {
    notifyOnce(
      key,
      `${store} offer is eligible`,
      `${product.sku} is first-party at $${event.price.toFixed(2)} (cap $${product.maxPrice.toFixed(2)}).`
    );
  } else if (event.eventType === "automation-blocked") {
    notifyOnce(key, `${store} safety check stopped`, event.message || "The offer did not pass every configured check.");
  } else if (event.eventType === "cart-item-confirmed") {
    notifyOnce(key, `${store} cart confirmed`, `${product.sku}, quantity ${product.quantity}, is in the cart.`);
  } else if (event.eventType === "checkout-reached") {
    notifyOnce(key, `${store} checkout reached`, "The browser companion is validating the order review before submission.");
  } else if (event.eventType === "order-confirmed") {
    notifyOnce(key, `${store} order confirmed`, `${product.sku} reached an order-confirmation page.`, true);
  } else if (event.eventType === "review-ready") {
    notifyOnce(key, `${store} final review ready`, "Review the complete order in the browser and submit it manually.", true);
  } else if (event.eventType === "queue-waiting") {
    notifyOnce(key, `${store} purchase queue`, "The companion is waiting for the official retailer queue without refreshing it.");
  }
}

function handleCompanionEvent(rawEvent) {
  const validated = validateEvent(rawEvent);
  const result = validateProductEvent(validated);
  if (result.error) return { accepted: false, reason: result.error };

  const { event, product } = result;
  if (event.retailer && RETAILERS[event.retailer]) {
    retailerTabSeenAt.set(event.retailer, Date.now());
  }
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
  sendEventNotification(event, product);
  broadcast();
  return { accepted: true };
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
    products: settings.products,
    automationEnabled: settings.automationEnabled,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
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
        writeJson(req, res, 200, { requests: openRequests.pending() });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/open-requests/claim") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => {
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
      webSecurity: true
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
    let normalized = normalizeSettings(nextSettings, settings);
    assertSafeArmedUpdate(settings, normalized);
    if (normalized.scheduledOpenEnabled && new Date(normalized.scheduledOpenAt).getTime() <= Date.now()) {
      throw new Error("Choose a future date and time for the single store schedule.");
    }
    if (normalized.automationEnabled && !wasArmed) {
      normalized = { ...normalized, automationRunId: crypto.randomUUID() };
    }
    settings = normalized;
    persistSettings();
    configVersion += 1;
    status = createInitialStatus();
    persistRuntimeState();
    resetProductStatuses();
    lastNotificationAt.clear();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:stop-all", () => {
    stopEpoch += 1;
    storeOpenQueue.cancelPending();
    openRequests.cancelAll();
    settings = { ...settings, automationEnabled: false, scheduledOpenEnabled: false };
    persistSettings();
    configVersion += 1;
    status = {
      ...status,
      lastMessage: "Stopped. Automation disarmed, queued page openings cancelled, and the schedule cleared."
    };
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:open-product", (_event, productId) => openProduct(productId));
  ipcMain.handle("cart-assist:open-buy-list", () => openBuyList());
  ipcMain.handle("cart-assist:open-cart", (_event, retailer) => openStorePage(retailer, "cartUrl"));
  ipcMain.handle("cart-assist:open-orders", (_event, retailer) => openStorePage(retailer, "ordersUrl"));

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
    return { ok: true, companionPort };
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
    runtimeState.scheduleReceipt = {
      key: decision.key,
      status: "firing",
      recordedAt: new Date().toISOString()
    };
    settings = { ...settings, scheduledOpenEnabled: false };
    persistSettings();
    persistRuntimeState();
    broadcast();

    void openBuyList(scheduledRetailer)
      .then(() => {
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
    registerIpc();

    try {
      await startCompanionServer();
    } catch (error) {
      dialog.showErrorBox("Companion server error", error.message);
    }

    createWindow();
    startScheduler();
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
  if (companionServer) companionServer.close();
});
