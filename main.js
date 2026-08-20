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
const { checkForUpdate, downloadUpdate, userFacingReleaseNotes } = require("./lib/app-update");
const { checkoutTrustWithEvidence, combinedOrderStatus } = require("./lib/core");

const {
  DEFAULT_SETTINGS,
  MAX_PRODUCTS,
  applyCheckoutPreflight,
  assertSafeArmedUpdate,
  createInitialStatus,
  createProductStatus,
  matchingProduct,
  missionOpenUrl,
  normalizeProductImageUrl,
  normalizeSettings,
  preserveAdminCampaignFields,
  preserveCheckoutEvidence,
  reduceProductStatus,
  reduceStatus,
  toAutomationProduct,
  toRendererProduct,
  validateEvent
} = require("./lib/core");
const { planBulkImport, quickAddMission } = require("./lib/mission-import");
const { formatMissionList, selectedMissionProducts } = require("./lib/mission-list");
const {
  acceptCatalogResults,
  beginCatalogSearch,
  clearCatalogState,
  emptyCatalogState,
  normalizeCatalogState,
  officialSearchUrl,
  planCatalogMissionImport,
  planWalmartPrepCandidates
} = require("./lib/catalog");
const {
  acceptTrackalackerCapture,
  beginTrackalackerImport,
  cancelTrackalackerImport,
  clearTrackalackerState,
  emptyTrackalackerState,
  normalizeTrackalackerState,
  normalizeTrackalackerUrl,
  planTrackalackerMissionImport
} = require("./lib/trackalacker-import");
const { migrateStoredSettings } = require("./lib/migrations");
const { itemProfileById } = require("./lib/item-defaults");
const { itemHasProtectedProgress } = require("./lib/item-missions");
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
  productExecutionContext,
  productExecutionMode,
  queueCaptureForProduct,
  reconcileProductExecutionContexts,
  registerQueueCapture,
  reserveQueueCaptureAttempt,
  saveRuntimeState
} = require("./lib/runtime-state");
const { isAllowedExtensionOrigin, isTrustedCompanionRequest } = require("./lib/extension-identity");
const { createStoreOpenQueue } = require("./lib/store-open-queue");
const { createOpenRequestStore } = require("./lib/open-requests");
const { findChrome } = require("./lib/chrome-launcher");
const {
  companionConnectionReady,
  selectConnectionBootstrap,
  waitForCompanionConnection
} = require("./lib/companion-startup");
const {
  assertQuietProductResponse,
  checkProductPage,
  looksLikeSecurityChallenge,
  readBoundedHtml
} = require("./lib/quiet-monitor");
const {
  QUIET_DISPATCH_TICK_MS,
  createQuietMonitorSchedule,
  deferQuietMonitorStore,
  markQuietMonitorFinished,
  markQuietMonitorStarted,
  nextQuietMonitorCandidate,
  reconcileQuietMonitorSchedule,
  resetQuietMonitorSchedule
} = require("./lib/quiet-monitor-scheduler");
const { consumeQuietRead } = require("./lib/quiet-read-budget");
const { registerProductFailure, registerStoreFailure } = require("./lib/quiet-monitor-failures");
const { isOverloadStatus, parseRetryAfter } = require("./lib/traffic-status");
const {
  conditionalHeaders,
  walmartPrepObservation,
  walmartPrepTransition
} = require("./lib/walmart-prep-monitor");
const {
  createActivityEvent,
  notificationDeliveryMode,
  shouldRecordActivity
} = require("./lib/activity");
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
const {
  clearEncryptedCredential,
  hasEncryptedCredential,
  loadEncryptedCredential,
  normalizeOpenAiApiKey,
  saveEncryptedCredential
} = require("./lib/secure-credential");
const {
  approveMsrpSuggestion,
  emptyMsrpResearchState,
  normalizeMsrpResearchState,
  researchIsDue,
  researchMsrpWithOpenAi
} = require("./lib/msrp-research");
const { processDiscordMessageBatch } = require("./lib/discord-ingestion");
const { upsertSignal } = require("./lib/signal-inbox");
const { planSignalRoute } = require("./lib/signal-routing");
const { validateRetailerShareUrl } = require("./lib/howl-link");
const {
  RETAILERS,
  extractSku,
  normalizeProductUrl,
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
const SIMULTANEOUS_CLAIM_TIMEOUT_MS = 250;
// Desktop-initiated openings (manual, test, scheduled) are one page load each,
// so they use a short fixed stagger; the configured per-store spacing governs
// the extension's automatic retry navigation.
const DESKTOP_OPEN_SPACING_MS = 3_000;
const DESKTOP_DROP_SPACING_MS = 1_000;
const DISCORD_POLL_INTERVAL_MS = 2_500;
const DISCORD_ERROR_RETRY_MS = 10_000;
const QUIET_STORES = Object.freeze(["target", "walmart"]);
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60_000;

let mainWindow = null;
let companionServer = null;
let companionPort = 0;
let settings = null;
let status = createInitialStatus();
let productStatuses = {};
let events = [];
let runtimeState = null;
let catalogState = emptyCatalogState();
let trackalackerState = emptyTrackalackerState();
let msrpResearchState = emptyMsrpResearchState();
let msrpResearchInFlight = false;
let msrpResearchKey = "";
let startupWasDisarmed = false;
let schedulerTimer = null;
let quietMonitorTimer = null;
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
let updateInFlight = false;
let updateDiscoveryPromise = null;
let updateCheckTimer = null;
let availableUpdatePlan = null;
let updaterRevision = 0;
let updaterState = { status: "idle", revision: updaterRevision };
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

function catalogPath() {
  return path.join(app.getPath("userData"), "catalog.json");
}

function trackalackerPath() {
  return path.join(app.getPath("userData"), "trackalacker-import.json");
}

function discordTokenPath() {
  return path.join(app.getPath("userData"), "discord-bot-token.bin");
}

function msrpResearchPath() {
  return path.join(app.getPath("userData"), "msrp-research.json");
}

function msrpResearchKeyPath() {
  return path.join(app.getPath("userData"), "openai-msrp-key.bin");
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
  events = [];
  for (const event of runtimeState.events) {
    if (shouldRecordActivity(events, event)) events.push(event);
  }
  runtimeState.events = events;
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

function loadCatalogState() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(catalogPath(), "utf8"));
  } catch {
    stored = {};
  }
  catalogState = normalizeCatalogState(stored);
  persistCatalogState();
}

function persistCatalogState() {
  fs.mkdirSync(path.dirname(catalogPath()), { recursive: true });
  fs.writeFileSync(catalogPath(), JSON.stringify(catalogState, null, 2), { mode: 0o600 });
}

function loadTrackalackerState() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(trackalackerPath(), "utf8"));
  } catch {
    stored = {};
  }
  trackalackerState = normalizeTrackalackerState(stored);
  persistTrackalackerState();
}

function persistTrackalackerState() {
  fs.mkdirSync(path.dirname(trackalackerPath()), { recursive: true });
  fs.writeFileSync(trackalackerPath(), JSON.stringify(trackalackerState, null, 2), { mode: 0o600 });
}

function loadMsrpResearchState() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(msrpResearchPath(), "utf8"));
  } catch {
    stored = {};
  }
  msrpResearchState = normalizeMsrpResearchState(stored, settings.msrpCatalog);
  persistMsrpResearchState();
}

function persistMsrpResearchState() {
  fs.mkdirSync(path.dirname(msrpResearchPath()), { recursive: true });
  fs.writeFileSync(msrpResearchPath(), JSON.stringify(msrpResearchState, null, 2), { mode: 0o600 });
}

async function runMsrpResearch() {
  if (settings.automationEnabled) throw new Error("Switch Autopilot off before researching MSRP defaults.");
  if (msrpResearchInFlight) throw new Error("MSRP research is already running.");
  if (!msrpResearchKey) throw new Error("Configure an OpenAI API key before researching prices.");
  msrpResearchInFlight = true;
  msrpResearchState = { ...msrpResearchState, lastError: "" };
  broadcast();
  try {
    const result = await researchMsrpWithOpenAi({ apiKey: msrpResearchKey, catalog: settings.msrpCatalog });
    msrpResearchState = normalizeMsrpResearchState({
      ...msrpResearchState,
      lastRunAt: result.researchedAt,
      lastError: "",
      suggestions: result.suggestions
    }, settings.msrpCatalog);
    persistMsrpResearchState();
  } catch (error) {
    msrpResearchState = {
      ...msrpResearchState,
      lastRunAt: new Date().toISOString(),
      lastError: error.message || "MSRP research failed."
    };
    persistMsrpResearchState();
    throw error;
  } finally {
    msrpResearchInFlight = false;
    broadcast();
  }
  return snapshot();
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
    products: settings.products.map((product) => {
      const context = productExecutionContext(runtimeState, product.id, settings.automationRunId);
      return {
        ...toRendererProduct(product),
        executionMode: context ? "blitz" : "watcher",
        executionExpiresAt: context?.expiresAt || 0,
        executionCohortId: context?.cohortId || ""
      };
    }),
    missionGroups: settings.missionGroups,
    automationEnabled: settings.automationEnabled,
    monitoringPaused: settings.monitoringPaused,
    automationRunId: settings.automationRunId,
    fastMode: settings.fastMode,
    combinedOrderEnabled: settings.combinedOrderEnabled,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    eligibilityRefreshIntervalSeconds: settings.eligibilityRefreshIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
    watcherIntervalSeconds: settings.watcherIntervalSeconds,
    blitzRetryDelayMs: settings.blitzRetryDelayMs,
    blitzWindowSeconds: settings.blitzWindowSeconds,
    scheduledBlitzDurationSeconds: settings.scheduledBlitzDurationSeconds,
    walmartQueueCaptureReloads: settings.walmartQueueCaptureReloads,
    walmartPrepCandidates: settings.walmartPrepCandidates,
    scheduledOpenEnabled: settings.scheduledOpenEnabled,
    scheduledOpenAt: settings.scheduledOpenAt,
    scheduledRetailer: settings.scheduledRetailer,
    discordEnabled: settings.discordEnabled,
    discordChannelId: settings.discordChannelId,
    discordAutoOpen: settings.discordAutoOpen,
    configurationProfiles: settings.configurationProfiles,
    msrpCatalog: settings.msrpCatalog,
    itemProfiles: settings.itemProfiles,
    defaultItemProfileId: settings.defaultItemProfileId,
    orderTaxPercent: settings.orderTaxPercent,
    storeOrderAllowances: settings.storeOrderAllowances,
    msrpResearchEnabled: settings.msrpResearchEnabled,
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
    catalog: catalogState,
    trackalacker: trackalackerState,
    msrpResearch: {
      configured: hasEncryptedCredential(msrpResearchKeyPath()),
      credentialUsable: Boolean(msrpResearchKey),
      enabled: settings.msrpResearchEnabled,
      due: researchIsDue(msrpResearchState),
      inFlight: msrpResearchInFlight,
      lastRunAt: msrpResearchState.lastRunAt,
      lastError: msrpResearchState.lastError,
      suggestions: msrpResearchState.suggestions
    },
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
      extensionPath: extensionPath(),
      update: { ...updaterState }
    }
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cart-assist:update", snapshot());
  }
}

function publishUpdaterState(payload) {
  updaterRevision += 1;
  updaterState = { ...payload, revision: updaterRevision };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cart-assist:updater-state", updaterState);
  }
}

function automaticUpdatesSupported() {
  return app.isPackaged && process.platform === "win32" && process.arch === "x64";
}

async function refreshUpdateAvailability() {
  if (!automaticUpdatesSupported()) {
    availableUpdatePlan = null;
    publishUpdaterState({
      status: "unavailable",
      message: "Automatic updates are available in the packaged 64-bit Windows app."
    });
    return null;
  }
  if (updateDiscoveryPromise) return updateDiscoveryPromise;

  const currentVersion = app.getVersion();
  const knownVersion = availableUpdatePlan?.version || "";
  publishUpdaterState({
    status: "checking",
    currentVersion,
    ...(knownVersion ? { version: knownVersion } : {})
  });
  const discovery = (async () => {
    try {
      const plan = await checkForUpdate(currentVersion);
      availableUpdatePlan = plan;
      if (!plan) {
        publishUpdaterState({ status: "current", currentVersion });
        return null;
      }
      publishUpdaterState({
        status: "available",
        version: plan.version,
        prerelease: plan.prerelease
      });
      return plan;
    } catch (error) {
      publishUpdaterState({
        status: "error",
        ...(knownVersion ? { version: knownVersion } : {}),
        message: error.message || "The update check failed."
      });
      throw error;
    }
  })();
  updateDiscoveryPromise = discovery;
  try {
    return await discovery;
  } finally {
    if (updateDiscoveryPromise === discovery) updateDiscoveryPromise = null;
  }
}

function startUpdateChecks() {
  void refreshUpdateAvailability().catch(() => {});
  if (!automaticUpdatesSupported()) return;
  updateCheckTimer = setInterval(() => {
    if (updateInFlight) return;
    void refreshUpdateAvailability().catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS);
}

function launchVerifiedInstaller(installerPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(installerPath, ["--updated", "/S", "--force-run"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function pauseAutomationForUpdate() {
  stopEpoch += 1;
  quietAbortRegistry.abortAll();
  resetQuietMonitorSchedule(quietState.schedule);
  storeOpenQueue.cancelPending();
  openRequests.cancelAll();
  settings = { ...settings, automationEnabled: false, monitoringPaused: true };
  runtimeState.productExecutionContexts = {};
  runtimeState.queueCaptures = {};
  persistSettings();
  persistRuntimeState();
  configVersion += 1;
  status = {
    ...status,
    lastMessage: "Update verified. Automation paused while Cart Confirm installs and relaunches."
  };
  broadcast();
}

function updateApprovalDetail(plan) {
  const unsigned = plan.prerelease || plan.tagName.startsWith("unsigned-");
  const releaseNotes = userFacingReleaseNotes(plan.releaseNotes)
    || "A newer Cart Confirm version is ready. No change summary was provided for this release.";
  const installDetail = unsigned
    ? "This release is intentionally unsigned. Windows may show Unknown publisher or a Microsoft Defender SmartScreen warning. If you continue, Cart Confirm will download the official GitHub Setup asset, verify its exact SHA-256 checksum, install it, close this version, and relaunch."
    : "Cart Confirm will download the official GitHub Setup asset, verify its exact SHA-256 checksum, install it, close this version, and relaunch.";
  return [
    `What's new in v${plan.version}`,
    "",
    releaseNotes,
    "",
    installDetail
  ].join("\n");
}

async function installAvailableUpdate() {
  if (updateInFlight) {
    return {
      status: "busy",
      ...(availableUpdatePlan?.version ? { version: availableUpdatePlan.version } : {})
    };
  }
  if (!automaticUpdatesSupported()) {
    return {
      status: "unavailable",
      message: "Automatic updates are available in the packaged 64-bit Windows app."
    };
  }

  updateInFlight = true;
  let installLaunched = false;
  try {
    const currentVersion = app.getVersion();
    const plan = await refreshUpdateAvailability();
    if (!plan) {
      return { status: "current", currentVersion };
    }

    const unsigned = plan.prerelease || plan.tagName.startsWith("unsigned-");
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: unsigned ? "warning" : "info",
      buttons: ["Download and install", "Not now"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: "Cart Confirm update available",
      message: `Cart Confirm v${plan.version} is available.`,
      detail: updateApprovalDetail(plan)
    });
    if (confirmation.response !== 0) {
      publishUpdaterState({ status: "cancelled", version: plan.version });
      return { status: "cancelled", version: plan.version };
    }

    let lastProgress = -1;
    const downloaded = await downloadUpdate(
      plan,
      path.join(app.getPath("userData"), "verified-updates"),
      ({ phase, received, total }) => {
        const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0;
        if (phase === "downloading" && percent === lastProgress) return;
        if (phase === "downloading") lastProgress = percent;
        publishUpdaterState({ status: phase, version: plan.version, received, total, percent });
      }
    );
    publishUpdaterState({ status: "installing", version: plan.version });
    pauseAutomationForUpdate();
    await launchVerifiedInstaller(downloaded.installerPath);
    installLaunched = true;
    setTimeout(() => app.quit(), 500);
    return { status: "installing", version: plan.version };
  } catch (error) {
    publishUpdaterState({
      status: "error",
      ...(availableUpdatePlan?.version ? { version: availableUpdatePlan.version } : {}),
      message: error.message || "The update failed."
    });
    throw error;
  } finally {
    if (!installLaunched) updateInFlight = false;
  }
}

function appendMissionProducts(additions, message) {
  if (!Array.isArray(additions) || !additions.length) return snapshot();
  if (settings.automationEnabled) {
    throw new Error("Switch Autopilot off before adding items.");
  }
  if (settings.products.length + additions.length > MAX_PRODUCTS) {
    throw new Error(`An item plan can contain at most ${MAX_PRODUCTS} store options.`);
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
  status = { ...status, lastMessage: String(message || "Items added.").slice(0, 240) };
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
    const profile = itemProfileById(settings.defaultItemProfileId, settings.itemProfiles);
    product = quickAddMission(input, {
      profile,
      msrpCatalog: settings.msrpCatalog,
      orderTaxPercent: settings.orderTaxPercent,
      storeOrderAllowances: settings.storeOrderAllowances
    });
  } catch (error) {
    return {
      statusCode: 400,
      payload: { ok: false, reason: "invalid-product", error: error.message }
    };
  }
  const existing = settings.products.find((candidate) => candidate.id === product.id);
  if (existing) {
    // A repeat capture can safely enrich display/link metadata without
    // changing price, quantity, action, fulfillment, or any purchase state.
    // quickAddMission already constrained both references to this retailer.
    const affiliateUpdated = Boolean(product.affiliateOpenUrl)
      && product.affiliateOpenUrl !== existing.affiliateOpenUrl;
    const imageUpdated = Boolean(product.imageUrl)
      && product.imageUrl !== existing.imageUrl;
    if (affiliateUpdated || imageUpdated) {
      settings = {
        ...settings,
        products: settings.products.map((candidate) => (
          candidate.id === existing.id
            ? {
                ...candidate,
                ...(affiliateUpdated ? { affiliateOpenUrl: product.affiliateOpenUrl } : {}),
                ...(imageUpdated ? { imageUrl: product.imageUrl } : {})
              }
            : candidate
        ))
      };
      const captured = [
        affiliateUpdated ? "affiliate link" : "",
        imageUpdated ? "product thumbnail" : ""
      ].filter(Boolean).join(" and ");
      status = {
        ...status,
        lastMessage: `${existing.title || existing.sku} kept its item settings; its ${captured} from Chrome ${affiliateUpdated && imageUpdated ? "were" : "was"} attached.`.slice(0, 240)
      };
      persistSettings();
      configVersion += 1;
      broadcast();
    }
    return {
      statusCode: 200,
      payload: {
        ok: true,
        duplicate: true,
        affiliateUpdated,
        imageUpdated,
        product: { id: existing.id, title: existing.title, maxPrice: existing.maxPrice }
      }
    };
  }
  if (settings.products.length >= MAX_PRODUCTS) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "mission-limit", error: `The item plan already contains ${MAX_PRODUCTS} store options.` }
    };
  }

  appendMissionProducts(
    [product],
    `${product.title || `${retailerLabel(product.retailer)} ${product.sku}`} was added from Chrome with ${product.action === "checkout" ? "the auto-buy" : "the selected"} item profile.`
  );
  return {
    statusCode: 201,
    payload: {
      ok: true,
      duplicate: false,
      product: {
        id: product.id,
        title: product.title,
        maxPrice: product.maxPrice,
        maxOrderTotal: product.maxOrderTotal,
        action: product.action,
        fulfillmentMode: product.fulfillmentMode,
        enabled: product.enabled
      }
    }
  };
}

function approveCheckoutPreflightRequest(input) {
  if (settings.automationEnabled) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "automation-armed", error: "Switch Autopilot off before approving checkout preflight." }
    };
  }
  const productId = String(input?.productId || "").slice(0, 80);
  try {
    const preflightedProducts = applyCheckoutPreflight(settings.products, productId, input?.evidence);
    const approvedProduct = preflightedProducts.find((candidate) => candidate.id === productId);
    settings = {
      ...settings,
      products: preflightedProducts,
      // The approved destination and payment fingerprints become the
      // account-level checkout profile for this store and fulfillment mode,
      // so other auto-submit missions inherit them instead of accepting
      // whatever destination the live page happens to show.
      checkoutTrust: checkoutTrustWithEvidence(settings.checkoutTrust, approvedProduct, approvedProduct?.checkoutEvidence)
    };
    persistSettings();
    configVersion += 1;
    status = {
      ...status,
      lastMessage: `${retailerLabel(productId.split(":", 1)[0])} checkout preflight approved with hashed destination and payment evidence.`
    };
    broadcast();
    const product = settings.products.find((candidate) => candidate.id === productId);
    return {
      statusCode: 200,
      payload: {
        ok: true,
        productId,
        capturedAt: product?.checkoutEvidence?.capturedAt || ""
      }
    };
  } catch (error) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "checkout-preflight-rejected", error: error.message }
    };
  }
}

function authorizeOperatorResolutionRequest(input) {
  if (settings.automationEnabled) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "automation-armed", error: "Switch Autopilot off before resolving a held item." }
    };
  }
  const productId = String(input?.productId || "").slice(0, 80);
  const product = settings.products.find((candidate) => candidate.id === productId);
  if (!product || input?.checkedOrderHistory !== true || input?.abandonMission !== true) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "operator-resolution-rejected", error: "The exact item/store option and explicit order-history acknowledgment are required." }
    };
  }
  return { statusCode: 200, payload: { ok: true, productId: product.id } };
}

function catalogResultsRequest(input) {
  try {
    const accepted = acceptCatalogResults(catalogState, input, Date.now());
    catalogState = accepted.state;
    persistCatalogState();
    broadcast();
    return {
      statusCode: 202,
      payload: { ok: true, accepted: accepted.accepted }
    };
  } catch (error) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "catalog-search-mismatch", error: error.message }
    };
  }
}

function trackalackerCaptureRequest(input) {
  try {
    const accepted = acceptTrackalackerCapture(trackalackerState, input, Date.now());
    trackalackerState = accepted.state;
    persistTrackalackerState();
    configVersion += 1;
    broadcast();
    return {
      statusCode: 202,
      payload: {
        ok: true,
        accepted: accepted.accepted,
        state: trackalackerState.activeImport?.state || ""
      }
    };
  } catch (error) {
    return {
      statusCode: 409,
      payload: { ok: false, reason: "trackalacker-capture-rejected", error: error.message }
    };
  }
}

async function startTrackalackerImport() {
  if (settings.automationEnabled) {
    throw new Error("Switch Autopilot off before scanning TrackaLacker.");
  }
  trackalackerState = beginTrackalackerImport(trackalackerState, {
    id: crypto.randomUUID(),
    now: Date.now()
  });
  persistTrackalackerState();
  configVersion += 1;
  broadcast();
  const url = "https://www.trackalacker.com/products/followed";
  const via = await openPageInChrome(url);
  return { snapshot: snapshot(), via, url };
}

function cancelActiveTrackalackerImport() {
  trackalackerState = cancelTrackalackerImport(trackalackerState, Date.now());
  persistTrackalackerState();
  configVersion += 1;
  broadcast();
  return snapshot();
}

async function startCatalogSearch(input) {
  if (settings.automationEnabled) {
    throw new Error("Switch Autopilot off before searching retailer catalogs.");
  }
  catalogState = beginCatalogSearch(catalogState, input, {
    id: crypto.randomUUID(),
    now: Date.now()
  });
  persistCatalogState();
  configVersion += 1;
  broadcast();

  const openings = await Promise.all(catalogState.activeSearch.retailers.map(async (retailer) => ({
    retailer,
    url: officialSearchUrl(retailer, catalogState.activeSearch.query),
    via: await openPageInChrome(officialSearchUrl(retailer, catalogState.activeSearch.query))
  })));
  return { snapshot: snapshot(), openings };
}

function addEvent(event, options = {}) {
  const product = settings?.products?.find((candidate) => candidate.id === event.productId) || null;
  const activity = createActivityEvent(event, {
    automationEnabled: settings?.automationEnabled === true,
    product,
    runId: settings?.automationRunId
  });
  if (!activity || !shouldRecordActivity(events, activity)) return false;
  events = [
    activity,
    ...events
  ].sort((left, right) => (
    Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "")
  )).slice(0, MAX_EVENTS);
  if (options.persist !== false) persistRuntimeState();
  return true;
}

function recordWatchStarts(products) {
  const timestamp = new Date().toISOString();
  let recorded = false;
  for (const product of [...(products || [])].reverse()) {
    recorded = addEvent({
      eventType: "watch-started",
      productId: product.id,
      retailer: product.retailer,
      sku: product.sku,
      page: product.productUrl,
      timestamp
    }, { persist: false }) || recorded;
  }
  if (recorded) {
    persistRuntimeState();
    broadcast();
  }
  return recorded;
}

function notifyOnce(key, title, body, force = false, activity = {}, options = {}) {
  const now = Date.now();
  if (!force && now - (lastNotificationAt.get(key) || 0) < NOTIFICATION_COOLDOWN_MS) return false;
  lastNotificationAt.set(key, now);
  const desktopSupported = options.desktop !== false && Notification.isSupported();
  if (desktopSupported) new Notification({ title, body, silent: false }).show();
  const recorded = addEvent({
    eventType: "notification-sent",
    productId: activity.productId || "",
    retailer: activity.retailer || "",
    sku: activity.sku || "",
    notificationKey: String(key || ""),
    sourceEventType: activity.sourceEventType || "",
    message: `Notified: ${title} — ${body}`,
    timestamp: new Date(now).toISOString()
  });
  if (recorded) broadcast();
  return desktopSupported;
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
  const spacingMs = Number.isFinite(requestedSpacing) && requestedSpacing >= 0
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
        const request = openRequests.add(retailer, parsed.href, {
          productId,
          contextRequired,
          dedicatedTab: options.dedicatedTab === true,
          background: options.background === true,
          signalOrderLimit: Number.isInteger(options.signalOrderLimit) ? options.signalOrderLimit : null
        });
        const claimTimeoutMs = options.parallel === true && options.dedicatedTab === true
          ? SIMULTANEOUS_CLAIM_TIMEOUT_MS
          : COMPANION_CLAIM_TIMEOUT_MS;
        if (await openRequests.waitForClaim(request.id, claimTimeoutMs)) {
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
    }, { spacingMs, parallel: options.parallel === true });
    return result?.cancelled ? { retailer, url: parsed.href, via: "cancelled" } : result;
  } finally {
    pendingNavigationKeys.delete(navigationKey);
  }
}

function findProduct(productId) {
  const product = settings.products.find((candidate) => candidate.id === productId);
  if (!product) throw new Error("That store option is no longer in the item plan.");
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
  if (!product) throw new Error("Enable at least one store option first.");
  const requestedUrl = String(options.urlOverride || missionOpenUrl(product));
  const requested = parseRetailUrl(requestedUrl);
  const requestedSku = extractSku(requested.retailer, requested.parsed.href);
  if (requested.retailer !== product.retailer || requestedSku !== product.sku) {
    throw new Error("The requested signal entry does not match this item's store and product ID.");
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
  const directEntry = options.productEntry !== true
    && ![product.productUrl, missionOpenUrl(product)].includes(requested.parsed.href);
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
    directFallback: opened.directFallback === true,
    signalOrderLimit: Number.isInteger(options.signalOrderLimit) ? options.signalOrderLimit : null
  };
}

async function openMissionProduct(productId) {
  const product = findProduct(productId);
  return openProduct(product.id, {
    urlOverride: missionOpenUrl(product),
    productEntry: true,
    actionKind: "mission-open"
  });
}

async function ensureCompanionConnection(plan, prepCandidates) {
  if (!companionPort) throw new Error("The local companion server is not running.");
  if (companionConnectionReady(status)) {
    return { connected: true, opened: false, productId: "", retailer: "", via: "existing" };
  }

  const bootstrap = selectConnectionBootstrap(plan, prepCandidates);
  if (!bootstrap) throw new Error("Enable at least one supported store option before connecting Chrome.");
  const startedAt = Date.now();
  const opened = await openExternalRetailer(missionOpenUrl(bootstrap), {
    productId: bootstrap.id,
    actionKind: "companion-bootstrap"
  });
  if (opened.via === "default-browser") {
    throw new Error("Google Chrome was not found. Install Chrome and load the bundled Cart Confirm companion before using Autopilot or Test.");
  }
  if (["cancelled", "already-queued"].includes(opened.via) && !companionConnectionReady(status)) {
    throw new Error("The Chrome connection page could not be opened. Wait for the current store opening to finish and try again.");
  }

  await waitForCompanionConnection(() => ({ status, companionHello }), {
    startedAt,
    onVersionMismatch: async () => {
      // The bundled unpacked extension reloads itself when the desktop version
      // changes. Open the mission again after that reload so Chrome injects the
      // new content script into a fresh tab and can send its first heartbeat.
      await new Promise((resolve) => setTimeout(resolve, 750));
      const retried = await openExternalRetailer(missionOpenUrl(bootstrap), {
        productId: bootstrap.id,
        actionKind: "companion-version-reload"
      });
      if (retried.via === "default-browser") {
        throw new Error("Google Chrome was not found while reconnecting the updated companion.");
      }
    }
  });
  return {
    connected: true,
    opened: opened.via === "chrome",
    productId: bootstrap.id,
    retailer: bootstrap.retailer,
    via: opened.via
  };
}

async function openBuyList(retailer = "", options = {}) {
  const plan = planImmediateProductOpenings(settings, retailer);
  const prepCandidates = (settings.walmartPrepCandidates || []).filter((candidate) => (
    !retailer || candidate.retailer === retailer
  ));
  if (!plan.enabled.length) {
    if (!prepCandidates.length) throw new Error(retailer
      ? `Enable at least one ${retailerLabel(retailer)} product first.`
      : "Enable at least one product or add a Walmart prep candidate first.");
  }

  resumeMonitoring();
  const { backgroundFirst = false, ensureCompanion = false, ...openOptions } = options;
  const connection = ensureCompanion
    ? await ensureCompanionConnection(plan, prepCandidates)
    : { connected: companionConnectionReady(status), opened: false, productId: "", retailer: "", via: "" };
  if (backgroundFirst && settings.automationEnabled) recordWatchStarts(plan.ready);
  const backgroundProducts = backgroundFirst
    ? plan.ready.filter((product) => (
        QUIET_STORES.includes(product.retailer)
        && productExecutionMode(runtimeState, product.id, settings.automationRunId) === "watcher"
      ))
    : [];
  const backgroundIds = new Set(backgroundProducts.map((product) => product.id));
  const browserProducts = plan.ready.filter((product) => !backgroundIds.has(product.id));
  const bootstrapIsBrowserProduct = connection.opened
    && browserProducts.some((product) => product.id === connection.productId);
  const bootstrapIsBackgroundProduct = connection.opened
    && backgroundProducts.some((product) => product.id === connection.productId);
  const productsToOpen = bootstrapIsBrowserProduct
    ? browserProducts.filter((product) => product.id !== connection.productId)
    : browserProducts;
  const results = await Promise.all(productsToOpen.map((product) => (
    openExternalRetailer(missionOpenUrl(product), { ...openOptions, productId: product.id })
  )));
  return {
    count: results.filter((result) => !["already-queued", "cancelled"].includes(result.via)).length
      + Number(bootstrapIsBrowserProduct),
    reused: results.filter((result) => result.via === "companion-tab").length,
    deduped: results.filter((result) => result.via === "already-queued").length,
    defaultBrowser: results.some((result) => result.via === "default-browser"),
    background: backgroundProducts.length - Number(bootstrapIsBackgroundProduct),
    prepMonitoring: prepCandidates.length,
    scheduled: plan.scheduled.length,
    armed: settings.automationEnabled,
    connectionOpened: connection.opened,
    connectionProductId: connection.productId,
    connectionRetailer: connection.retailer
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
      true,
      { retailer: event.retailer, sourceEventType: event.eventType }
    );
    return;
  }
  if (!product) return;
  const deliveryMode = notificationDeliveryMode(product.alertLevel, event.eventType);
  if (deliveryMode === "none") return;
  const force = product.alertLevel === "alarm";
  const store = retailerLabel(product.retailer);
  const key = `${product.id}:${event.eventType}:${event.reason || ""}`;
  const activity = {
    productId: product.id,
    retailer: product.retailer,
    sku: product.sku,
    sourceEventType: event.eventType
  };

  if (event.eventType === "offer-observed" && event.eligible) {
    notifyOnce(
      key,
      `${store} offer is eligible`,
      `${product.title || product.sku} is first-party at $${event.price.toFixed(2)} (cap $${product.maxPrice.toFixed(2)}).`,
      force,
      activity
    );
  } else if (event.eventType === "automation-blocked") {
    notifyOnce(
      key,
      `${store} safety check stopped`,
      event.message || "The offer did not pass every configured check.",
      false,
      activity,
      { desktop: deliveryMode === "desktop" }
    );
  } else if (event.eventType === "cart-reached") {
    notifyOnce(key, `${store} cart is open`, `${product.title || product.sku} — the cart page is on screen. Be ready to complete the purchase.`, force, activity);
  } else if (event.eventType === "cart-item-confirmed") {
    notifyOnce(key, `${store} cart confirmed`, event.message || `${product.title || product.sku}, quantity ${event.quantity ?? product.quantity}, is in the cart.`, force, activity);
  } else if (event.eventType === "checkout-reached") {
    // The copy must match what the mission is actually authorized to do:
    // claiming an imminent automatic submission for a cart-only or manual
    // mission reads as a stall when nothing more was ever going to happen.
    notifyOnce(key, `${store} checkout reached`, product.action === "checkout"
      ? "The browser companion is validating the order review before submission."
      : product.action === "review"
        ? "The browser companion is validating the order review; you submit the final order."
        : "Checkout is open. This item only carts automatically — complete the purchase there yourself.", false, activity);
  } else if (event.eventType === "order-confirmed") {
    notifyOnce(key, `${store} order confirmed`, `${product.sku} reached an order-confirmation page.`, true, activity);
  } else if (event.eventType === "review-ready") {
    notifyOnce(key, `${store} final review ready`, "Review the complete order in the browser and submit it manually.", true, activity);
  } else if (event.eventType === "queue-waiting") {
    notifyOnce(
      key,
      `${store} purchase queue`,
      queueFanout
        ? `Official queue active. Opening ${queueFanout.productIds.length} other enabled store option${queueFanout.productIds.length === 1 ? "" : "s"} together; scheduled Walmart loser tabs may use their configured bounded final reloads.`
        : "The companion is waiting for the official retailer queue without refreshing it.",
      false,
      activity
    );
  }
}

function triggerQueueFanout(event) {
  if (!runtimeState) return null;
  const queuedProductIds = Object.entries(productStatuses)
    .filter(([, productStatus]) => productStatus?.reason === "retailer-queue")
    .map(([productId]) => productId);
  const capture = queueCaptureForProduct(
    runtimeState,
    event.productId,
    settings.automationRunId,
    Date.now()
  );
  const decision = planQueueFanout({
    settings,
    event,
    capture,
    receipts: runtimeState.queueFanoutReceipts,
    queuedProductIds
  });
  if (!decision) return null;

  const recordedAt = new Date().toISOString();
  runtimeState.queueFanoutReceipts[decision.key] = { status: "firing", recordedAt };
  persistRuntimeState();
  status = {
    ...status,
    lastMessage: `Official ${retailerLabel(decision.retailer)} queue detected. Opening ${decision.productIds.length} other enabled store option${decision.productIds.length === 1 ? "" : "s"} together; queued tabs freeze while scheduled loser tabs use bounded final reloads.`
  };

  const runId = settings.automationRunId;
  const taskEpoch = stopEpoch;
  void Promise.allSettled(decision.productIds.map((productId) => openProduct(productId, {
    spacingMs: decision.spacingMs,
    parallel: decision.parallel,
    dedicatedTab: decision.dedicatedTab,
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
        lastMessage: `${retailerLabel(decision.retailer)} queue fan-out finished, but ${unsuccessful} store option${unsuccessful === 1 ? "" : "s"} could not open because a safety budget, Stop, or browser action blocked it.`
      };
      notifyOnce(
        `queue-fanout-partial:${decision.key}`,
        `${retailerLabel(decision.retailer)} queue fan-out incomplete`,
        `${unsuccessful} store option${unsuccessful === 1 ? "" : "s"} did not open. Cart Confirm will not repeat the burst automatically.`,
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
    spacingMs: DESKTOP_DROP_SPACING_MS,
    actionKind: `discord-signal-${route.entry}`,
    resumeMonitoring: false,
    stopEpoch: taskEpoch,
    signalOrderLimit: route.signalOrderLimit
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
    if (requestedEntry !== "product") throw new Error("Add this product as a desired item before using a direct store entry.");
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
    spacingMs: DESKTOP_DROP_SPACING_MS,
    actionKind: `discord-signal-manual-${requestedEntry}`,
    signalOrderLimit: route.signalOrderLimit
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
  if (product && event.imageUrl && event.imageUrl !== product.imageUrl) {
    settings = {
      ...settings,
      products: settings.products.map((candidate) => (
        candidate.id === product.id ? { ...candidate, imageUrl: event.imageUrl } : candidate
      ))
    };
    persistSettings();
    configVersion += 1;
  }
  if (event.retailer && RETAILERS[event.retailer]) {
    retailerTabSeenAt.set(event.retailer, Date.now());
  }
  if (product) productTabSeenAt.set(product.id, Date.now());
  if (event.eventType === "traffic-overload") {
    const previousCooldown = storeOverloadUntil.get(event.retailer) || 0;
    if (event.cooldownUntil <= previousCooldown) return { accepted: true, deduped: true };
    pauseQuietStore(
      event.retailer,
      event.cooldownUntil,
      `${retailerLabel(event.retailer)} public monitoring paused with the browser traffic cooldown.`
    );
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
  let queueCapture = null;
  if (
    event.eventType === "queue-waiting"
    && event.availability !== "unavailable"
    && product
  ) {
    const registration = registerQueueCapture(
      runtimeState,
      product,
      settings.automationRunId,
      Date.now()
    );
    queueCapture = registration.capture;
    if (registration.created) {
      persistRuntimeState();
      configVersion += 1;
    }
  }
  const queueFanout = event.eventType === "queue-waiting" && product
    ? triggerQueueFanout(event)
    : null;
  sendEventNotification(event, product, queueFanout);
  broadcast();
  return {
    accepted: true,
    openRequestDrainMs: queueFanout?.openRequestDrainMs || 0,
    queueCapture
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
  const activeCatalogSearch = catalogState.activeSearch
    && new Date(catalogState.activeSearch.expiresAt).getTime() > Date.now()
    ? {
        id: catalogState.activeSearch.id,
        query: catalogState.activeSearch.query,
        retailers: catalogState.activeSearch.retailers,
        expiresAt: catalogState.activeSearch.expiresAt
      }
    : null;
  const activeTrackalackerImport = trackalackerState.activeImport
    && ["waiting", "scanning"].includes(trackalackerState.activeImport.state)
    && new Date(trackalackerState.activeImport.expiresAt).getTime() > Date.now()
    ? {
        id: trackalackerState.activeImport.id,
        startedAt: trackalackerState.activeImport.startedAt,
        expiresAt: trackalackerState.activeImport.expiresAt
      }
    : null;
  return {
    // Howl source and resolved tracking URLs are sharing-only. Chrome receives
    // only the canonical purchasing fields used by the automation pipeline.
    products: settings.products.map((product) => {
      const context = productExecutionContext(runtimeState, product.id, settings.automationRunId);
      return {
        ...toAutomationProduct(product),
        // Affiliate-first navigation target: affiliate open link, then the
        // admin campaign link, then the canonical product link. All three are
        // validated against this mission's exact store and item ID.
        openUrl: missionOpenUrl(product),
        calendarOwned: productCalendarOwned(settings, product),
        calendarOpenAt: productCalendarTime(settings, product),
        executionMode: context ? "blitz" : "watcher",
        executionExpiresAt: context?.expiresAt || 0,
        executionCohortId: context?.cohortId || ""
      };
    }),
    automationEnabled: settings.automationEnabled,
    monitoringPaused: settings.monitoringPaused,
    automationRunId: settings.automationRunId,
    queueCaptures: runtimeState.queueCaptures,
    fastMode: settings.fastMode,
    retryIntervalSeconds: settings.retryIntervalSeconds,
    eligibilityRefreshIntervalSeconds: settings.eligibilityRefreshIntervalSeconds,
    storeNavigationIntervalSeconds: settings.storeNavigationIntervalSeconds,
    overloadCooldownSeconds: settings.overloadCooldownSeconds,
    watcherIntervalSeconds: settings.watcherIntervalSeconds,
    blitzRetryDelayMs: settings.blitzRetryDelayMs,
    blitzWindowSeconds: settings.blitzWindowSeconds,
    scheduledBlitzDurationSeconds: settings.scheduledBlitzDurationSeconds,
    walmartQueueCaptureReloads: settings.walmartQueueCaptureReloads,
    firstPartyOnly: true,
    checkoutTrust: settings.checkoutTrust,
    combinedOrder: combinedOrderStatus(
      settings,
      productStatuses,
      (product) => productCalendarOwned(settings, product)
    ),
    catalogSearch: activeCatalogSearch,
    trackalackerImport: activeTrackalackerImport,
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

      if (req.method === "POST" && requestUrl.pathname === "/missions/checkout-preflight") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => approveCheckoutPreflightRequest(body));
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/missions/operator-resolution/authorize") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => authorizeOperatorResolutionRequest(body));
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/catalog/results") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => catalogResultsRequest(body));
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/trackalacker/capture") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => trackalackerCaptureRequest(body));
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

      if (req.method === "POST" && requestUrl.pathname === "/queue-capture/reserve") {
        if (req.headers["x-cart-assist-token"] !== settings.companionToken) {
          writeJson(req, res, 401, { error: "invalid-token" });
          return;
        }
        readJsonRequest(req, res, (body) => {
          if (!monitoringActive(settings)) {
            return { statusCode: 409, payload: { ok: false, reason: "disarmed" } };
          }
          const product = settings.products.find((candidate) => (
            candidate.enabled
            && candidate.id === String(body?.productId || "")
            && candidate.retailer === "walmart"
          ));
          if (!product) return { statusCode: 409, payload: { ok: false, reason: "product-disabled" } };
          const result = reserveQueueCaptureAttempt(runtimeState, {
            productId: product.id,
            runId: settings.automationRunId,
            reservationId: body?.reservationId,
            limit: settings.walmartQueueCaptureReloads,
            now: Date.now()
          });
          if (result.ok) persistRuntimeState();
          return { statusCode: result.ok ? 200 : 409, payload: result };
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
  ipcMain.handle("cart-assist:install-update", () => installAvailableUpdate());
  ipcMain.handle("cart-assist:check-for-updates", async () => {
    if (!automaticUpdatesSupported()) {
      return { status: "unavailable", currentVersion: app.getVersion() };
    }
    try {
      const plan = await refreshUpdateAvailability();
      return plan
        ? { status: "available", version: plan.version }
        : { status: "current", currentVersion: app.getVersion() };
    } catch (error) {
      return { status: "error", message: error.message || "The update check failed." };
    }
  });

  ipcMain.handle("cart-assist:save-settings", (_event, nextSettings) => {
    const wasArmed = settings.automationEnabled;
    const previousProducts = settings.products;
    const previousDiscordChannelId = settings.discordChannelId;
    const userSettings = nextSettings && typeof nextSettings === "object"
      ? {
          ...nextSettings,
          products: Array.isArray(nextSettings.products)
            ? nextSettings.products.map((product) => ({
                ...toAutomationProduct(product),
                groupId: String(product?.groupId || ""),
                imageUrl: normalizeProductImageUrl(product?.imageUrl, product?.retailer),
                affiliateOpenUrl: String(product?.affiliateOpenUrl || "")
              }))
            : nextSettings.products
        }
      : nextSettings;
    const requestedAutomationEnabled = userSettings?.automationEnabled !== undefined
      ? Boolean(userSettings.automationEnabled)
      : settings.automationEnabled;
    let normalized = normalizeSettings({
      ...userSettings,
      // Normalize and compare the renderer's untrusted mission fields before
      // the desktop reattaches any existing approval. The armed validation is
      // then run a second time against the resulting trusted contracts.
      automationEnabled: false
    }, settings);
    normalized = {
      ...normalized,
      products: preserveAdminCampaignFields(
        preserveCheckoutEvidence(normalized.products, settings.products),
        settings.products
      ),
      automationEnabled: requestedAutomationEnabled
    };
    normalized = normalizeSettings(normalized, settings);
    assertSafeArmedUpdate(settings, normalized);
    if (normalized.scheduledOpenEnabled && new Date(normalized.scheduledOpenAt).getTime() <= Date.now()) {
      throw new Error("Choose a future date and time for the single store schedule.");
    }
    assertNoNewPastProductSchedules(normalized.products, settings.products, Date.now());
    if (normalized.automationEnabled && !wasArmed) {
      normalized = { ...normalized, automationRunId: crypto.randomUUID(), monitoringPaused: false };
      runtimeState.queueCaptures = {};
      resetQuietMonitorSchedule(quietState.schedule);
      resetQuietProductState();
    } else if (wasArmed && !normalized.automationEnabled) {
      stopEpoch += 1;
      quietAbortRegistry.abortAll();
      resetQuietMonitorSchedule(quietState.schedule);
    }
    reconcileProductExecutionContexts(
      runtimeState,
      previousProducts,
      normalized.products,
      normalized.automationRunId
    );
    settings = normalized;
    const prepIds = new Set(settings.walmartPrepCandidates.map((candidate) => candidate.id));
    runtimeState.walmartPrepObservations = Object.fromEntries(
      Object.entries(runtimeState.walmartPrepObservations || {}).filter(([productId]) => prepIds.has(productId))
    );
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

  const bulkImportPlan = (text) => {
    const input = String(text || "");
    if (input.length > 50_000) {
      throw new Error("The bulk import is too large. Paste no more than 50,000 characters.");
    }
    if (settings.automationEnabled) {
      throw new Error("Switch Autopilot off before importing items.");
    }
    const profile = itemProfileById(settings.defaultItemProfileId, settings.itemProfiles);
    return planBulkImport(input, settings.products, MAX_PRODUCTS, {
      profile,
      msrpCatalog: settings.msrpCatalog,
      orderTaxPercent: settings.orderTaxPercent,
      storeOrderAllowances: settings.storeOrderAllowances
    });
  };

  ipcMain.handle("cart-assist:bulk-import-preview", (_event, text) => {
    const plan = bulkImportPlan(text);
    return { summary: plan.summary, issues: plan.issues };
  });

  ipcMain.handle("cart-assist:bulk-import", (_event, text) => {
    const plan = bulkImportPlan(text);
    const nextSnapshot = plan.additions.length
      ? appendMissionProducts(
          plan.additions,
          `${plan.additions.length} item${plan.additions.length === 1 ? "" : "s"} imported with the default item template.`
        )
      : snapshot();
    return {
      snapshot: nextSnapshot,
      summary: plan.summary,
      issues: plan.issues
    };
  });

  ipcMain.handle("cart-assist:catalog-search", (_event, input) => startCatalogSearch(input));

  ipcMain.handle("cart-assist:trackalacker-start", () => startTrackalackerImport());

  ipcMain.handle("cart-assist:trackalacker-cancel", () => cancelActiveTrackalackerImport());

  ipcMain.handle("cart-assist:trackalacker-add-missions", (_event, input) => {
    if (settings.automationEnabled) {
      throw new Error("Switch Autopilot off before adding TrackaLacker products to Items.");
    }
    const profile = itemProfileById(
      String(input?.profileId || settings.defaultItemProfileId),
      settings.itemProfiles
    );
    if (!profile) throw new Error("Choose a valid item profile before importing TrackaLacker products.");
    const plan = planTrackalackerMissionImport(
      trackalackerState,
      input?.selections,
      settings.products,
      MAX_PRODUCTS,
      {
        profile,
        msrpCatalog: settings.msrpCatalog,
        orderTaxPercent: settings.orderTaxPercent,
        storeOrderAllowances: settings.storeOrderAllowances
      }
    );
    const nextSnapshot = plan.additions.length
      ? appendMissionProducts(
          plan.additions,
          `${plan.summary.importedItems} TrackaLacker product${plan.summary.importedItems === 1 ? "" : "s"} added as ${plan.summary.importedStores} store option${plan.summary.importedStores === 1 ? "" : "s"}.`
        )
      : snapshot();
    return { snapshot: nextSnapshot, summary: plan.summary };
  });

  ipcMain.handle("cart-assist:trackalacker-clear", () => {
    trackalackerState = clearTrackalackerState();
    persistTrackalackerState();
    configVersion += 1;
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:trackalacker-open-source", async (_event, input) => {
    const kind = input?.kind === "history" ? "history" : "product";
    const url = normalizeTrackalackerUrl(input?.url, kind);
    if (!url) throw new Error("Only an exact TrackaLacker product or listing-history link can be opened.");
    return { via: await openPageInChrome(url), url };
  });

  ipcMain.handle("cart-assist:trackalacker-open-store", async (_event, input) => {
    const expectedRetailer = String(input?.retailer || "").toLowerCase();
    if (!["target", "walmart", "amazon"].includes(expectedRetailer)) {
      throw new Error("Only a supported TrackaLacker store option can be opened.");
    }
    const url = normalizeProductUrl(input?.url);
    const { retailer } = parseRetailUrl(url);
    const sku = extractSku(retailer, url);
    const expectedSku = extractSku(expectedRetailer, input?.sku);
    if (retailer !== expectedRetailer || !sku || sku !== expectedSku) {
      throw new Error("The TrackaLacker store link no longer matches its exact item ID.");
    }
    return openExternalRetailer(url, { actionKind: "trackalacker-preview" });
  });

  ipcMain.handle("cart-assist:catalog-add-missions", (_event, input) => {
    if (settings.automationEnabled) {
      throw new Error("Switch Autopilot off before adding catalog results to Items.");
    }
    const selectedIds = Array.isArray(input) ? input : input?.selectedIds;
    const requestedProfileId = Array.isArray(input)
      ? settings.defaultItemProfileId
      : String(input?.profileId || settings.defaultItemProfileId);
    const profile = itemProfileById(requestedProfileId, settings.itemProfiles);
    if (!profile) throw new Error("Choose a valid item profile before importing catalog results.");
    const plan = planCatalogMissionImport(catalogState, selectedIds, settings.products, MAX_PRODUCTS, {
      profile,
      msrpCatalog: settings.msrpCatalog,
      orderTaxPercent: settings.orderTaxPercent,
      storeOrderAllowances: settings.storeOrderAllowances
    });
    const nextSnapshot = plan.additions.length
      ? appendMissionProducts(
          plan.additions,
          `${plan.additions.length} catalog item${plan.additions.length === 1 ? "" : "s"} added with ${profile.name}.`
        )
      : snapshot();
    return { snapshot: nextSnapshot, summary: plan.summary };
  });

  ipcMain.handle("cart-assist:catalog-add-walmart-prep", (_event, input) => {
    if (settings.automationEnabled) throw new Error("Switch Autopilot off before adding Walmart prep candidates.");
    const profile = itemProfileById(String(input?.profileId || settings.defaultItemProfileId), settings.itemProfiles);
    const plan = planWalmartPrepCandidates(
      catalogState,
      input?.selectedIds,
      settings.products,
      settings.walmartPrepCandidates,
      {
        profile,
        msrpCatalog: settings.msrpCatalog,
        orderTaxPercent: settings.orderTaxPercent,
        storeOrderAllowances: settings.storeOrderAllowances,
        openAt: input?.openAt,
        now: Date.now()
      }
    );
    if (plan.additions.length) {
      settings = normalizeSettings({
        ...settings,
        walmartPrepCandidates: [...settings.walmartPrepCandidates, ...plan.additions]
      }, settings);
      persistSettings();
      for (const candidate of plan.additions) delete runtimeState.walmartPrepObservations[candidate.id];
      persistRuntimeState();
      configVersion += 1;
      status = { ...status, lastMessage: `${plan.additions.length} Walmart prep candidate${plan.additions.length === 1 ? "" : "s"} authorized for lightweight monitoring.` };
      broadcast();
    }
    return { snapshot: snapshot(), summary: plan.summary };
  });

  ipcMain.handle("cart-assist:catalog-clear", () => {
    catalogState = clearCatalogState();
    persistCatalogState();
    configVersion += 1;
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:msrp-key-save", (_event, apiKey) => {
    const key = normalizeOpenAiApiKey(apiKey);
    saveEncryptedCredential(msrpResearchKeyPath(), key, safeStorage, normalizeOpenAiApiKey);
    msrpResearchKey = key;
    persistSettings();
    configVersion += 1;
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:msrp-key-remove", () => {
    clearEncryptedCredential(msrpResearchKeyPath());
    msrpResearchKey = "";
    settings = { ...settings, msrpResearchEnabled: false };
    persistSettings();
    configVersion += 1;
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:msrp-research", () => runMsrpResearch());

  ipcMain.handle("cart-assist:msrp-suggestion-accept", (_event, suggestionId) => {
    if (settings.automationEnabled) throw new Error("Switch Autopilot off before approving MSRP defaults.");
    const suggestion = msrpResearchState.suggestions.find((candidate) => candidate.id === String(suggestionId || ""));
    if (!suggestion) throw new Error("That MSRP suggestion is no longer available.");
    settings = normalizeSettings({
      ...settings,
      msrpCatalog: approveMsrpSuggestion(settings.msrpCatalog, suggestion)
    }, settings);
    msrpResearchState = {
      ...msrpResearchState,
      suggestions: msrpResearchState.suggestions.filter((candidate) => candidate.id !== suggestion.id)
    };
    persistSettings();
    persistMsrpResearchState();
    configVersion += 1;
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:msrp-suggestion-dismiss", (_event, suggestionId) => {
    msrpResearchState = {
      ...msrpResearchState,
      suggestions: msrpResearchState.suggestions.filter((candidate) => candidate.id !== String(suggestionId || ""))
    };
    persistMsrpResearchState();
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:open-research-source", (_event, sourceUrl) => {
    let url;
    try {
      url = new URL(String(sourceUrl || ""));
    } catch {
      throw new Error("That research source URL is invalid.");
    }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS research sources can be opened.");
    return shell.openExternal(url.toString());
  });

  ipcMain.handle("cart-assist:stop-all", () => {
    stopEpoch += 1;
    discordConnectionEpoch += 1;
    discordNextPollAt = 0;
    quietAbortRegistry.abortAll();
    resetQuietMonitorSchedule(quietState.schedule);
    resetQuietProductState();
    storeOpenQueue.cancelPending();
    openRequests.cancelAll();
    settings = {
      ...settings,
      automationEnabled: false,
      monitoringPaused: true,
      scheduledOpenEnabled: false
    };
    runtimeState.productExecutionContexts = {};
    runtimeState.queueCaptures = {};
    runtimeState.walmartPrepObservations = {};
    persistSettings();
    persistRuntimeState();
    configVersion += 1;
    status = {
      ...status,
      lastMessage: "Stopped. Autopilot off, monitoring paused, and queued openings cancelled. Your item plan and scheduled times were preserved."
    };
    broadcast();
    return snapshot();
  });

  ipcMain.handle("cart-assist:open-product", (_event, productId) => openMissionProduct(productId));
  ipcMain.handle("cart-assist:open-buy-list", (_event, input = {}) => openBuyList("", {
    backgroundFirst: input?.backgroundFirst === true,
    ensureCompanion: true
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

  ipcMain.handle("cart-assist:copy-mission-list", (_event, selectedIds) => {
    const selected = selectedMissionProducts(settings.products, selectedIds);
    const text = formatMissionList(selected);
    clipboard.writeText(text);
    return { count: selected.length, text };
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
  ipcMain.handle("cart-assist:open-chrome-extensions", () => {
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Google Chrome was not found. Open chrome://extensions manually in Chrome.");
    return openPageInChrome("chrome://extensions");
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
    return openBuyList("", { ensureCompanion: true });
  });
}

// --- Quiet monitor: per-product read-only background stock checks ---
// Eligible tabless Target and Walmart watchers each receive an independent
// 45-90 second deadline. Starts are shuffled and paced by a dedicated
// dispatcher. These public, unauthenticated GETs use their own persisted read
// ledger; opening Chrome after a signal still uses the unchanged 120-action
// browser/cart/checkout safety budget.
const QUIET_TAB_FRESH_MS = 90_000;
const QUIET_FETCH_TIMEOUT_MS = 8_000;
const QUIET_PRODUCT_FAILURE_LIMIT = 3;
const QUIET_PRODUCT_QUARANTINE_MS = 10 * 60_000;
const QUIET_STORE_FAILURE_WINDOW_MS = 60_000;
const QUIET_STORE_FAILURE_PRODUCT_LIMIT = 4;
const QUIET_AUTO_OPEN_COOLDOWN_MS = 5 * 60_000;
const { quietFetch, quietNavigationHeaders } = require("./lib/quiet-headers");
const WALMART_PREP_MIN_SPACING_MS = 30_000;
const walmartPrepState = { lastCheckAt: 0, rotation: 0, inFlight: false };
const quietState = {
  schedule: createQuietMonitorSchedule(),
  lastAvailability: new Map(),
  productFailures: new Map(),
  productQuarantineUntil: new Map(),
  storeFailureProducts: new Map(),
  storeCooldownUntil: new Map(),
  lastAutoOpenAt: new Map(),
  storeControllers: new Map(),
  lastCadenceNoticeAt: new Map(),
  lastBudgetNoticeAt: new Map()
};

// Per-product quiet-lane residue (quarantines, failure counters, the
// five-minute Chrome-fallback cooldown, last-seen availability) must not
// survive Stop everything or a fresh arming: a stale lastAutoOpenAt otherwise
// silently suppresses the unreadable-page Chrome fallback for up to five
// minutes after a restart, which looks like missions refusing to open.
function resetQuietProductState() {
  quietState.lastAvailability.clear();
  quietState.productFailures.clear();
  quietState.productQuarantineUntil.clear();
  quietState.storeFailureProducts.clear();
  quietState.lastAutoOpenAt.clear();
}

function quietProductEligible(product, now = Date.now()) {
  if (
    !product?.enabled
    || !QUIET_STORES.includes(product.retailer)
    || productCalendarOwned(settings, product)
    || productExecutionMode(runtimeState, product.id, settings.automationRunId, now) !== "watcher"
    || now - (productTabSeenAt.get(product.id) || 0) <= QUIET_TAB_FRESH_MS
    || itemHasProtectedProgress(settings.products, productStatuses, product.itemId)
    || productStatuses[product.id]?.order === "confirmed"
  ) return false;
  const quarantineUntil = quietState.productQuarantineUntil.get(product.id) || 0;
  if (quarantineUntil > now) return false;
  if (quarantineUntil) quietState.productQuarantineUntil.delete(product.id);
  return true;
}

function eligibleQuietProducts(now = Date.now()) {
  return settings.products.filter((product) => quietProductEligible(product, now));
}

function recordQuietEvent(rawEvent, taskEpoch, options = {}) {
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
    if (options.activity !== false) addEvent(event);
    broadcast();
  } catch {
    // A malformed synthetic event is dropped rather than crashing the tick.
  }
}

async function quietCheck(product, taskEpoch, startToken) {
  const retailer = product.retailer;
  if (!monitoringOperationActive(settings, taskEpoch, stopEpoch) || productCalendarOwned(settings, product)) {
    markQuietMonitorFinished(quietState.schedule, product.id, startToken);
    return;
  }
  const controller = quietAbortRegistry.create();
  const storeControllers = quietState.storeControllers.get(retailer) || new Set();
  storeControllers.add(controller);
  quietState.storeControllers.set(retailer, storeControllers);
  const timer = setTimeout(() => controller.abort(), QUIET_FETCH_TIMEOUT_MS);
  try {
    const response = await quietFetch(product.productUrl, {
      signal: controller.signal,
      headers: quietNavigationHeaders()
    });
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    if (isOverloadStatus(response.status)) {
      const now = Date.now();
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"), now);
      pauseQuietStore(
        retailer,
        now + Math.max(settings.overloadCooldownSeconds * 1000, retryAfterMs),
        `${retailerLabel(retailer)} public monitoring paused after an overload response.`
      );
      return;
    }
    if (!response.ok) {
      const error = new Error(`status ${response.status}`);
      error.code = response.status === 404 ? "product-response" : "transport-response";
      throw error;
    }
    assertQuietProductResponse(response.url, retailer, product.sku);
    const body = await readBoundedHtml(response);
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    if (looksLikeSecurityChallenge(body)) {
      pauseQuietStore(
        retailer,
        Date.now() + settings.overloadCooldownSeconds * 1000,
        `${retailerLabel(retailer)} public monitoring encountered a security challenge and paused.`
      );
      return;
    }
    const currentProduct = settings.products.find((candidate) => candidate.id === product.id);
    if (!quietProductEligible(currentProduct, Date.now())) return;
    const outcome = checkProductPage(body, retailer, product.sku);
    if (outcome.availability === "unknown") {
      const error = new Error("unreadable");
      error.code = "unreadable-product";
      throw error;
    }

    quietState.productFailures.delete(product.id);
    quietState.productQuarantineUntil.delete(product.id);
    quietState.storeFailureProducts.get(retailer)?.delete(product.id);
    const previous = quietState.lastAvailability.get(product.id);
    quietState.lastAvailability.set(product.id, outcome.availability);
    recordQuietEvent({
      eventType: "availability",
      productId: product.id,
      retailer,
      sku: product.sku,
      availability: outcome.availability,
      eligible: false,
      reason: outcome.availability === "available" ? "retrying" : "out-of-stock",
      price: outcome.price === null ? undefined : outcome.price,
      page: product.productUrl,
      timestamp: new Date().toISOString()
    }, taskEpoch, { activity: previous !== outcome.availability });
    if (outcome.availability === "available" && previous !== "available") {
      if (Date.now() - (quietState.lastAutoOpenAt.get(product.id) || 0) > QUIET_AUTO_OPEN_COOLDOWN_MS) {
        quietState.lastAutoOpenAt.set(product.id, Date.now());
        notifyOnce(
          `quiet-stock:${product.id}`,
          `${retailerLabel(retailer)} stock detected`,
          `${product.title || product.sku} looks in stock — opening it in Chrome now.`,
          true,
          {
            productId: product.id,
            retailer: product.retailer,
            sku: product.sku,
            sourceEventType: "availability"
          }
        );
        void openProduct(product.id, {
          actionKind: "background-stock-open",
          // The stock-detected tab loads unfocused: the browser companion
          // verifies the offer there and only the mission that claims the
          // purchase lane pulls its tab forward. Opening it in the
          // foreground made every in-stock watcher steal focus in turn.
          background: true,
          resumeMonitoring: false,
          stopEpoch: taskEpoch
        }).catch(() => {});
      }
    }
  } catch (error) {
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    if ((storeOverloadUntil.get(retailer) || 0) > Date.now()) return;
    const currentProduct = settings.products.find((candidate) => candidate.id === product.id);
    if (!quietProductEligible(currentProduct, Date.now())) return;
    noteQuietProductFailure(currentProduct, taskEpoch, { structural: error?.code === "unreadable-product" });
    if (
      error?.name === "AbortError"
      || error?.code === "transport-response"
      || error?.code === "redirect-mismatch"
      || error instanceof TypeError
    ) {
      noteQuietStoreFailure(currentProduct);
    }
  } finally {
    clearTimeout(timer);
    storeControllers.delete(controller);
    if (!storeControllers.size) quietState.storeControllers.delete(retailer);
    quietAbortRegistry.release(controller);
    markQuietMonitorFinished(quietState.schedule, product.id, startToken);
  }
}

function quietStoreCooldown(retailer) {
  return Math.max(
    quietState.storeCooldownUntil.get(retailer) || 0,
    storeOverloadUntil.get(retailer) || 0
  );
}

function quietStoreCooldowns() {
  return new Map(QUIET_STORES.map((retailer) => [retailer, quietStoreCooldown(retailer)]));
}

function pauseQuietStore(retailer, requestedDeadline, message, options = {}) {
  const shared = options.shared !== false;
  const previousSharedDeadline = storeOverloadUntil.get(retailer) || 0;
  const sharedDeadline = Math.max(
    Number(requestedDeadline) || 0,
    previousSharedDeadline
  );
  const quietDeadline = Math.max(
    sharedDeadline,
    quietState.storeCooldownUntil.get(retailer) || 0
  );
  const advanced = quietDeadline > (quietState.storeCooldownUntil.get(retailer) || 0);
  const sharedAdvanced = shared && sharedDeadline > previousSharedDeadline;
  quietState.storeCooldownUntil.set(retailer, quietDeadline);
  if (shared) {
    storeOverloadUntil.set(retailer, sharedDeadline);
    runtimeState.storeOverloadUntil[retailer] = sharedDeadline;
  }
  deferQuietMonitorStore(quietState.schedule, retailer, quietDeadline, crypto.randomInt);
  for (const controller of quietState.storeControllers.get(retailer) || []) controller.abort();
  if (advanced || sharedAdvanced) {
    status = { ...status, lastMessage: message };
    persistRuntimeState();
    broadcast();
  }
}

function noteQuietStoreFailure(product) {
  const now = Date.now();
  const result = registerStoreFailure(quietState.storeFailureProducts, {
    retailer: product.retailer,
    productId: product.id,
    now,
    windowMs: QUIET_STORE_FAILURE_WINDOW_MS,
    distinctLimit: QUIET_STORE_FAILURE_PRODUCT_LIMIT
  });
  if (!result.tripped) return;
  pauseQuietStore(
    product.retailer,
    now + settings.overloadCooldownSeconds * 1000,
    `${retailerLabel(product.retailer)} public monitoring paused after several distinct product pages failed together; authenticated Chrome actions remain independent.`,
    { shared: false }
  );
}

function noteQuietProductFailure(product, taskEpoch, options = {}) {
  // A complete HTML page that exposes no readable stock data is structural,
  // not transient: Target renders availability only inside a real browser
  // session, so waiting for two more identical shell responses only delays
  // the authenticated Chrome watcher. Quarantine on the first such response
  // and open the browser watcher immediately; transient transport problems
  // keep the three-attempt counter.
  const structural = options.structural === true;
  const result = registerProductFailure(
    quietState.productFailures,
    product.id,
    structural ? 1 : QUIET_PRODUCT_FAILURE_LIMIT
  );
  if (!result.quarantined) return;
  const now = Date.now();
  quietState.productQuarantineUntil.set(product.id, now + QUIET_PRODUCT_QUARANTINE_MS);
  const shouldOpenBrowserWatcher = now - (quietState.lastAutoOpenAt.get(product.id) || 0) > QUIET_AUTO_OPEN_COOLDOWN_MS;
  if (shouldOpenBrowserWatcher) quietState.lastAutoOpenAt.set(product.id, now);
  const describeFailure = structural
    ? `The public product page loaded without readable stock data; ${retailerLabel(product.retailer)} renders availability only inside a real browser session.`
    : "The public product page was unreadable after three attempts.";
  recordQuietEvent({
    eventType: "store-error",
    productId: product.id,
    retailer: product.retailer,
    sku: product.sku,
    reason: "retrying",
    message: shouldOpenBrowserWatcher
      ? `${describeFailure} Opening the exact ${retailerLabel(product.retailer)} product in Chrome so the browser watcher can continue while quiet checks rest for 10 minutes.`
      : `${describeFailure} Quiet checks will rest for 10 minutes; the recent Chrome fallback remains inside its five-minute cooldown.`,
    page: product.productUrl,
    timestamp: new Date().toISOString()
  }, taskEpoch);
  if (shouldOpenBrowserWatcher) {
    void openProduct(product.id, {
      actionKind: "quiet-unreadable-fallback",
      background: true,
      resumeMonitoring: false,
      stopEpoch: taskEpoch
    }).catch(() => {});
  }
}

function reserveQuietRead(product, now) {
  runtimeState.quietReadHistory ||= {};
  runtimeState.quietLastStartedAt ||= {};
  const result = consumeQuietRead(
    runtimeState.quietReadHistory[product.retailer],
    now,
    undefined,
    quietStoreCooldown(product.retailer)
  );
  runtimeState.quietReadHistory[product.retailer] = result.history;
  if (result.allowed) runtimeState.quietLastStartedAt[product.id] = now;
  persistRuntimeState();
  return result;
}

function quietMonitorTick() {
  if (!settings?.automationEnabled || settings.monitoringPaused || !runtimeState) {
    resetQuietMonitorSchedule(quietState.schedule);
    return;
  }
  const now = Date.now();
  reconcileQuietMonitorSchedule(quietState.schedule, eligibleQuietProducts(now), {
    now,
    randomInt: crypto.randomInt,
    persistedStarts: runtimeState.quietLastStartedAt
  });
  const candidate = nextQuietMonitorCandidate(quietState.schedule, {
    now,
    blockedUntil: quietStoreCooldowns()
  });
  if (!candidate) return;
  const product = settings.products.find((item) => item.id === candidate.productId);
  if (!quietProductEligible(product, now)) return;
  const budget = reserveQuietRead(product, now);
  if (!budget.allowed) {
    deferQuietMonitorStore(quietState.schedule, product.retailer, budget.retryAt, crypto.randomInt);
    const previousNotice = quietState.lastBudgetNoticeAt.get(product.retailer) || 0;
    if (now - previousNotice >= 60_000) {
      quietState.lastBudgetNoticeAt.set(product.retailer, now);
      status = {
        ...status,
        lastMessage: budget.reason === "traffic-overload"
          ? `${retailerLabel(product.retailer)} quiet checks are waiting for the store cooldown.`
          : `${retailerLabel(product.retailer)} reached the separate 4,000-read quiet-monitor hourly ceiling. Checks resume as capacity returns.`
      };
      broadcast();
    }
    return;
  }
  const started = markQuietMonitorStarted(quietState.schedule, product.id, {
    now,
    randomInt: crypto.randomInt
  });
  if (!started) return;
  if (addEvent({
    eventType: "watch-started",
    productId: product.id,
    retailer: product.retailer,
    sku: product.sku,
    page: product.productUrl,
    timestamp: new Date(now).toISOString()
  })) broadcast();
  if (started.cadenceMissed && now - (quietState.lastCadenceNoticeAt.get(product.id) || 0) >= 5 * 60_000) {
    quietState.lastCadenceNoticeAt.set(product.id, now);
    recordQuietEvent({
      eventType: "automation-status",
      productId: product.id,
      retailer: product.retailer,
      sku: product.sku,
      message: `This quiet check resumed after ${Math.ceil((now - started.previousStartedAt) / 1000)} seconds; a safety cooldown, capacity limit, sleep, or slow response delayed the 45-90 second target.`,
      page: product.productUrl,
      timestamp: new Date(now).toISOString()
    }, stopEpoch);
  }
  void quietCheck(product, stopEpoch, started.startToken);
}

function startQuietMonitorDispatcher() {
  if (quietMonitorTimer) return;
  quietMonitorTimer = setInterval(quietMonitorTick, QUIET_DISPATCH_TICK_MS);
}

function materializeWalmartPrepCandidate(candidate, transition) {
  if (!transition?.triggered || !settings.automationEnabled || settings.monitoringPaused) return false;
  if (settings.products.some((product) => product.id === candidate.id)) return false;
  const current = settings.walmartPrepCandidates.find((item) => item.id === candidate.id);
  if (!current || settings.products.length >= MAX_PRODUCTS) return false;
  settings = normalizeSettings({
    ...settings,
    products: [...settings.products, current],
    walmartPrepCandidates: settings.walmartPrepCandidates.filter((item) => item.id !== candidate.id)
  }, settings);
  delete runtimeState.walmartPrepObservations[candidate.id];
  delete runtimeState.productScheduleReceipts[`${candidate.id}|${candidate.openAt}`];
  productStatuses[candidate.id] = createProductStatus(candidate);
  persistSettings();
  configVersion += 1;
  status = {
    ...status,
    lastMessage: `${candidate.title || candidate.sku} changed (${transition.reason}) and was added to Items for its approved drop time.`
  };
  notifyOnce(
    `walmart-prep:${candidate.id}:${transition.reason}`,
    "Walmart prep signal detected",
    `${candidate.title || candidate.sku} was added to Items for ${new Date(candidate.openAt).toLocaleString()}.`,
    true
  );
  persistRuntimeState();
  broadcast();
  return true;
}

async function walmartPrepCheck(candidate, taskEpoch) {
  walmartPrepState.inFlight = true;
  const controller = quietAbortRegistry.create();
  const timer = setTimeout(() => controller.abort(), QUIET_FETCH_TIMEOUT_MS);
  try {
    const previous = runtimeState.walmartPrepObservations?.[candidate.id] || null;
    const response = await quietFetch(candidate.productUrl, {
      signal: controller.signal,
      headers: {
        ...quietNavigationHeaders(),
        ...conditionalHeaders(previous)
      }
    });
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    if (response.status === 304 && previous) {
      runtimeState.walmartPrepObservations[candidate.id] = {
        ...previous,
        observedAt: new Date().toISOString()
      };
      persistRuntimeState();
      return;
    }
    if ([429, 502, 504].includes(response.status)) {
      pauseQuietStore(
        "walmart",
        Date.now() + settings.overloadCooldownSeconds * 1000,
        "Walmart public monitoring paused after an overload response."
      );
      return;
    }
    const html = response.status === 404 || response.status === 503 || response.ok
      ? await response.text()
      : "";
    if (!monitoringOperationActive(settings, taskEpoch, stopEpoch)) return;
    const observation = walmartPrepObservation({
      status: response.status,
      html,
      url: response.url,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified")
    }, candidate.sku);
    runtimeState.walmartPrepObservations ||= {};
    runtimeState.walmartPrepObservations[candidate.id] = observation;
    persistRuntimeState();
    if (previous) materializeWalmartPrepCandidate(candidate, walmartPrepTransition(previous, observation));
  } catch {
    // A timeout or network failure is not a Walmart response transition.
  } finally {
    clearTimeout(timer);
    quietAbortRegistry.release(controller);
    walmartPrepState.inFlight = false;
  }
}

function walmartPrepMonitorTick() {
  if (!settings.automationEnabled || settings.monitoringPaused || walmartPrepState.inFlight) return;
  const now = Date.now();
  if ((storeOverloadUntil.get("walmart") || 0) > now) return;
  if (now - walmartPrepState.lastCheckAt < WALMART_PREP_MIN_SPACING_MS) return;
  const candidates = (settings.walmartPrepCandidates || []).filter((candidate) => (
    new Date(candidate.openAt).getTime() + 2 * 60_000 >= now
  ));
  if (!candidates.length) return;
  const budget = reserveStoreAction("walmart", "background-prep-check");
  walmartPrepState.lastCheckAt = now;
  if (!budget.allowed) return;
  const candidate = candidates[walmartPrepState.rotation % candidates.length];
  walmartPrepState.rotation += 1;
  void walmartPrepCheck(candidate, stopEpoch);
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
      Date.now(),
      settings.scheduledBlitzDurationSeconds
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
    spacingMs: product.retailer === "walmart" ? 0 : DESKTOP_DROP_SPACING_MS,
    parallel: product.retailer === "walmart",
    // A scheduled candidate must retain an independent page. Reusing one
    // unrelated store tab would silently collapse a multi-SKU release set.
    dedicatedTab: true,
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

    walmartPrepMonitorTick();

    if (
      settings.msrpResearchEnabled
      && msrpResearchKey
      && !settings.automationEnabled
      && !msrpResearchInFlight
      && researchIsDue(msrpResearchState)
    ) {
      void runMsrpResearch().catch(() => {});
    }

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
      Date.now(),
      settings.scheduledBlitzDurationSeconds
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
      spacingMs: scheduledRetailer === "walmart" ? 0 : DESKTOP_DROP_SPACING_MS,
      parallel: scheduledRetailer === "walmart",
      dedicatedTab: true,
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
    loadCatalogState();
    loadTrackalackerState();
    loadMsrpResearchState();
    discordToken = loadDiscordToken(discordTokenPath(), safeStorage);
    msrpResearchKey = loadEncryptedCredential(msrpResearchKeyPath(), safeStorage, normalizeOpenAiApiKey);
    if (hasEncryptedCredential(msrpResearchKeyPath()) && !msrpResearchKey) {
      settings = { ...settings, msrpResearchEnabled: false };
      msrpResearchState = {
        ...msrpResearchState,
        lastError: "The saved OpenAI API key could not be decrypted on this computer. Paste a replacement key or remove it."
      };
      persistSettings();
      persistMsrpResearchState();
    }
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
    startUpdateChecks();
    startScheduler();
    startQuietMonitorDispatcher();
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
  if (quietMonitorTimer) clearInterval(quietMonitorTimer);
  if (discordPollTimer) clearInterval(discordPollTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  quietAbortRegistry.abortAll();
  if (companionServer) companionServer.close();
});
