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

const {
  DEFAULT_SETTINGS,
  createInitialStatus,
  createProductStatus,
  matchingProduct,
  normalizeSettings,
  reduceProductStatus,
  reduceStatus,
  validateEvent
} = require("./lib/core");
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

let mainWindow = null;
let companionServer = null;
let companionPort = 0;
let settings = null;
let status = createInitialStatus();
let productStatuses = {};
let events = [];
let scheduledOpenKey = "";
let schedulerTimer = null;
let configVersion = 1;
const lastNotificationAt = new Map();

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
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
    settings = normalizeSettings(stored, DEFAULT_SETTINGS);
  } catch {
    settings = normalizeSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS);
  }

  if (settings.automationEnabled && !settings.automationRunId) {
    settings = { ...settings, automationRunId: crypto.randomUUID() };
  }

  resetProductStatuses();
  persistSettings();
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
}

function notifyOnce(key, title, body, force = false) {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  if (!force && now - (lastNotificationAt.get(key) || 0) < NOTIFICATION_COOLDOWN_MS) return;
  lastNotificationAt.set(key, now);
  new Notification({ title, body, silent: false }).show();
}

async function openExternalRetailer(url) {
  const { parsed } = parseRetailUrl(url);
  await shell.openExternal(parsed.href, { activate: true });
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
  await openExternalRetailer(product.productUrl);
  return product.id;
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

  for (const [index, product] of enabledProducts.entries()) {
    await openExternalRetailer(product.productUrl);
    if (index < enabledProducts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  return enabledProducts.length;
}

async function openStorePage(retailer, type) {
  const url = storeUrl(String(retailer || ""), type);
  if (!url) throw new Error("Choose a supported store.");
  await openExternalRetailer(url);
  return url;
}

function validateProductEvent(event) {
  if (event.eventType === "heartbeat") return { event, product: null };

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
  }
}

function handleCompanionEvent(rawEvent) {
  const validated = validateEvent(rawEvent);
  const result = validateProductEvent(validated);
  if (result.error) return { accepted: false, reason: result.error };

  const { event, product } = result;
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

function corsOrigin(req) {
  const origin = String(req.headers.origin || "");
  return origin.startsWith("chrome-extension://") ? origin : "";
}

function hasAllowedLocalOrigin(req) {
  const origin = String(req.headers.origin || "");
  return origin === "" || origin.startsWith("chrome-extension://");
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

function extensionConfig() {
  return {
    products: settings.products,
    automationEnabled: settings.automationEnabled,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
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
        res.statusCode = origin ? 204 : 403;
        if (origin) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cart-Assist-Token");
          res.setHeader("Access-Control-Max-Age", "600");
          res.setHeader("Vary", "Origin");
        }
        res.end();
        return;
      }

      if (!hasAllowedLocalOrigin(req)) {
        writeJson(req, res, 403, { error: "extension-origin-required" });
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/config") {
        writeJson(req, res, 200, extensionConfig());
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/event") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }

        let body = "";
        let tooLarge = false;

        req.on("data", (chunk) => {
          if (tooLarge) return;
          body += chunk;
          if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
            tooLarge = true;
            writeJson(req, res, 413, { error: "payload-too-large" });
          }
        });

        req.on("end", () => {
          if (tooLarge) return;
          try {
            const eventResult = handleCompanionEvent(JSON.parse(body));
            writeJson(req, res, eventResult.accepted ? 202 : 200, eventResult);
          } catch (error) {
            writeJson(req, res, 400, { error: error.message });
          }
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
    settings = normalizeSettings(nextSettings, settings);
    if (settings.automationEnabled && !wasArmed) {
      settings = { ...settings, automationRunId: crypto.randomUUID() };
    }
    persistSettings();
    configVersion += 1;
    scheduledOpenKey = "";
    status = createInitialStatus();
    events = [];
    resetProductStatuses();
    lastNotificationAt.clear();
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

    if (!settings.scheduledOpenEnabled || !settings.scheduledOpenAt) return;
    const targetTime = new Date(settings.scheduledOpenAt).getTime();
    if (Number.isNaN(targetTime) || Date.now() < targetTime) return;

    const enabledIds = settings.products
      .filter((product) => product.enabled && product.retailer === settings.scheduledRetailer)
      .map((product) => product.id)
      .join(",");
    const key = `${settings.scheduledRetailer}:${enabledIds}:${settings.scheduledOpenAt}`;
    if (scheduledOpenKey === key) return;

    scheduledOpenKey = key;
    void openBuyList(settings.scheduledRetailer)
      .then(() => {
        notifyOnce(
          "scheduled-open",
          `${retailerLabel(settings.scheduledRetailer)} buy list opened`,
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
