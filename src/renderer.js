"use strict";

const ConfigProfiles = globalThis.CartConfirmConfigProfiles;
const ItemDefaults = globalThis.CartConfirmItemDefaults;
const ItemMissions = globalThis.ItemMissions;
const MAX_MISSIONS = 100;
const elements = {
  autopilotToggle: document.getElementById("autopilotToggle"),
  autopilotState: document.getElementById("autopilotState"),
  disarmButton: document.getElementById("disarmButton"),
  runStateBanner: document.getElementById("runStateBanner"),
  runStateTitle: document.getElementById("runStateTitle"),
  runStateDetail: document.getElementById("runStateDetail"),
  runReviewOpenButton: document.getElementById("runReviewOpenButton"),
  runReviewDialog: document.getElementById("runReviewDialog"),
  runReviewCloseButton: document.getElementById("runReviewCloseButton"),
  runReviewSummary: document.getElementById("runReviewSummary"),
  runReviewMetrics: document.getElementById("runReviewMetrics"),
  runReviewIssues: document.getElementById("runReviewIssues"),
  runReviewMonitorButton: document.getElementById("runReviewMonitorButton"),
  runReviewAutopilotButton: document.getElementById("runReviewAutopilotButton"),
  updateNotice: document.getElementById("updateNotice"),
  updateAvailableText: document.getElementById("updateAvailableText"),
  updateButton: document.getElementById("updateButton"),
  connectionPill: document.getElementById("connectionPill"),
  connectionText: document.getElementById("connectionText"),
  alarmBar: document.getElementById("alarmBar"),
  alarmText: document.getElementById("alarmText"),
  silenceAlarmButton: document.getElementById("silenceAlarmButton"),
  digestBar: document.getElementById("digestBar"),
  digestText: document.getElementById("digestText"),
  digestDismissButton: document.getElementById("digestDismissButton"),
  connectCard: document.getElementById("connectCard"),
  connectState: document.getElementById("connectState"),
  connectHint: document.getElementById("connectHint"),
  showExtensionButton: document.getElementById("showExtensionButton"),
  openChromeExtensionsButton: document.getElementById("openChromeExtensionsButton"),
  copyExtensionButton: document.getElementById("copyExtensionButton"),
  testConnectionButton: document.getElementById("testConnectionButton"),
  portBadge: document.getElementById("portBadge"),
  missionList: document.getElementById("missionList"),
  missionSearch: document.getElementById("missionSearch"),
  missionGroupFilter: document.getElementById("missionGroupFilter"),
  missionRetailerFilter: document.getElementById("missionRetailerFilter"),
  missionActiveFilter: document.getElementById("missionActiveFilter"),
  missionFilterCount: document.getElementById("missionFilterCount"),
  missionPlanTools: document.getElementById("missionPlanTools"),
  planEditButton: document.getElementById("planEditButton"),
  planUndoButton: document.getElementById("planUndoButton"),
  planRevertButton: document.getElementById("planRevertButton"),
  planChangeCount: document.getElementById("planChangeCount"),
  catalogLauncherButton: document.getElementById("catalogLauncherButton"),
  missionViewTemplate: document.getElementById("missionViewTemplate"),
  missionEditTemplate: document.getElementById("missionEditTemplate"),
  missionImagePreview: document.getElementById("missionImagePreview"),
  missionImagePreviewImage: document.getElementById("missionImagePreviewImage"),
  missionImagePreviewCaption: document.getElementById("missionImagePreviewCaption"),
  newMissionButton: document.getElementById("newMissionButton"),
  newMissionGroupButton: document.getElementById("newMissionGroupButton"),
  bulkImportButton: document.getElementById("bulkImportButton"),
  bulkImportDialog: document.getElementById("bulkImportDialog"),
  bulkImportText: document.getElementById("bulkImportText"),
  bulkImportResult: document.getElementById("bulkImportResult"),
  bulkImportSubmitButton: document.getElementById("bulkImportSubmitButton"),
  bulkImportCancelButton: document.getElementById("bulkImportCancelButton"),
  catalogSearchForm: document.getElementById("catalogSearchForm"),
  catalogQuery: document.getElementById("catalogQuery"),
  catalogTarget: document.getElementById("catalogTarget"),
  catalogWalmart: document.getElementById("catalogWalmart"),
  catalogAmazon: document.getElementById("catalogAmazon"),
  catalogIncludeWords: document.getElementById("catalogIncludeWords"),
  catalogExcludeWords: document.getElementById("catalogExcludeWords"),
  catalogMaxPrice: document.getElementById("catalogMaxPrice"),
  catalogSearchButton: document.getElementById("catalogSearchButton"),
  catalogClearButton: document.getElementById("catalogClearButton"),
  catalogSelectAllButton: document.getElementById("catalogSelectAllButton"),
  catalogSelectNoneButton: document.getElementById("catalogSelectNoneButton"),
  catalogItemProfile: document.getElementById("catalogItemProfile"),
  catalogAddButton: document.getElementById("catalogAddButton"),
  catalogWalmartPrepOpenAt: document.getElementById("catalogWalmartPrepOpenAt"),
  catalogWalmartPrepButton: document.getElementById("catalogWalmartPrepButton"),
  walmartPrepList: document.getElementById("walmartPrepList"),
  catalogStatus: document.getElementById("catalogStatus"),
  catalogCount: document.getElementById("catalogCount"),
  catalogList: document.getElementById("catalogList"),
  storeAllowanceForm: document.getElementById("storeAllowanceForm"),
  orderTaxPercent: document.getElementById("orderTaxPercent"),
  targetOrderAllowance: document.getElementById("targetOrderAllowance"),
  walmartOrderAllowance: document.getElementById("walmartOrderAllowance"),
  amazonOrderAllowance: document.getElementById("amazonOrderAllowance"),
  saveStoreAllowancesButton: document.getElementById("saveStoreAllowancesButton"),
  defaultItemProfile: document.getElementById("defaultItemProfile"),
  itemProfileForm: document.getElementById("itemProfileForm"),
  itemProfileId: document.getElementById("itemProfileId"),
  itemProfileName: document.getElementById("itemProfileName"),
  itemProfileQuantity: document.getElementById("itemProfileQuantity"),
  itemProfileAction: document.getElementById("itemProfileAction"),
  itemProfileFulfillment: document.getElementById("itemProfileFulfillment"),
  itemProfileAlert: document.getElementById("itemProfileAlert"),
  itemProfileEnabled: document.getElementById("itemProfileEnabled"),
  itemProfileResetButton: document.getElementById("itemProfileResetButton"),
  itemProfileDeleteButton: document.getElementById("itemProfileDeleteButton"),
  savedItemProfiles: document.getElementById("savedItemProfiles"),
  msrpList: document.getElementById("msrpList"),
  addMsrpRecordButton: document.getElementById("addMsrpRecordButton"),
  researchMsrpButton: document.getElementById("researchMsrpButton"),
  msrpResearchStatus: document.getElementById("msrpResearchStatus"),
  msrpResearchApiKey: document.getElementById("msrpResearchApiKey"),
  saveMsrpResearchKeyButton: document.getElementById("saveMsrpResearchKeyButton"),
  removeMsrpResearchKeyButton: document.getElementById("removeMsrpResearchKeyButton"),
  msrpResearchEnabled: document.getElementById("msrpResearchEnabled"),
  msrpSuggestions: document.getElementById("msrpSuggestions"),
  bulkMissionSelectAllButton: document.getElementById("bulkMissionSelectAllButton"),
  bulkMissionSelectNoneButton: document.getElementById("bulkMissionSelectNoneButton"),
  bulkMissionSelectionCount: document.getElementById("bulkMissionSelectionCount"),
  bulkEnableMissionsButton: document.getElementById("bulkEnableMissionsButton"),
  bulkDisableMissionsButton: document.getElementById("bulkDisableMissionsButton"),
  combineSelectedItemsButton: document.getElementById("combineSelectedItemsButton"),
  bulkItemProfile: document.getElementById("bulkItemProfile"),
  applyBulkItemProfileButton: document.getElementById("applyBulkItemProfileButton"),
  bulkMissionGroup: document.getElementById("bulkMissionGroup"),
  applyBulkMissionGroupButton: document.getElementById("applyBulkMissionGroupButton"),
  copySelectedMissionListButton: document.getElementById("copySelectedMissionListButton"),
  bulkMissionOpenAt: document.getElementById("bulkMissionOpenAt"),
  scheduleCandidateMissionsButton: document.getElementById("scheduleCandidateMissionsButton"),
  clearSelectedMissionSchedulesButton: document.getElementById("clearSelectedMissionSchedulesButton"),
  readinessState: document.getElementById("readinessState"),
  readinessSummary: document.getElementById("readinessSummary"),
  readinessConnection: document.getElementById("readinessConnection"),
  readinessEnabled: document.getElementById("readinessEnabled"),
  readinessScheduled: document.getElementById("readinessScheduled"),
  readinessExposure: document.getElementById("readinessExposure"),
  readinessNote: document.getElementById("readinessNote"),
  readinessReviewButton: document.getElementById("readinessReviewButton"),
  testButton: document.getElementById("testButton"),
  openAllButton: document.getElementById("openAllButton"),
  worstCase: document.getElementById("worstCase"),
  settingsBox: document.getElementById("settingsBox"),
  configurationProfileSelect: document.getElementById("configurationProfileSelect"),
  configurationProfileDescription: document.getElementById("configurationProfileDescription"),
  configurationProfileName: document.getElementById("configurationProfileName"),
  applyConfigurationProfileButton: document.getElementById("applyConfigurationProfileButton"),
  saveConfigurationProfileButton: document.getElementById("saveConfigurationProfileButton"),
  deleteConfigurationProfileButton: document.getElementById("deleteConfigurationProfileButton"),
  fastMode: document.getElementById("fastMode"),
  combinedOrder: document.getElementById("combinedOrder"),
  watcherIntervalSeconds: document.getElementById("watcherIntervalSeconds"),
  retryIntervalSeconds: document.getElementById("retryIntervalSeconds"),
  eligibilityRefreshIntervalSeconds: document.getElementById("eligibilityRefreshIntervalSeconds"),
  blitzRetryDelayMs: document.getElementById("blitzRetryDelayMs"),
  blitzWindowSeconds: document.getElementById("blitzWindowSeconds"),
  scheduledBlitzDurationSeconds: document.getElementById("scheduledBlitzDurationSeconds"),
  walmartQueueCaptureReloads: document.getElementById("walmartQueueCaptureReloads"),
  storeNavigationIntervalSeconds: document.getElementById("storeNavigationIntervalSeconds"),
  overloadCooldownSeconds: document.getElementById("overloadCooldownSeconds"),
  storeShortcut: document.getElementById("storeShortcut"),
  openCartButton: document.getElementById("openCartButton"),
  openOrdersButton: document.getElementById("openOrdersButton"),
  discordLauncher: document.getElementById("discordLauncher"),
  showDiscordButton: document.getElementById("showDiscordButton"),
  signalPanel: document.getElementById("signalPanel"),
  discordState: document.getElementById("discordState"),
  discordHint: document.getElementById("discordHint"),
  discordBotToken: document.getElementById("discordBotToken"),
  discordChannelId: document.getElementById("discordChannelId"),
  discordConnectButton: document.getElementById("discordConnectButton"),
  discordDisconnectButton: document.getElementById("discordDisconnectButton"),
  discordForgetButton: document.getElementById("discordForgetButton"),
  discordAutoOpen: document.getElementById("discordAutoOpen"),
  signalCount: document.getElementById("signalCount"),
  clearSignalsButton: document.getElementById("clearSignalsButton"),
  signalList: document.getElementById("signalList"),
  schedulePanel: document.getElementById("schedulePanel"),
  scheduleNext: document.getElementById("scheduleNext"),
  scheduleCoverage: document.getElementById("scheduleCoverage"),
  enableScheduledButton: document.getElementById("enableScheduledButton"),
  clearMissedSchedulesButton: document.getElementById("clearMissedSchedulesButton"),
  scheduleTimezone: document.getElementById("scheduleTimezone"),
  scheduleWeek: document.getElementById("scheduleWeek"),
  eventList: document.getElementById("eventList"),
  eventFilterButton: document.getElementById("eventFilterButton"),
  clearEventsButton: document.getElementById("clearEventsButton"),
  message: document.getElementById("message"),
  versionText: document.getElementById("versionText")
};

const STORE_LABELS = Object.freeze({ target: "Target", walmart: "Walmart", amazon: "Amazon" });
const SKU_LABELS = Object.freeze({ target: "TCIN", walmart: "Walmart item ID", amazon: "ASIN" });
const ACTION_LABELS = Object.freeze({ watch: "Watch", cart: "Add only", review: "I submit", checkout: "Auto-buy" });
const ACTION_SHORT_LABELS = Object.freeze({ watch: "Watch", cart: "ATC", review: "Review", checkout: "Auto" });
const ACTION_DESCRIPTIONS = Object.freeze({
  watch: "Watch and alert only",
  cart: "Add to cart only",
  review: "Prepare checkout for manual submission",
  checkout: "Submit order automatically"
});
const UNGROUPED_FILTER_VALUE = "__ungrouped__";
const MAX_MISSION_GROUPS = 20;
const BLOCKING_REASONS = new Set([
  "cart-unverified",
  "manual-action-required",
  "over-price",
  "over-total",
  "price-unavailable",
  "quantity-unavailable",
  "fulfillment-unverified",
  "seller-unverified",
  "store-error",
  "third-party",
  "total-unavailable",
  "traffic-overload",
  "traffic-budget-exhausted",
  "unmatched-product"
]);

const PANEL_STATE_PREFIX = "cart-confirm:panel:";

function panelStateKey(toggle) {
  return `${PANEL_STATE_PREFIX}${toggle.getAttribute("aria-controls") || "unknown"}`;
}

function savedPanelExpanded(toggle, fallback) {
  try {
    const saved = window.localStorage.getItem(panelStateKey(toggle));
    return saved === null ? fallback : saved === "expanded";
  } catch {
    return fallback;
  }
}

function setPanelExpanded(toggle, expanded, options = {}) {
  const panel = toggle.closest(".collapsible-panel");
  if (!panel) return;
  const content = document.getElementById(toggle.getAttribute("aria-controls"));
  panel.classList.toggle("is-collapsed", !expanded);
  if (content) content.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded ? "Minimize" : "Expand";
  if (options.persist === false) return;
  try {
    window.localStorage.setItem(panelStateKey(toggle), expanded ? "expanded" : "collapsed");
  } catch {
    // A read-only storage context still gets the markup defaults.
  }
}

for (const toggle of document.querySelectorAll(".panel-toggle")) {
  const fallback = toggle.getAttribute("aria-expanded") !== "false";
  setPanelExpanded(toggle, savedPanelExpanded(toggle, fallback), { persist: false });
  toggle.addEventListener("click", () => {
    setPanelExpanded(toggle, toggle.getAttribute("aria-expanded") !== "true");
  });
}

let currentSnapshot = null;
let messageTimer = null;
let openRunInFlight = false;
let runReviewApproved = false;
let updateOperationInFlight = false;
let updateButtonMode = "check";
let availableUpdateVersion = "";
let lastUpdaterRevision = -1;
let editingId = null; // null | product id | "new"
let editCardNode = null;
let planEditMode = false;
let resumeAutopilotAfterPlanEdit = false;
let planEditBaseline = null;
let planEditUndoStack = [];
let restoringPlanSnapshot = false;
let awaySince = 0;
let settingsSaveTimer = null;
let selectedConfigurationProfileId = "built-in:recommended";
let eventFilterProductId = null;
let bulkImportInFlight = false;
let bulkImportPreviewText = "";
let catalogSearchInFlight = false;
let catalogImportInFlight = false;
let renderedCatalogSearchId = "";
let lastReadinessIssueItemIds = new Set();
let missionVisibleLimit = 25;
const catalogSelectedIds = new Set();
const catalogSeenIds = new Set();
const bulkMissionSelectedIds = new Set();
let editingItemProfileId = "";
// Persisted feed entries are history, not fresh alarm triggers. Only events
// received after this renderer process starts may sound an alarm.
let lastAlarmEventStamp = new Date().toISOString();
const alarmLastFiredAt = new Map();
let alarmAudio = null;
let alarmBeepInterval = null;
let alarmStopTimer = null;
let stopUiEpoch = 0;

// --- Small helpers ---

function setMessage(text, kind = "") {
  clearTimeout(messageTimer);
  elements.message.textContent = text;
  elements.message.className = `message ${kind}${text ? " show" : ""}`.trim();
  if (text) {
    messageTimer = setTimeout(() => {
      elements.message.classList.remove("show");
    }, 8000);
  }
}

function renderUpdaterState(state = {}) {
  const revision = Number(state.revision);
  if (Number.isInteger(revision) && revision >= 0) {
    if (revision <= lastUpdaterRevision) return;
    lastUpdaterRevision = revision;
  }
  const status = String(state.status || "idle");
  availableUpdateVersion = state.version ? String(state.version) : "";
  const updateReady = Boolean(availableUpdateVersion) && [
    "checking",
    "available",
    "checksum",
    "downloading",
    "verifying",
    "installing",
    "cancelled",
    "error"
  ].includes(status);
  updateOperationInFlight = ["checking", "checksum", "downloading", "verifying", "installing"].includes(status);
  updateButtonMode = updateReady ? "install" : "check";
  // The updater control stays visible so a newer build can always be pulled
  // on demand instead of waiting for the six-hour background check.
  elements.updateNotice.hidden = status === "unavailable";
  elements.updateAvailableText.textContent = updateReady
    ? `v${availableUpdateVersion} available`
    : status === "current"
      ? `Up to date${state.currentVersion ? ` (v${state.currentVersion})` : ""}`
      : "";
  elements.updateButton.disabled = updateOperationInFlight;

  if (status === "checking") elements.updateButton.textContent = "Checking…";
  else if (status === "checksum") elements.updateButton.textContent = "Checking release…";
  else if (status === "downloading") elements.updateButton.textContent = `Downloading ${state.percent || 0}%`;
  else if (status === "verifying") elements.updateButton.textContent = "Verifying…";
  else if (status === "installing") elements.updateButton.textContent = "Installing…";
  else elements.updateButton.textContent = updateReady ? "Update" : "Check for updates";

  const label = updateReady && !updateOperationInFlight
    ? `Update Cart Confirm to v${availableUpdateVersion}`
    : elements.updateButton.textContent;
  elements.updateButton.setAttribute("aria-label", label);
}

async function requestUpdateCheck() {
  if (updateOperationInFlight) return;
  renderUpdaterState({ status: "checking" });
  try {
    const result = await window.cartAssist.checkForUpdates();
    if (result?.status === "available") {
      renderUpdaterState({ status: "available", version: result.version });
      setMessage(`Cart Confirm v${result.version} is ready to install.`, "success");
    } else if (result?.status === "unavailable") {
      renderUpdaterState({ status: "unavailable" });
      setMessage("Automatic updates are available in the packaged 64-bit Windows app.", "warn");
    } else if (result?.status === "error") {
      renderUpdaterState({ status: "idle" });
      setMessage(result.message || "The update check failed.", "error");
    } else {
      renderUpdaterState({ status: "current", currentVersion: result?.currentVersion || "" });
      setMessage(
        result?.currentVersion
          ? `Cart Confirm v${result.currentVersion} is the newest published version.`
          : "Cart Confirm is up to date.",
        "success"
      );
    }
  } catch (error) {
    renderUpdaterState({ status: "idle" });
    setMessage(error.message || "The update check failed.", "error");
  }
}

async function requestAppUpdate() {
  if (updateOperationInFlight || !availableUpdateVersion) return;
  const requestedVersion = availableUpdateVersion;
  renderUpdaterState({ status: "checking", version: requestedVersion });
  try {
    const result = await window.cartAssist.installUpdate();
    if (result?.status === "current") {
      renderUpdaterState({ status: "current" });
      setMessage(`Cart Confirm v${result.currentVersion} is already the newest published version.`, "success");
    } else if (result?.status === "cancelled") {
      renderUpdaterState({ status: "cancelled", version: result.version || requestedVersion });
      setMessage("Update postponed. Your current version was not changed.");
    } else if (result?.status === "unavailable") {
      renderUpdaterState({ status: "unavailable" });
      setMessage(result.message || "Automatic updates are unavailable in this build.", "warn");
    } else if (result?.status === "busy") {
      renderUpdaterState({ status: "available", version: result.version || requestedVersion });
      setMessage("An update is already being prepared.", "warn");
    } else if (result?.status === "installing") {
      renderUpdaterState({ status: "installing", version: result.version });
      setMessage(`Verified update v${result.version} is installing. Cart Confirm will relaunch automatically.`, "success");
    } else {
      renderUpdaterState({ status: "available", version: requestedVersion });
      setMessage("The update request finished without a result. You can try again.", "warn");
    }
  } catch (error) {
    renderUpdaterState({ status: "error", version: availableUpdateVersion || requestedVersion });
    setMessage(error.message || "The update could not be installed.", "error");
  }
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return "No events yet.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No events yet.";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function money(value) {
  if (value === null || value === undefined || value === "") return "Not observed";
  return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : "Not observed";
}

function eventName(type) {
  const activityNames = {
    "watch-started": "Watch Started",
    "offer-observed": "Qualified",
    "cart-reached": "Cart Open",
    "cart-item-confirmed": "Added to Cart",
    "order-confirmed": "Ordered",
    "notification-sent": "Notified"
  };
  if (activityNames[type]) return activityNames[type];
  return String(type || "event")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function relativeTime(iso) {
  if (!iso) return "not checked yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "not checked yet";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(then).toLocaleDateString([], { dateStyle: "medium" });
}

function detectRetailer(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    if (["target.com", "www.target.com"].includes(host)) return "target";
    if (["walmart.com", "www.walmart.com"].includes(host)) return "walmart";
    if (["amazon.com", "www.amazon.com"].includes(host)) return "amazon";
  } catch {
    return "";
  }
  return "";
}

function extractSku(retailer, value) {
  const text = String(value || "");
  if (retailer === "walmart") {
    try {
      const url = new URL(text);
      if (url.pathname === "/qp") {
        const payload = JSON.parse(url.searchParams.get("qpdata") || "null");
        const metadata = typeof payload?.customMetadata === "string"
          ? JSON.parse(payload.customMetadata)
          : payload?.customMetadata;
        const item = typeof metadata?.item === "string" ? JSON.parse(metadata.item) : metadata?.item;
        const itemId = String(item?.itemID || item?.itemId || "");
        if (/^\d{5,20}$/.test(itemId)) return itemId;
      }
    } catch {
      // Invalid or incomplete queue metadata cannot populate a product identity.
    }
  }
  const patterns = {
    target: [/(?:\/|-)A-(\d{6,12})(?:[/?#]|$)/i],
    walmart: [/\/ip\/(?:[^/?#]+\/)?(\d{5,20})(?:[/?#]|$)/i],
    amazon: [/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i]
  };
  for (const pattern of patterns[retailer] || []) {
    const match = text.match(pattern);
    if (match) return retailer === "amazon" ? match[1].toUpperCase() : match[1];
  }
  return "";
}

// A readable mission name from the product link's slug.
function deriveTitleFromUrl(url) {
  try {
    const segments = new URL(String(url || "")).pathname.split("/").filter(Boolean);
    const candidates = segments.filter((segment) => (
      !["p", "ip", "dp", "gp", "product"].includes(segment.toLowerCase())
      && !/^A-\d+$/i.test(segment)
      && !/^\d+$/.test(segment)
      && !/^[A-Z0-9]{10}$/.test(segment)
      && segment !== "-"
    ));
    const slug = candidates.sort((a, b) => b.length - a.length)[0] || "";
    return decodeURIComponent(slug)
      .replace(/[-_+]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .slice(0, 80);
  } catch {
    return "";
  }
}

function savedProducts() {
  return currentSnapshot?.settings?.products || [];
}

function savedItems(products = savedProducts()) {
  return ItemMissions.groupProductsByItem(products);
}

function itemForProduct(product) {
  if (!product) return null;
  if (Array.isArray(product.variants)) return product;
  const itemId = ItemMissions.itemIdForProduct(product);
  return savedItems().find((item) => item.id === itemId)
    || ItemMissions.groupProductsByItem([product])[0]
    || null;
}

function itemLabel(item) {
  const primary = item?.primary || item?.variants?.[0];
  return item?.title || (primary ? productLabel(primary) : "Item");
}

function selectedRouteIds() {
  return savedProducts()
    .filter((product) => bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product)))
    .map((product) => product.id);
}

function savedMissionGroups() {
  return currentSnapshot?.settings?.missionGroups || [];
}

function isArmed() {
  return Boolean(currentSnapshot?.settings?.automationEnabled);
}

function productTitle(productId) {
  const product = savedProducts().find((candidate) => candidate.id === productId);
  return product?.title || "";
}

function productLabel(product) {
  return product.title || `${STORE_LABELS[product.retailer]} ${product.sku}`;
}

let missionImagePreviewOwner = null;

function hideMissionImagePreview(owner = null) {
  if (owner && missionImagePreviewOwner !== owner) return;
  missionImagePreviewOwner = null;
  elements.missionImagePreview.hidden = true;
  elements.missionImagePreview.setAttribute("aria-hidden", "true");
  elements.missionImagePreviewImage.removeAttribute("src");
}

function positionMissionImagePreview(card) {
  const cardRect = card.getBoundingClientRect();
  const previewWidth = elements.missionImagePreview.offsetWidth || 270;
  const previewHeight = elements.missionImagePreview.offsetHeight || 294;
  const gap = 10;
  const edge = 10;
  let left = cardRect.right + gap;
  if (left + previewWidth > window.innerWidth - edge) {
    left = cardRect.left - previewWidth - gap;
  }
  left = Math.max(edge, Math.min(left, window.innerWidth - previewWidth - edge));
  const top = Math.max(edge, Math.min(cardRect.top, window.innerHeight - previewHeight - edge));
  elements.missionImagePreview.style.left = `${Math.round(left)}px`;
  elements.missionImagePreview.style.top = `${Math.round(top)}px`;
}

function showMissionImagePreview(card, product) {
  if (!product.imageUrl) return;
  missionImagePreviewOwner = card;
  elements.missionImagePreviewImage.src = product.imageUrl;
  elements.missionImagePreviewImage.alt = `${productLabel(product)} product image`;
  elements.missionImagePreviewCaption.textContent = `${STORE_LABELS[product.retailer]} · ${productLabel(product)}`;
  elements.missionImagePreview.hidden = false;
  elements.missionImagePreview.setAttribute("aria-hidden", "false");
  positionMissionImagePreview(card);
}

function configureMissionProductImage(card, product) {
  const imageWrap = view(card, "imageWrap");
  const image = view(card, "image");
  if (!product.imageUrl) return;
  imageWrap.hidden = false;
  imageWrap.setAttribute("aria-label", `Preview image for ${productLabel(product)}`);
  imageWrap.setAttribute("aria-describedby", "missionImagePreview");
  image.src = product.imageUrl;
  card.classList.add("has-product-image");
  image.addEventListener("error", () => {
    imageWrap.hidden = true;
    card.classList.remove("has-product-image");
    hideMissionImagePreview(card);
  }, { once: true });
  card.addEventListener("mouseenter", () => showMissionImagePreview(card, product));
  card.addEventListener("mouseleave", () => hideMissionImagePreview(card));
  imageWrap.addEventListener("focus", () => showMissionImagePreview(card, product));
  imageWrap.addEventListener("blur", () => hideMissionImagePreview(card));
}

elements.missionImagePreviewImage.addEventListener("error", () => hideMissionImagePreview());
window.addEventListener("resize", () => hideMissionImagePreview());
window.addEventListener("scroll", () => hideMissionImagePreview(), true);

async function runAction(action, successMessage) {
  const actionStopEpoch = stopUiEpoch;
  try {
    const result = await action();
    if (actionStopEpoch !== stopUiEpoch) return result;
    const text = typeof successMessage === "function" ? successMessage(result) : successMessage;
    setMessage(text, "success");
    return result;
  } catch (error) {
    if (actionStopEpoch !== stopUiEpoch) return null;
    setMessage(error.message || "The action failed.", "error");
    return null;
  }
}

function affiliateClipboardInput(product, affiliateUrl = product?.affiliateUrl) {
  return {
    affiliateUrl: String(affiliateUrl || ""),
    retailer: product?.retailer || "",
    sku: product?.sku || ""
  };
}

function copyAffiliateProduct(product) {
  return window.cartAssist.copyAffiliateLink(affiliateClipboardInput(product));
}

// --- Saving ---

function currentConfiguration() {
  return ConfigProfiles.normalizeConfiguration({
    fastMode: elements.fastMode.checked,
    watcherIntervalSeconds: elements.watcherIntervalSeconds.value,
    retryIntervalSeconds: elements.retryIntervalSeconds.value,
    eligibilityRefreshIntervalSeconds: elements.eligibilityRefreshIntervalSeconds.value,
    blitzRetryDelayMs: elements.blitzRetryDelayMs.value,
    blitzWindowSeconds: elements.blitzWindowSeconds.value,
    scheduledBlitzDurationSeconds: elements.scheduledBlitzDurationSeconds.value,
    walmartQueueCaptureReloads: elements.walmartQueueCaptureReloads.value,
    storeNavigationIntervalSeconds: elements.storeNavigationIntervalSeconds.value,
    overloadCooldownSeconds: elements.overloadCooldownSeconds.value
  });
}

function allConfigurationProfiles(settings = currentSnapshot?.settings) {
  return [
    ...ConfigProfiles.BUILT_IN_PROFILES,
    ...(settings?.configurationProfiles || [])
  ];
}

function selectedConfigurationProfile(settings = currentSnapshot?.settings) {
  return allConfigurationProfiles(settings).find((profile) => profile.id === selectedConfigurationProfileId) || null;
}

function profileOptionGroup(label, profiles) {
  const group = document.createElement("optgroup");
  group.label = label;
  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    group.append(option);
  }
  return group;
}

function allItemProfiles(settings = currentSnapshot?.settings) {
  return ItemDefaults.allItemProfiles(settings?.itemProfiles || []);
}

function itemProfileOptions(select, selectedId, settings = currentSnapshot?.settings) {
  const builtIns = ItemDefaults.BUILT_IN_ITEM_PROFILES;
  const custom = settings?.itemProfiles || [];
  select.replaceChildren(
    profileOptionGroup("Ready-made profiles", builtIns),
    ...(custom.length ? [profileOptionGroup("Your profiles", custom)] : [])
  );
  select.value = allItemProfiles(settings).some((profile) => profile.id === selectedId)
    ? selectedId
    : (settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID);
}

function profileSeedFromFields(card) {
  return {
    retailer: field(card, "retailer").value,
    title: field(card, "title").value,
    maxPrice: Number(field(card, "maxPrice").value),
    msrpRecordId: field(card, "msrpRecordId").value,
    priceSource: field(card, "priceSource").value
  };
}

function applyProfileToEditor(card) {
  const profileId = field(card, "itemProfileId").value;
  const profile = ItemDefaults.itemProfileById(profileId, currentSnapshot?.settings?.itemProfiles || []);
  if (!profile) throw new Error("Choose an item profile.");
  captureActiveStoreDraft(card);
  const options = {
    storeOrderAllowances: currentSnapshot?.settings?.storeOrderAllowances,
    orderTaxPercent: currentSnapshot?.settings?.orderTaxPercent
  };
  const title = field(card, "title").value;
  const appliedRoutes = [...card.__routeDrafts.entries()].map(([retailer, draft]) => {
    const appliedRoute = ItemDefaults.applyItemProfile(
      { ...draft, retailer, title },
      profile,
      currentSnapshot?.settings?.msrpCatalog || [],
      options
    );
    card.__routeDrafts.set(retailer, {
      ...draft,
      maxPrice: appliedRoute.maxPrice,
      maxOrderTotal: appliedRoute.maxOrderTotal,
      msrpRecordId: appliedRoute.msrpRecordId,
      priceSource: appliedRoute.priceSource
    });
    return appliedRoute;
  });
  const applied = appliedRoutes.find((route) => route.retailer === card.__activeRetailer)
    || ItemDefaults.applyItemProfile(profileSeedFromFields(card), profile, currentSnapshot?.settings?.msrpCatalog || [], options);
  loadActiveStoreDraft(card, card.__activeRetailer);
  field(card, "maxPrice").value = String(applied.maxPrice || 0);
  field(card, "maxOrderTotal").value = String(applied.maxOrderTotal || 0);
  field(card, "quantity").value = String(applied.quantity);
  field(card, "action").value = applied.action;
  field(card, "alertLevel").value = applied.alertLevel;
  field(card, "fulfillmentMode").value = applied.fulfillmentMode;
  field(card, "signalAutoOpen").checked = applied.signalAutoOpen;
  const readyStores = appliedRoutes.filter((route) => route.enabled).length;
  field(card, "enabled").checked = readyStores === appliedRoutes.length;
  field(card, "msrpRecordId").value = applied.msrpRecordId || "";
  field(card, "priceSource").value = applied.priceSource || "";
  field(card, "action").dispatchEvent(new Event("change", { bubbles: true }));
  return { ...applied, enabled: readyStores === appliedRoutes.length, readyStores, storeCount: appliedRoutes.length };
}

function renderConfigurationProfiles(settings) {
  const customProfiles = settings.configurationProfiles || [];
  const profiles = allConfigurationProfiles(settings);
  if (!profiles.some((profile) => profile.id === selectedConfigurationProfileId)) {
    selectedConfigurationProfileId = ConfigProfiles.BUILT_IN_PROFILES[0].id;
  }
  elements.configurationProfileSelect.replaceChildren(
    profileOptionGroup("Ready-made setups", ConfigProfiles.BUILT_IN_PROFILES),
    ...(customProfiles.length ? [profileOptionGroup("Your saved setups", customProfiles)] : [])
  );
  elements.configurationProfileSelect.value = selectedConfigurationProfileId;
  const profile = selectedConfigurationProfile(settings);
  const custom = profile?.id.startsWith("custom:");
  elements.configurationProfileDescription.textContent = custom
    ? "Your saved copy of these speed and traffic numbers. Select Use this setup to apply it."
    : profile?.description || "";
  if (document.activeElement !== elements.configurationProfileName) {
    elements.configurationProfileName.value = custom ? profile.name : "";
  }
  elements.saveConfigurationProfileButton.textContent = custom ? "Update saved setup" : "Save current numbers";
  elements.deleteConfigurationProfileButton.hidden = !custom;
}

function globalSettings(products, overrides = {}) {
  const current = {
    products,
    missionGroups: overrides.missionGroups ?? savedMissionGroups(),
    automationEnabled: isArmed(),
    fastMode: elements.fastMode.checked,
    combinedOrderEnabled: elements.combinedOrder.checked,
    watcherIntervalSeconds: Number(elements.watcherIntervalSeconds.value),
    retryIntervalSeconds: Number(elements.retryIntervalSeconds.value),
    eligibilityRefreshIntervalSeconds: Number(elements.eligibilityRefreshIntervalSeconds.value),
    blitzRetryDelayMs: Number(elements.blitzRetryDelayMs.value),
    blitzWindowSeconds: Number(elements.blitzWindowSeconds.value),
    scheduledBlitzDurationSeconds: Number(elements.scheduledBlitzDurationSeconds.value),
    walmartQueueCaptureReloads: Number(elements.walmartQueueCaptureReloads.value),
    walmartPrepCandidates: currentSnapshot?.settings?.walmartPrepCandidates || [],
    storeNavigationIntervalSeconds: Number(elements.storeNavigationIntervalSeconds.value),
    overloadCooldownSeconds: Number(elements.overloadCooldownSeconds.value),
    configurationProfiles: currentSnapshot?.settings?.configurationProfiles || [],
    msrpCatalog: currentSnapshot?.settings?.msrpCatalog || [],
    itemProfiles: currentSnapshot?.settings?.itemProfiles || [],
    defaultItemProfileId: currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID,
    orderTaxPercent: currentSnapshot?.settings?.orderTaxPercent ?? ItemDefaults.DEFAULT_ORDER_TAX_PERCENT,
    storeOrderAllowances: currentSnapshot?.settings?.storeOrderAllowances || ItemDefaults.DEFAULT_STORE_ORDER_ALLOWANCES,
    scheduledOpenEnabled: false,
    scheduledRetailer: currentSnapshot?.settings?.scheduledRetailer || "target",
    scheduledOpenAt: "",
    discordEnabled: Boolean(currentSnapshot?.settings?.discordEnabled),
    discordChannelId: currentSnapshot?.settings?.discordChannelId || "",
    discordAutoOpen: currentSnapshot?.settings?.discordAutoOpen !== false
  };
  return {
    ...current,
    ...overrides,
    products,
    missionGroups: overrides.missionGroups ?? current.missionGroups,
    automationEnabled: isArmed()
  };
}

function clonePlan(value) {
  return JSON.parse(JSON.stringify(value));
}

const PLAN_CONFIGURATION_FIELDS = Object.freeze([
  "fastMode",
  "combinedOrderEnabled",
  "watcherIntervalSeconds",
  "retryIntervalSeconds",
  "eligibilityRefreshIntervalSeconds",
  "blitzRetryDelayMs",
  "blitzWindowSeconds",
  "scheduledBlitzDurationSeconds",
  "walmartQueueCaptureReloads",
  "storeNavigationIntervalSeconds",
  "overloadCooldownSeconds"
]);

function capturePlanSnapshot() {
  const settings = currentSnapshot?.settings || {};
  return clonePlan({
    products: savedProducts(),
    missionGroups: savedMissionGroups(),
    ...Object.fromEntries(PLAN_CONFIGURATION_FIELDS.map((key) => [key, settings[key]]))
  });
}

function recordPlanChange(before) {
  if (!before || !planEditMode || restoringPlanSnapshot) return;
  if (JSON.stringify(before) === JSON.stringify(capturePlanSnapshot())) return;
  planEditUndoStack.push(before);
  renderPlanHistoryControls();
}

async function saveMissionList(products, overrides = {}) {
  const before = planEditMode && !restoringPlanSnapshot
    ? capturePlanSnapshot()
    : null;
  const next = await window.cartAssist.saveSettings(globalSettings(products, overrides));
  render(next);
  recordPlanChange(before);
  renderPlanHistoryControls();
  return next;
}

// --- Plan editing pauses Autopilot once, then resumes once when the plan is ready ---

async function pauseAutopilot() {
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    automationEnabled: false
  });
  render(next);
}

function autoSubmitArmingSummary(saved) {
  const products = [...(saved.products || []), ...(saved.walmartPrepCandidates || [])]
    .filter((product) => product.enabled && product.action === "checkout");
  return {
    count: products.length,
    liveVerificationCount: products.filter((product) => product.checkoutPreflightApproved !== true).length
  };
}

function liveVerificationWarning(count) {
  return count > 0
    ? ` ${count} store option${count === 1 ? " has" : "s have"} no optional preflight and will use the freshly verified destination or pickup store and payment set visible when checkout opens.`
    : "";
}

async function resumeAutopilot() {
  const saved = currentSnapshot.settings;
  const autoSubmit = autoSubmitArmingSummary(saved);
  if (
    autoSubmit.count > 0
    && !window.confirm(`${autoSubmit.count} enabled store option${autoSubmit.count === 1 ? "" : "s"} may submit a real order.${liveVerificationWarning(autoSubmit.liveVerificationCount)} Resuming starts a new run. Switch Autopilot back on?`)
  ) {
    setMessage("Autopilot stayed off. Switch it on from the header when ready.", "warn");
    return false;
  }
  const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
  render(next);
  return true;
}

async function beginPlanEditSession() {
  if (planEditMode) return true;
  const actionStopEpoch = stopUiEpoch;
  try {
    if (isArmed()) {
      await pauseAutopilot();
      if (actionStopEpoch !== stopUiEpoch) return false;
      resumeAutopilotAfterPlanEdit = true;
    }
    planEditMode = true;
    planEditBaseline = capturePlanSnapshot();
    planEditUndoStack = [];
    renderMissions();
    renderPlanHistoryControls();
    setMessage(
      resumeAutopilotAfterPlanEdit
        ? "Autopilot paused once. Make every plan change, then choose Finish editing to start the updated run."
        : "Plan editor open. Select filtered items for bulk changes, or edit individual items.",
      "warn"
    );
    return true;
  } catch (error) {
    setMessage(error.message || "Could not open the plan editor.", "error");
    return false;
  }
}

async function finishPlanEditSession() {
  if (!planEditMode) return;
  if (editingId) {
    setMessage("Finish the open item editor first (Done or Cancel).", "error");
    return;
  }
  const shouldResume = resumeAutopilotAfterPlanEdit;
  const actionStopEpoch = stopUiEpoch;
  planEditMode = false;
  resumeAutopilotAfterPlanEdit = false;
  planEditBaseline = null;
  planEditUndoStack = [];
  bulkMissionSelectedIds.clear();
  renderMissions();
  if (!shouldResume || actionStopEpoch !== stopUiEpoch) {
    setMessage("Plan editor closed. Your changes are saved.", "success");
    return;
  }
  try {
    const resumed = await resumeAutopilot();
    if (resumed) setMessage("Plan saved and Autopilot resumed with one new run.", "success");
  } catch (error) {
    setMessage(error.message || "The plan was saved, but Autopilot could not resume.", "error");
  }
}

function renderPlanHistoryControls() {
  if (!elements.planUndoButton || !elements.planRevertButton || !elements.planChangeCount) return;
  const changes = planEditUndoStack.length;
  elements.planUndoButton.disabled = !planEditMode || changes === 0;
  elements.planRevertButton.disabled = !planEditMode || changes === 0 || !planEditBaseline;
  elements.planChangeCount.textContent = changes
    ? `${changes} saved change${changes === 1 ? "" : "s"} · undo or revert before finishing`
    : "No plan changes yet";
}

async function restorePlanSnapshot(snapshot, message) {
  if (!snapshot) return;
  restoringPlanSnapshot = true;
  try {
    const next = await window.cartAssist.saveSettings(globalSettings(snapshot.products, snapshot));
    render(next);
    setMessage(message, "success");
  } finally {
    restoringPlanSnapshot = false;
    renderPlanHistoryControls();
  }
}

async function undoPlanChange() {
  const previous = planEditUndoStack.pop();
  if (!previous) return;
  await restorePlanSnapshot(previous, "Last plan change undone.");
}

async function revertPlanChanges() {
  if (!planEditBaseline || !planEditUndoStack.length) return;
  if (!window.confirm("Revert every change made since you opened the plan editor?")) return;
  const baseline = clonePlan(planEditBaseline);
  planEditUndoStack = [];
  await restorePlanSnapshot(baseline, "Plan reverted to the version from before this edit session.");
}

// Enabled changes join the current plan-edit session. When a run is active,
// the first change pauses it and leaves it paused for the remaining edits.
async function setMissionsEnabled(updates) {
  if (isArmed() && !await beginPlanEditSession()) return;
  await saveMissionList(savedProducts().map((product) => (
    updates.has(ItemMissions.itemIdForProduct(product))
      ? { ...product, enabled: updates.get(ItemMissions.itemIdForProduct(product)) }
      : updates.has(product.id)
        ? { ...product, enabled: updates.get(product.id) }
        : product
  )));
}

// --- Mission cards ---

function field(card, name) {
  return card.querySelector(`[data-field="${name}"]`);
}

function view(card, name) {
  return card.querySelector(`[data-view="${name}"]`);
}

function productStateClass(product, status) {
  if (!product.enabled) return "disabled";
  if (status.order === "confirmed") return "good";
  if (status.reason === "retailer-queue" || status.checkout === "review-ready") return "waiting";
  if (BLOCKING_REASONS.has(status.reason)) return "bad";
  if (status.eligible) return "good";
  if (status.cart !== "not-confirmed" || status.checkout !== "not-started") return "waiting";
  return "";
}

function stateLabel(product, status) {
  if (!product.enabled) return "Off";
  if (status.order === "confirmed") return "Order confirmed";
  if (status.checkout === "review-ready") return "Final review ready";
  if (status.reason === "retailer-queue") return "Retailer queue";
  if (BLOCKING_REASONS.has(status.reason)) return status.reason.replaceAll("-", " ");
  if (status.checkout === "reached") return "Checkout reached";
  if (status.cart === "confirmed") return "Cart confirmed";
  if (status.reason === "retrying" && status.eligible) return "Eligible offer — purchase action queued";
  if (status.eligible) return "Eligible offer";
  if (status.reason) return status.reason.replaceAll("-", " ");
  return "Waiting";
}

function stateShortLabel(product, status) {
  if (!product.enabled) return "Off";
  if (status.order === "confirmed") return "✓ Order";
  if (status.checkout === "review-ready") return "Review";
  if (status.reason === "retailer-queue") return "Queue";
  if (BLOCKING_REASONS.has(status.reason)) return "! Blocked";
  if (status.checkout === "reached") return "Checkout";
  if (status.cart === "confirmed") return "Cart";
  if (status.reason === "retrying" && status.eligible) return "Processing";
  if (status.eligible) return "Ready";
  return "Waiting";
}

function missionGroupOptions(select, selectedGroupId = "") {
  const ungrouped = document.createElement("option");
  ungrouped.value = "";
  ungrouped.textContent = "Ungrouped";
  const options = savedMissionGroups().map((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    return option;
  });
  select.replaceChildren(ungrouped, ...options);
  select.value = savedMissionGroups().some((group) => group.id === selectedGroupId)
    ? selectedGroupId
    : "";
}

function compactMissionPrice(price) {
  return `$${Math.round(Number(price) || 0).toLocaleString()}`;
}

function missionCapDescription(product) {
  const parts = [
    `Maximum unit price $${Number(product.maxPrice).toFixed(2)}`,
    `quantity ${product.quantity}`
  ];
  if (["review", "checkout"].includes(product.action)) {
    const taxPercent = ItemDefaults.normalizeOrderTaxPercent(currentSnapshot?.settings?.orderTaxPercent);
    const allowances = ItemDefaults.normalizeStoreOrderAllowances(currentSnapshot?.settings?.storeOrderAllowances);
    parts.push(`${taxPercent}% tax estimate`);
    parts.push(`$${allowances[product.retailer].toFixed(2)} ${STORE_LABELS[product.retailer]} allowance`);
    parts.push(`maximum final order total $${Number(product.maxOrderTotal).toFixed(2)}`);
  }
  return parts.join("; ");
}

function setMissionButtonLabel(button, label) {
  button.title = label;
  button.setAttribute("aria-label", label);
}

async function moveMission(itemId, direction) {
  const products = [...savedProducts()];
  const items = savedItems(products);
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const peers = items.filter((candidate) => (candidate.groupId || "") === (item.groupId || ""));
  const peerIndex = peers.findIndex((candidate) => candidate.id === itemId);
  const other = peers[peerIndex + direction];
  if (!other) return;
  const orderedIds = items.map((candidate) => candidate.id);
  const from = orderedIds.indexOf(itemId);
  const to = orderedIds.indexOf(other.id);
  [orderedIds[from], orderedIds[to]] = [orderedIds[to], orderedIds[from]];
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  await saveMissionList(products
    .map((product, index) => ({ product, index }))
    .sort((left, right) => (
      rank.get(ItemMissions.itemIdForProduct(left.product)) - rank.get(ItemMissions.itemIdForProduct(right.product))
      || left.index - right.index
    ))
    .map(({ product }) => product));
}

function defaultStatus() {
  return {
    eligible: false,
    reason: "",
    cart: "not-confirmed",
    checkout: "not-started",
    order: "not-confirmed",
    lastEventAt: "",
    lastMessage: "Waiting for this store option to be observed."
  };
}

function buildProductViewCard(product, status) {
  const card = elements.missionViewTemplate.content.firstElementChild.cloneNode(true);
  const stateClass = productStateClass(product, status);
  card.classList.add(stateClass || "idle");
  card.dataset.retailer = product.retailer;
  card.dataset.groupId = product.groupId || "";
  const fullState = stateLabel(product, status);
  const capDescription = missionCapDescription(product);
  card.title = `${STORE_LABELS[product.retailer]} ${product.sku} — ${capDescription} — ${fullState}: ${status.lastMessage || "Waiting."}`;
  card.setAttribute("aria-label", card.title);

  if (planEditMode) {
    const selection = document.createElement("label");
    selection.className = "mission-bulk-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = bulkMissionSelectedIds.has(product.id);
    checkbox.setAttribute("aria-label", `Select ${productLabel(product)} for a bulk plan change`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) bulkMissionSelectedIds.add(product.id);
      else bulkMissionSelectedIds.delete(product.id);
      card.classList.toggle("bulk-selected", checkbox.checked);
      renderBulkMissionControls(currentSnapshot.settings);
    });
    const selectionText = document.createElement("span");
    selectionText.textContent = "Select";
    selection.append(checkbox, selectionText);
    card.prepend(selection);
    card.classList.toggle("bulk-selected", checkbox.checked);
  }

  view(card, "enabled").checked = product.enabled !== false;
  configureMissionProductImage(card, product);
  const storeView = view(card, "store");
  const missingAffiliate = !product.affiliateOpenUrl && !product.affiliateUrl;
  storeView.textContent = missingAffiliate
    ? `\u26A0\uFE0F ${STORE_LABELS[product.retailer]}`
    : STORE_LABELS[product.retailer];
  storeView.title = missingAffiliate
    ? "No affiliate link is attached to this store option; it opens the plain product page."
    : "";
  view(card, "title").textContent = productLabel(product);

  const subParts = [];
  if (product.openAt) {
    subParts.push(`opens ${new Date(product.openAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
  }
  subParts.push(product.openAt
    ? "calendar-gated → blitz"
    : product.executionMode === "blitz"
      ? "calendar blitz"
      : "continuous watcher");
  if (product.alertLevel === "alarm") subParts.push("🔔 alarm");
  subParts.push(product.signalAutoOpen === false
    ? "signals record only"
    : product.signalEntry && product.signalEntry !== "product"
      ? product.signalEntry.replaceAll("-", " ")
      : "signals open product");
  if (product.affiliateOpenUrl) subParts.push("Custom Open link");
  if (product.affiliateUrl) subParts.push("Campaign share ready");
  if (product.action === "checkout") {
    subParts.push(product.checkoutPreflightApproved
      ? "saved checkout preflight"
      : "live checkout verification");
  }
  view(card, "sub").textContent = subParts.join(" · ");

  const priceQuantity = view(card, "priceQuantity");
  priceQuantity.textContent = `${compactMissionPrice(product.maxPrice)} ×${product.quantity}`;
  priceQuantity.title = capDescription;
  priceQuantity.setAttribute("aria-label", capDescription);
  const action = view(card, "action");
  const actionDescription = ACTION_DESCRIPTIONS[product.action] || product.action;
  action.textContent = ACTION_SHORT_LABELS[product.action] || product.action;
  action.dataset.action = product.action;
  action.title = actionDescription;
  action.setAttribute("aria-label", `Action: ${actionDescription}`);
  const age = view(card, "age");
  age.dataset.at = status.lastEventAt || "";
  age.textContent = relativeTime(status.lastEventAt || "");
  const state = view(card, "state");
  state.className = `state-chip ${stateClass}`.trim();
  state.textContent = stateShortLabel(product, status);
  state.title = `${fullState}. ${status.lastMessage || "Waiting."}`;
  state.setAttribute("aria-label", `Status: ${fullState}. ${status.lastMessage || "Waiting."}`);

  const armedNow = isArmed();
  const editButton = card.querySelector(".mission-edit");
  const removeButton = card.querySelector(".mission-remove");
  const openButton = card.querySelector(".mission-open");
  const upButton = card.querySelector(".mission-move-up");
  const downButton = card.querySelector(".mission-move-down");
  const peers = savedProducts().filter((candidate) => (
    (candidate.groupId || "") === (product.groupId || "")
  ));
  const peerIndex = peers.findIndex((candidate) => candidate.id === product.id);
  upButton.disabled = peerIndex <= 0 || Boolean(editingId);
  downButton.disabled = peerIndex === -1 || peerIndex >= peers.length - 1 || Boolean(editingId);
  setMissionButtonLabel(upButton, `Move ${productLabel(product)} up within its group`);
  setMissionButtonLabel(downButton, `Move ${productLabel(product)} down within its group`);
  setMissionButtonLabel(
    openButton,
    `Open ${productLabel(product)} ${product.affiliateOpenUrl ? "using its custom affiliate product link" : "product page"}`
  );
  setMissionButtonLabel(editButton, `Edit ${productLabel(product)}`);
  setMissionButtonLabel(removeButton, `Remove ${productLabel(product)}`);
  if (armedNow) {
    editButton.title = "Pauses Autopilot once and opens the plan editor";
    removeButton.title = "Pauses Autopilot once and keeps the plan editor open";
  }

  card.dataset.productId = product.id;
  card.draggable = true;
  card.addEventListener("dragstart", (event) => {
    if (editingId) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", product.id);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));


  upButton.addEventListener("click", () => void runAction(
    () => moveMission(product.id, -1),
    `${productLabel(product)} moved up within its group.`
  ));
  downButton.addEventListener("click", () => void runAction(
    () => moveMission(product.id, 1),
    `${productLabel(product)} moved down within its group.`
  ));

  openButton.addEventListener("click", () => {
    void runAction(
      () => window.cartAssist.openProduct(product.id),
      (result) => (result?.via === "companion-tab"
        ? `${productLabel(product)} opened in your existing Chrome tab.`
        : `${productLabel(product)} page opened in Chrome.`)
    );
  });
  const copyAffiliateButton = card.querySelector(".mission-copy-affiliate");
  setMissionButtonLabel(copyAffiliateButton, `Copy campaign share link for ${productLabel(product)}`);
  copyAffiliateButton.hidden = !product.affiliateUrl;
  if (product.affiliateUrl) {
    copyAffiliateButton.addEventListener("click", () => void runAction(
      () => copyAffiliateProduct(product),
      `${productLabel(product)} retailer-domain campaign link copied.`
    ));
  }
  editButton.addEventListener("click", () => void startEdit(product));
  removeButton.addEventListener("click", () => {
    if (!window.confirm(`Remove "${productLabel(product)}"?`)) return;
    void runAction(async () => {
      if (isArmed() && !await beginPlanEditSession()) return;
      await saveMissionList(savedProducts().filter((candidate) => candidate.id !== product.id));
    }, `${productLabel(product)} removed.`);
  });
  view(card, "enabled").addEventListener("change", (event) => {
    const enabled = event.target.checked;
    void runAction(
      () => setMissionsEnabled(new Map([[product.id, enabled]])),
      `${productLabel(product)} ${enabled ? "enabled" : "disabled"}.`
    );
  });
  card.querySelector(".mission-main").addEventListener("click", () => {
    eventFilterProductId = eventFilterProductId === product.id ? null : product.id;
    renderEvents(currentSnapshot?.events || []);
  });

  return card;
}

function aggregateItemStatus(item, statuses = {}) {
  const score = (status) => {
    if (status.order === "confirmed") return 100;
    if (BLOCKING_REASONS.has(status.reason)) return 90;
    if (status.checkout === "review-ready") return 80;
    if (status.checkout === "reached") return 70;
    if (status.cart === "confirmed") return 60;
    if (status.eligible) return 50;
    if (status.reason === "retailer-queue") return 40;
    return 0;
  };
  const activeVariants = item.variants.filter((variant) => variant.enabled !== false);
  const candidates = (activeVariants.length ? activeVariants : item.variants)
    .map((variant) => statuses[variant.id] || defaultStatus());
  const winner = [...candidates].sort((left, right) => score(right) - score(left))[0] || defaultStatus();
  const latestAt = candidates.map((status) => status.lastEventAt || "").sort().at(-1) || "";
  return { ...winner, lastEventAt: latestAt };
}

function replaceMissionButton(card, selector, label, handler) {
  const current = card.querySelector(selector);
  const replacement = current.cloneNode(true);
  current.replaceWith(replacement);
  setMissionButtonLabel(replacement, label);
  replacement.addEventListener("click", handler);
  return replacement;
}

function buildViewCard(itemInput, statuses = {}) {
  const item = Array.isArray(itemInput?.variants)
    ? itemInput
    : ItemMissions.groupProductsByItem([itemInput])[0];
  const product = item.primary;
  const statusMap = statuses && Object.prototype.hasOwnProperty.call(statuses, "eligible")
    ? { [product.id]: statuses }
    : (statuses || {});
  const status = aggregateItemStatus(item, statusMap);
  const card = buildProductViewCard({ ...product, enabled: item.enabled }, status);
  card.dataset.itemId = item.id;
  card.dataset.retailer = item.variants.map((variant) => variant.retailer).join(" ");
  const main = card.querySelector(".mission-main");
  const imageWrap = view(card, "imageWrap");
  const titleRow = card.querySelector(".mission-title-row");
  const storeView = view(card, "store");
  const subView = view(card, "sub");
  main.classList.add("item-first-main");
  main.prepend(imageWrap);
  storeView.remove();
  main.insertBefore(storeView, subView);
  titleRow.classList.add("item-title-row");
  card.setAttribute("aria-label", `${itemLabel(item)}. Store options: ${item.variants.map((variant) => STORE_LABELS[variant.retailer]).join(", ")}. ${stateLabel({ ...product, enabled: item.enabled }, status)}.`);

  const oldSelection = card.querySelector(".mission-bulk-select");
  if (oldSelection) oldSelection.remove();
  card.classList.remove("bulk-selected");
  if (planEditMode) {
    const selection = document.createElement("label");
    selection.className = "mission-bulk-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = bulkMissionSelectedIds.has(item.id);
    checkbox.setAttribute("aria-label", `Select ${itemLabel(item)} for a bulk plan change`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) bulkMissionSelectedIds.add(item.id);
      else bulkMissionSelectedIds.delete(item.id);
      card.classList.toggle("bulk-selected", checkbox.checked);
      renderBulkMissionControls(currentSnapshot.settings);
    });
    const selectionText = document.createElement("span");
    selectionText.textContent = "Select";
    selection.append(checkbox, selectionText);
    card.prepend(selection);
    card.classList.toggle("bulk-selected", checkbox.checked);
  }

  const enabledInput = view(card, "enabled");
  const enabledReplacement = enabledInput.cloneNode(true);
  enabledInput.replaceWith(enabledReplacement);
  enabledReplacement.checked = item.enabled;
  enabledReplacement.indeterminate = item.enabled && !item.allEnabled;
  enabledReplacement.setAttribute("aria-label", `Turn ${itemLabel(item)} on or off at every selected store`);
  enabledReplacement.addEventListener("change", () => void runAction(
    () => setMissionsEnabled(new Map([[item.id, enabledReplacement.checked]])),
    `${itemLabel(item)} turned ${enabledReplacement.checked ? "On" : "Off"} at every selected store.`
  ));

  view(card, "title").textContent = itemLabel(item);
  storeView.className = "store-name item-store-options";
  storeView.replaceChildren(...ItemMissions.RETAILERS.map((retailer) => {
    const variant = item.stores[retailer];
    const option = document.createElement("span");
    option.className = `item-store-option${variant ? " selected" : ""}`;
    const label = document.createElement("label");
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = Boolean(variant);
    toggle.setAttribute("aria-label", `${variant ? "Remove" : "Add"} ${STORE_LABELS[retailer]} store option`);
    const text = document.createElement("span");
    text.textContent = `${variant && !variant.affiliateOpenUrl && !variant.affiliateUrl ? "⚠ " : ""}${STORE_LABELS[retailer]}`;
    label.append(toggle, text);
    toggle.addEventListener("change", () => {
      toggle.checked = Boolean(variant);
      if (!variant) {
        void startEdit(item, null, retailer);
        return;
      }
      if (item.variants.length === 1) {
        setMessage("Every item needs at least one store option.", "error");
        return;
      }
      if (!window.confirm(`Remove ${STORE_LABELS[retailer]} as a store option for “${itemLabel(item)}”?`)) return;
      void runAction(async () => {
        if (!planEditMode && !await beginPlanEditSession()) return;
        await saveMissionList(savedProducts().filter((candidate) => candidate.id !== variant.id));
      }, `${STORE_LABELS[retailer]} removed from ${itemLabel(item)}.`);
    });
    option.append(label);
    if (variant) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "item-store-open";
      open.textContent = "↗";
      setMissionButtonLabel(open, `Open ${STORE_LABELS[retailer]} option for ${itemLabel(item)}`);
      open.addEventListener("click", () => void runAction(
        () => window.cartAssist.openProduct(variant.id),
        `${STORE_LABELS[retailer]} option opened in Chrome.`
      ));
      option.append(open);
    }
    return option;
  }));

  const prices = item.variants.map((variant) => Number(variant.maxPrice) || 0);
  const minimumPrice = Math.min(...prices);
  const maximumPrice = Math.max(...prices);
  const priceView = view(card, "priceQuantity");
  priceView.textContent = `${compactMissionPrice(minimumPrice)}${maximumPrice !== minimumPrice ? `–${compactMissionPrice(maximumPrice)}` : ""} ×${item.quantity}`;
  priceView.title = item.variants.map((variant) => `${STORE_LABELS[variant.retailer]}: ${missionCapDescription(variant)}`).join(" · ");
  priceView.setAttribute("aria-label", priceView.title);

  const peers = savedItems().filter((candidate) => (candidate.groupId || "") === (item.groupId || ""));
  const peerIndex = peers.findIndex((candidate) => candidate.id === item.id);
  const up = replaceMissionButton(card, ".mission-move-up", `Move ${itemLabel(item)} up within its group`, () => void runAction(
    () => moveMission(item.id, -1),
    `${itemLabel(item)} moved up within its group.`
  ));
  const down = replaceMissionButton(card, ".mission-move-down", `Move ${itemLabel(item)} down within its group`, () => void runAction(
    () => moveMission(item.id, 1),
    `${itemLabel(item)} moved down within its group.`
  ));
  up.disabled = peerIndex <= 0 || Boolean(editingId);
  down.disabled = peerIndex === -1 || peerIndex >= peers.length - 1 || Boolean(editingId);
  replaceMissionButton(card, ".mission-open", `Open the primary ${STORE_LABELS[product.retailer]} option for ${itemLabel(item)}${product.affiliateOpenUrl ? " using its custom affiliate product link" : ""}`, () => void runAction(
    () => window.cartAssist.openProduct(product.id),
    `${itemLabel(item)} opened in Chrome.`
  ));
  const copy = replaceMissionButton(card, ".mission-copy-affiliate", `Copy campaign share link for ${itemLabel(item)}`, () => void runAction(
    () => copyAffiliateProduct(product),
    `${itemLabel(item)} retailer-domain campaign link copied.`
  ));
  copy.hidden = !product.affiliateUrl;
  const issueVariant = item.variants.find((variant) => variant.enabled !== false && BLOCKING_REASONS.has(statusMap[variant.id]?.reason))
    || item.variants.find((variant) => variant.enabled !== false && variant.action !== "watch" && Number(variant.maxPrice) <= 0)
    || item.variants.find((variant) => variant.enabled !== false && variant.openAt && new Date(variant.openAt).getTime() < Date.now() - 120_000);
  if (issueVariant) {
    const fix = document.createElement("button");
    fix.type = "button";
    fix.className = "mission-icon-button mission-fix";
    fix.textContent = "!";
    const runtimeBlocked = BLOCKING_REASONS.has(statusMap[issueVariant.id]?.reason);
    setMissionButtonLabel(fix, runtimeBlocked
      ? `Open ${STORE_LABELS[issueVariant.retailer]} to resolve the blocking status for ${itemLabel(item)}`
      : `Edit ${itemLabel(item)} to fix its cap or missed schedule`);
    fix.addEventListener("click", () => {
      if (runtimeBlocked) {
        eventFilterProductId = issueVariant.id;
        renderEvents(currentSnapshot?.events || []);
        void runAction(() => window.cartAssist.openProduct(issueVariant.id), `${STORE_LABELS[issueVariant.retailer]} opened for recovery.`);
      } else {
        void startEdit(item, null, issueVariant.retailer);
      }
    });
    card.querySelector(".row-actions").prepend(fix);
  }
  replaceMissionButton(card, ".mission-edit", `Edit ${itemLabel(item)} and its store options`, () => void startEdit(item));
  replaceMissionButton(card, ".mission-remove", `Remove ${itemLabel(item)}`, () => {
    if (!window.confirm(`Remove “${itemLabel(item)}” and all selected store options?`)) return;
    void runAction(async () => {
      if (!planEditMode && !await beginPlanEditSession()) return;
      await saveMissionList(savedProducts().filter((candidate) => ItemMissions.itemIdForProduct(candidate) !== item.id));
    }, `${itemLabel(item)} removed.`);
  });

  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", item.id);
  });
  return card;
}

function blankStoreDraft(retailer, shared = {}) {
  return {
    ...shared,
    id: "",
    retailer,
    productUrl: "",
    affiliateOpenUrl: "",
    affiliateUrl: "",
    imageUrl: "",
    sku: "",
    maxPrice: 0,
    maxOrderTotal: 0,
    msrpRecordId: "",
    priceSource: "",
    signalEntry: "product",
    checkoutPreflightApproved: false,
    checkoutPreflightCapturedAt: ""
  };
}

function captureActiveStoreDraft(card) {
  const retailer = card.__activeRetailer;
  if (!retailer) return;
  const previous = card.__routeDrafts.get(retailer) || blankStoreDraft(retailer);
  card.__routeDrafts.set(retailer, {
    ...previous,
    retailer,
    productUrl: field(card, "productUrl").value.trim(),
    affiliateOpenUrl: field(card, "affiliateOpenUrl").value.trim(),
    imageUrl: field(card, "imageUrl").value,
    sku: retailer === "amazon" ? field(card, "sku").value.trim().toUpperCase() : field(card, "sku").value.trim(),
    maxPrice: Number(field(card, "maxPrice").value),
    maxOrderTotal: ItemDefaults.calculateOrderTotalCap({
      retailer,
      maxPrice: Number(field(card, "maxPrice").value),
      quantity: Number(field(card, "quantity").value),
      action: field(card, "action").value
    }, currentSnapshot?.settings?.storeOrderAllowances, currentSnapshot?.settings?.orderTaxPercent),
    msrpRecordId: field(card, "msrpRecordId").value,
    priceSource: field(card, "priceSource").value || (Number(field(card, "maxPrice").value) > 0 ? "manual" : ""),
    signalEntry: field(card, "signalEntry").value
  });
}

function loadActiveStoreDraft(card, retailer) {
  const draft = card.__routeDrafts.get(retailer) || blankStoreDraft(retailer);
  card.__activeRetailer = retailer;
  field(card, "retailer").value = retailer;
  field(card, "productUrl").value = draft.productUrl || "";
  field(card, "affiliateOpenUrl").value = draft.affiliateOpenUrl || "";
  field(card, "imageUrl").value = draft.imageUrl || "";
  field(card, "sku").value = draft.sku || "";
  field(card, "maxPrice").value = Number(draft.maxPrice || 0) > 0 ? String(Number(draft.maxPrice)) : "";
  field(card, "maxOrderTotal").value = String(Number(draft.maxOrderTotal || 0));
  field(card, "msrpRecordId").value = draft.msrpRecordId || "";
  field(card, "priceSource").value = draft.priceSource || "";
  field(card, "signalEntry").value = draft.signalEntry || "product";
  updateEditStore(card);
  updateMissionOrderTotal(card);
  card.__validateAffiliateOpenUrl?.();
}

function buildEditCard(product, options = {}) {
  const item = itemForProduct(product);
  const sharedProduct = item?.primary || product || {};
  const requestedRetailer = options.preferredRetailer || sharedProduct.retailer || "target";
  const routeDrafts = new Map((item?.variants || (product ? [product] : []))
    .map((variant) => [variant.retailer, { ...variant }]));
  if (!routeDrafts.size) routeDrafts.set(requestedRetailer, blankStoreDraft(requestedRetailer, sharedProduct));
  if (!routeDrafts.has(requestedRetailer)) {
    routeDrafts.set(requestedRetailer, blankStoreDraft(requestedRetailer, sharedProduct));
  }
  product = { ...sharedProduct, ...routeDrafts.get(requestedRetailer), retailer: requestedRetailer };
  const card = elements.missionEditTemplate.content.firstElementChild.cloneNode(true);
  card.__routeDrafts = routeDrafts;
  card.__activeRetailer = requestedRetailer;
  card.__itemId = item?.id || `item:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  const retailer = requestedRetailer;
  const initialProfile = ItemDefaults.itemProfileById(
    product?.itemProfileId || currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID,
    currentSnapshot?.settings?.itemProfiles || []
  ) || ItemDefaults.BUILT_IN_ITEM_PROFILES[0];
  field(card, "retailer").value = retailer;
  field(card, "title").value = product?.title || "";
  field(card, "imageUrl").value = product?.imageUrl || "";
  field(card, "productUrl").value = product?.productUrl || "";
  field(card, "affiliateOpenUrl").value = product?.affiliateOpenUrl || "";
  field(card, "sku").value = product?.sku || "";
  field(card, "maxPrice").value = product ? String(Number(product.maxPrice || 0)) : "";
  field(card, "maxOrderTotal").value = String(Number(product?.maxOrderTotal || 0));
  field(card, "quantity").value = product?.quantity || initialProfile.settings.quantity;
  field(card, "action").value = product?.action || initialProfile.settings.action;
  field(card, "alertLevel").value = product?.alertLevel || initialProfile.settings.alertLevel;
  field(card, "fulfillmentMode").value = product?.fulfillmentMode || initialProfile.settings.fulfillmentMode;
  field(card, "signalEntry").value = product?.signalEntry || "product";
  field(card, "signalAutoOpen").checked = product ? product.signalAutoOpen !== false : true;
  field(card, "acceptPartial").checked = product ? product.acceptPartial !== false : true;
  itemProfileOptions(
    field(card, "itemProfileId"),
    product?.itemProfileId || currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID
  );
  missionGroupOptions(field(card, "groupId"), product?.groupId || "");
  field(card, "msrpRecordId").value = product?.msrpRecordId || "";
  field(card, "priceSource").value = product?.priceSource || "";
  field(card, "openAt").value = toLocalInputValue(product?.openAt);
  field(card, "enabled").checked = options.isNew ? false : product.enabled !== false;
  updateEditStore(card);
  updateMissionOrderTotal(card);

  const storePicker = document.createElement("fieldset");
  storePicker.className = "item-store-picker";
  const storeLegend = document.createElement("legend");
  storeLegend.textContent = "Store options";
  const storeHelp = document.createElement("small");
  storeHelp.textContent = "Choose every store that can fulfill this item. They share one quantity, schedule, and action; the first store to secure it stops the others for that run.";
  const storeChoices = document.createElement("div");
  storeChoices.className = "item-store-picker-choices";
  storePicker.append(storeLegend, storeHelp, storeChoices);
  card.querySelector(".product-url-field").before(storePicker);

  const renderStorePicker = () => {
    for (const option of field(card, "retailer").options) {
      option.disabled = !card.__routeDrafts.has(option.value);
    }
    field(card, "retailer").title = "Store option currently being edited. Use the toggles below to add or remove stores.";
    storeChoices.replaceChildren(...ItemMissions.RETAILERS.map((store) => {
      const option = document.createElement("div");
      option.className = `item-store-picker-option${card.__activeRetailer === store ? " active" : ""}`;
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = card.__routeDrafts.has(store);
      checkbox.setAttribute("aria-label", `${checkbox.checked ? "Remove" : "Add"} ${STORE_LABELS[store]} store option`);
      const name = document.createElement("span");
      name.textContent = STORE_LABELS[store];
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "item-store-picker-edit";
      edit.textContent = card.__activeRetailer === store ? "Editing" : "Edit";
      edit.disabled = !checkbox.checked || card.__activeRetailer === store;
      edit.addEventListener("click", (event) => {
        event.preventDefault();
        captureActiveStoreDraft(card);
        loadActiveStoreDraft(card, store);
        renderStorePicker();
      });
      checkbox.addEventListener("change", () => {
        captureActiveStoreDraft(card);
        if (checkbox.checked) {
          card.__routeDrafts.set(store, blankStoreDraft(store, sharedProduct));
          loadActiveStoreDraft(card, store);
        } else {
          if (card.__routeDrafts.size === 1) {
            checkbox.checked = true;
            setMessage("Every item needs at least one store option.", "error");
            return;
          }
          card.__routeDrafts.delete(store);
          if (card.__activeRetailer === store) {
            loadActiveStoreDraft(card, card.__routeDrafts.keys().next().value);
          }
        }
        renderStorePicker();
      });
      label.append(checkbox, name);
      option.append(label, edit);
      return option;
    }));
  };
  renderStorePicker();

  const validateAffiliateOpenUrl = () => {
    const input = field(card, "affiliateOpenUrl");
    const value = input.value.trim();
    if (!value) {
      input.setCustomValidity("");
      return;
    }
    try {
      const parsed = new URL(value);
      const expectedRetailer = field(card, "retailer").value;
      const expectedSku = field(card, "sku").value.trim().toUpperCase();
      const actualRetailer = detectRetailer(parsed.href);
      const actualSku = extractSku(actualRetailer, parsed.href).toUpperCase();
      const valid = parsed.protocol === "https:"
        && !parsed.username
        && !parsed.password
        && actualRetailer === expectedRetailer
        && actualSku === expectedSku;
      input.setCustomValidity(valid
        ? ""
        : "Use a direct HTTPS product link for this store option’s exact store and item ID.");
    } catch {
      input.setCustomValidity("Enter a valid direct HTTPS product link.");
    }
  };
  card.__validateAffiliateOpenUrl = validateAffiliateOpenUrl;
  validateAffiliateOpenUrl();

  const advanced = card.querySelector(".advanced-fields");
  advanced.open = Boolean(product && (
    ["review", "checkout"].includes(product.action)
    || Number(product.maxOrderTotal) > 0
    || (product.signalEntry || "product") !== "product"
    || product.signalAutoOpen === false
  ));

  const validateFulfillmentSelection = () => {
    const fulfillment = field(card, "fulfillmentMode");
    const requiresExplicitMode = field(card, "action").value === "checkout";
    fulfillment.setCustomValidity(requiresExplicitMode && fulfillment.value === "manual"
      ? "Choose Shipping / delivery or Store pickup before enabling automatic order submission."
      : "");
    if (requiresExplicitMode && fulfillment.value === "manual") advanced.open = true;
  };
  validateFulfillmentSelection();

  field(card, "retailer").addEventListener("change", () => {
    const nextRetailer = field(card, "retailer").value;
    captureActiveStoreDraft(card);
    if (!card.__routeDrafts.has(nextRetailer)) {
      card.__routeDrafts.set(nextRetailer, blankStoreDraft(nextRetailer, sharedProduct));
    }
    loadActiveStoreDraft(card, nextRetailer);
    renderStorePicker();
  });
  field(card, "productUrl").addEventListener("change", () => {
    const url = field(card, "productUrl").value;
    const detected = detectRetailer(url);
    if (detected) {
      if (detected !== card.__activeRetailer) {
        const previousUrl = card.__routeDrafts.get(card.__activeRetailer)?.productUrl || "";
        field(card, "productUrl").value = previousUrl;
        captureActiveStoreDraft(card);
        if (!card.__routeDrafts.has(detected)) card.__routeDrafts.set(detected, blankStoreDraft(detected, sharedProduct));
        loadActiveStoreDraft(card, detected);
        field(card, "productUrl").value = url;
        renderStorePicker();
      }
      const detectedSku = extractSku(detected, url);
      if (detectedSku) field(card, "sku").value = detectedSku;
      // A pasted link that carries tracking parameters is a full affiliate
      // link. Saving strips the product link down to its canonical form, so
      // preserve the full link as the mission's affiliate open link.
      try {
        const parsed = new URL(url.trim());
        if (parsed.search && detectedSku && !field(card, "affiliateOpenUrl").value.trim()) {
          field(card, "affiliateOpenUrl").value = parsed.href;
        }
      } catch {
        // Invalid URLs are surfaced by the product link field's own validation.
      }
    }
    if (!field(card, "title").value.trim()) {
      field(card, "title").value = deriveTitleFromUrl(url);
    }
    if (options.isNew) {
      try {
        applyProfileToEditor(card);
      } catch {
        // URL validation and final save surface actionable errors. Profile
        // matching itself remains a convenience during editing.
      }
    }
    validateAffiliateOpenUrl();
  });
  field(card, "sku").addEventListener("change", () => {
    if (field(card, "retailer").value === "amazon") {
      field(card, "sku").value = field(card, "sku").value.trim().toUpperCase();
    }
    validateAffiliateOpenUrl();
  });
  field(card, "affiliateOpenUrl").addEventListener("input", validateAffiliateOpenUrl);
  field(card, "action").addEventListener("change", () => {
    if (["review", "checkout"].includes(field(card, "action").value)) advanced.open = true;
    validateFulfillmentSelection();
    updateSignalEntryOptions(card);
    updateMissionOrderTotal(card);
  });
  field(card, "fulfillmentMode").addEventListener("change", validateFulfillmentSelection);
  field(card, "maxPrice").addEventListener("change", () => {
    field(card, "priceSource").value = Number(field(card, "maxPrice").value) > 0 ? "manual" : "";
    updateMissionOrderTotal(card, { enableWhenPriced: options.isNew });
  });
  field(card, "maxPrice").addEventListener("input", () => updateMissionOrderTotal(card));
  field(card, "quantity").addEventListener("change", () => updateMissionOrderTotal(card));
  field(card, "quantity").addEventListener("input", () => updateMissionOrderTotal(card));
  field(card, "itemProfileId").addEventListener("change", () => {
    try {
      const applied = applyProfileToEditor(card);
      setMessage(applied.enabled
        ? `Template applied immediately to ${applied.storeCount} store option${applied.storeCount === 1 ? "" : "s"}; every selected store has a positive cap.`
        : `Template applied to every selected store. ${applied.readyStores} of ${applied.storeCount} store option${applied.storeCount === 1 ? " has" : "s have"} a positive cap, so the item remains Off until the rest are priced or removed.`,
      applied.enabled ? "success" : "warn");
    } catch (error) {
      setMessage(error.message || "The item profile could not be applied.", "error");
    }
  });
  card.querySelector(".mission-done").addEventListener("click", () => void finishEdit(card));
  const cancel = () => {
    editingId = null;
    editCardNode = null;
    renderMissions();
  };
  card.querySelector(".mission-cancel").addEventListener("click", cancel);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void finishEdit(card);
    }
  });
  return card;
}

function updateEditStore(card) {
  const retailer = field(card, "retailer").value;
  card.dataset.retailer = retailer;
  card.querySelector(".sku-label").textContent = SKU_LABELS[retailer];
  const skuInput = field(card, "sku");
  skuInput.placeholder = retailer === "amazon" ? "B0ABC12345" : "Auto-filled from the link";
  skuInput.inputMode = retailer === "amazon" ? "text" : "numeric";
  updateSignalEntryOptions(card);
}

function updateSignalEntryOptions(card) {
  const retailer = field(card, "retailer").value;
  const action = field(card, "action").value;
  const select = field(card, "signalEntry");
  const allowed = new Set(["product"]);
  if (retailer === "walmart" && ["review", "checkout"].includes(action)) allowed.add("walmart-buy-now");
  if (retailer === "amazon" && action !== "watch") allowed.add("amazon-atc");
  if (retailer === "amazon" && ["review", "checkout"].includes(action)) allowed.add("amazon-buy-now");
  for (const option of select.options) {
    option.hidden = !allowed.has(option.value);
    option.disabled = !allowed.has(option.value);
  }
  if (!allowed.has(select.value)) select.value = "product";
}

function reportInvalid(input) {
  const details = input.closest("details");
  if (details && !details.open) details.open = true;
  input.reportValidity();
}

function missionOrderTotalFromCard(card) {
  return ItemDefaults.calculateOrderTotalCap({
    retailer: field(card, "retailer").value,
    maxPrice: Number(field(card, "maxPrice").value),
    quantity: Number(field(card, "quantity").value),
    action: field(card, "action").value
  }, currentSnapshot?.settings?.storeOrderAllowances, currentSnapshot?.settings?.orderTaxPercent);
}

function updateMissionOrderTotal(card, options = {}) {
  const total = missionOrderTotalFromCard(card);
  field(card, "maxOrderTotal").value = String(total);
  const maxPrice = Number(field(card, "maxPrice").value);
  if (!options.enableWhenPriced || !Number.isFinite(maxPrice) || maxPrice <= 0) return;
  const profile = ItemDefaults.itemProfileById(
    field(card, "itemProfileId").value,
    currentSnapshot?.settings?.itemProfiles || []
  );
  if (profile && ItemDefaults.normalizeItemProfileSettings(profile.settings).enabled) {
    field(card, "enabled").checked = true;
  }
}

function allowedSignalEntry(retailer, action, requested) {
  if (requested === "walmart-buy-now" && retailer === "walmart" && ["review", "checkout"].includes(action)) return requested;
  if (requested === "amazon-atc" && retailer === "amazon" && action !== "watch") return requested;
  if (requested === "amazon-buy-now" && retailer === "amazon" && ["review", "checkout"].includes(action)) return requested;
  return "product";
}

function collectMissions(card) {
  captureActiveStoreDraft(card);
  const openAtValue = field(card, "openAt").value;
  const shared = {
    itemId: card.__itemId,
    title: field(card, "title").value.trim(),
    openAt: openAtValue ? new Date(openAtValue).toISOString() : "",
    quantity: Number(field(card, "quantity").value),
    action: field(card, "action").value,
    alertLevel: field(card, "alertLevel").value,
    fulfillmentMode: field(card, "fulfillmentMode").value,
    itemProfileId: field(card, "itemProfileId").value,
    groupId: field(card, "groupId").value,
    signalAutoOpen: field(card, "signalAutoOpen").checked,
    acceptPartial: field(card, "acceptPartial").checked,
    enabled: field(card, "enabled").checked
  };
  return [...card.__routeDrafts.values()].map((draft) => {
    if (!draft.productUrl) throw new Error(`Paste the ${STORE_LABELS[draft.retailer]} product link or turn that store option off.`);
    let parsedRetailer = "";
    let parsedSku = "";
    try {
      parsedRetailer = detectRetailer(draft.productUrl);
      parsedSku = extractSku(parsedRetailer, draft.productUrl);
    } catch {
      // The normal settings validator returns the detailed URL error below.
    }
    if (parsedRetailer && parsedRetailer !== draft.retailer) {
      throw new Error(`${STORE_LABELS[draft.retailer]} is selected, but its product link belongs to ${STORE_LABELS[parsedRetailer] || "another store"}.`);
    }
    const sku = draft.retailer === "amazon"
      ? String(draft.sku || parsedSku).toUpperCase()
      : String(draft.sku || parsedSku);
    const maxPrice = Number(draft.maxPrice || 0);
    const route = {
      ...draft,
      ...shared,
      retailer: draft.retailer,
      productUrl: draft.productUrl,
      affiliateOpenUrl: draft.affiliateOpenUrl || "",
      imageUrl: draft.imageUrl || "",
      sku,
      maxPrice,
      maxOrderTotal: ItemDefaults.calculateOrderTotalCap({
        retailer: draft.retailer,
        maxPrice,
        quantity: shared.quantity,
        action: shared.action
      }, currentSnapshot?.settings?.storeOrderAllowances, currentSnapshot?.settings?.orderTaxPercent),
      msrpRecordId: draft.msrpRecordId || "",
      priceSource: draft.priceSource || (maxPrice > 0 ? "manual" : ""),
      signalEntry: allowedSignalEntry(draft.retailer, shared.action, draft.signalEntry),
      checkoutPreflightApproved: draft.checkoutPreflightApproved === true,
      checkoutPreflightCapturedAt: draft.checkoutPreflightCapturedAt || ""
    };
    return route;
  });
}

async function finishEdit(card) {
  for (const input of card.querySelectorAll("input, select")) {
    if (!input.checkValidity()) {
      reportInvalid(input);
      return;
    }
  }
  let missions;
  try {
    missions = collectMissions(card);
  } catch (error) {
    setMessage(error.message || "Review the selected store options.", "error");
    return;
  }
  const existing = savedProducts();
  let products;
  if (editingId === "new") {
    products = [...existing, ...missions];
  } else {
    const firstIndex = existing.findIndex((candidate) => ItemMissions.itemIdForProduct(candidate) === editingId);
    products = existing.filter((candidate) => ItemMissions.itemIdForProduct(candidate) !== editingId);
    products.splice(firstIndex < 0 ? products.length : firstIndex, 0, ...missions);
  }
  const saved = await runAction(
    () => saveMissionList(products),
    `Item saved with ${missions.length} store option${missions.length === 1 ? "" : "s"}. The browser companion picks it up within a few seconds.`
  );
  if (saved) {
    editingId = null;
    editCardNode = null;
    renderMissions();
  }
}

async function startEdit(product, seed = null, preferredRetailer = "") {
  if (editingId) {
    setMessage("Finish the open item editor first (Done or Cancel).", "error");
    return;
  }
  if (isArmed() && !await beginPlanEditSession()) return;
  const item = itemForProduct(product);
  editingId = item ? item.id : "new";
  editCardNode = buildEditCard(item || seed, { isNew: !item, preferredRetailer });
  renderMissions();
  editCardNode.querySelector("[data-field='productUrl']").focus();
}

function setBulkImportResult(text, kind = "") {
  elements.bulkImportResult.textContent = text;
  elements.bulkImportResult.className = `bulk-import-result ${kind}`.trim();
}

function closeBulkImportDialog() {
  if (bulkImportInFlight) return;
  if (typeof elements.bulkImportDialog.close === "function") elements.bulkImportDialog.close();
  else elements.bulkImportDialog.removeAttribute("open");
  bulkImportPreviewText = "";
  elements.bulkImportSubmitButton.textContent = "Preview import";
}

async function openBulkImportDialog() {
  if (editingId) {
    setMessage("Finish the open item editor before importing URLs.", "error");
    return;
  }
  if (isArmed() && !await beginPlanEditSession()) return;
  elements.bulkImportText.value = "";
  bulkImportPreviewText = "";
  elements.bulkImportSubmitButton.textContent = "Preview import";
  setBulkImportResult("");
  if (typeof elements.bulkImportDialog.showModal === "function") elements.bulkImportDialog.showModal();
  else elements.bulkImportDialog.setAttribute("open", "");
  elements.bulkImportText.focus();
}

function bulkImportSummaryText(summary = {}) {
  const parts = [];
  if (summary.imported) parts.push(`${summary.imported} imported with the default template`);
  if (summary.ready) parts.push(`${summary.ready} ready with approved MSRP`);
  if (summary.needsPrice) parts.push(`${summary.needsPrice} left Off pending price approval`);
  if (summary.duplicates) parts.push(`${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped`);
  if (summary.invalid) parts.push(`${summary.invalid} invalid line${summary.invalid === 1 ? "" : "s"}`);
  if (summary.overCapacity) parts.push(`${summary.overCapacity} over the ${MAX_MISSIONS}-store-option safety limit`);
  return parts.join(" · ") || "No product URLs were found.";
}

async function submitBulkImport() {
  if (bulkImportInFlight) return;
  const text = elements.bulkImportText.value.trim();
  if (!text) {
    setBulkImportResult("Paste at least one product URL.", "error");
    elements.bulkImportText.focus();
    return;
  }

  bulkImportInFlight = true;
  elements.bulkImportSubmitButton.disabled = true;
  elements.bulkImportCancelButton.disabled = true;
  setBulkImportResult("Validating and deduplicating URLs…");
  try {
    if (window.cartAssist.previewBulkImport && bulkImportPreviewText !== text) {
      const preview = await window.cartAssist.previewBulkImport(text);
      const summaryText = bulkImportSummaryText(preview.summary);
      const issueText = (preview.issues || []).map((issue) => `Line ${issue.line}: ${issue.reason}`).join(" ");
      setBulkImportResult(`Preview: ${summaryText}.${issueText ? ` ${issueText}` : ""} Nothing has been added yet.`, preview.summary?.imported ? "success" : "warn");
      bulkImportPreviewText = text;
      elements.bulkImportSubmitButton.textContent = preview.summary?.imported ? "Confirm import" : "Preview again";
      return;
    }
    const before = planEditMode ? capturePlanSnapshot() : null;
    const result = await window.cartAssist.bulkImportMissions(text);
    render(result.snapshot);
    if (result.summary?.imported > 0) recordPlanChange(before);
    const summaryText = bulkImportSummaryText(result.summary);
    const issueText = (result.issues || []).map((issue) => `Line ${issue.line}: ${issue.reason}`).join(" ");
    if (result.summary?.imported > 0) {
      bulkImportPreviewText = "";
      bulkImportInFlight = false;
      closeBulkImportDialog();
      setMessage(`${summaryText}. Review each imported item before enabling it.`, "success");
      return;
    }
    setBulkImportResult(`${summaryText}${issueText ? ` ${issueText}` : ""}`, "error");
  } catch (error) {
    setBulkImportResult(error.message || "The URL import failed.", "error");
  } finally {
    bulkImportInFlight = false;
    elements.bulkImportSubmitButton.disabled = false;
    elements.bulkImportCancelButton.disabled = false;
  }
}

function catalogRetailerInputs() {
  return [
    ["target", elements.catalogTarget],
    ["walmart", elements.catalogWalmart],
    ["amazon", elements.catalogAmazon]
  ];
}

function catalogSearchInput() {
  return {
    query: elements.catalogQuery.value.trim(),
    retailers: catalogRetailerInputs().filter(([, input]) => input.checked).map(([retailer]) => retailer),
    filters: {
      includeWords: elements.catalogIncludeWords.value,
      excludeWords: elements.catalogExcludeWords.value,
      maxPrice: elements.catalogMaxPrice.value
    }
  };
}

function setCatalogFormFromSearch(search) {
  if (!search) return;
  elements.catalogQuery.value = search.query || "";
  for (const [retailer, input] of catalogRetailerInputs()) {
    input.checked = (search.retailers || []).includes(retailer);
  }
  elements.catalogIncludeWords.value = (search.filters?.includeWords || []).join(" ");
  elements.catalogExcludeWords.value = (search.filters?.excludeWords || []).join(" ");
  elements.catalogMaxPrice.value = search.filters?.maxPrice ?? "";
}

function catalogStatusText(catalog) {
  const search = catalog?.activeSearch;
  if (!search) return catalog?.items?.length
    ? "Showing the locally saved results from the last search."
    : "Enter a keyword to begin.";
  if (new Date(search.expiresAt).getTime() <= Date.now()) {
    return `“${search.query}” expired. Select Search / refresh to capture the pages again.`;
  }
  const stores = (search.retailers || []).map((retailer) => {
    const entry = search.status?.[retailer] || {};
    const label = STORE_LABELS[retailer] || retailer;
    return entry.state === "captured"
      ? `${label}: ${Number(entry.count) || 0} captured`
      : `${label}: waiting for visible results`;
  });
  return `“${search.query}” · ${stores.join(" · ")}`;
}

function renderCatalog(catalog = {}) {
  const search = catalog.activeSearch || null;
  const searchId = String(search?.id || "");
  if (searchId !== renderedCatalogSearchId) {
    renderedCatalogSearchId = searchId;
    catalogSelectedIds.clear();
    catalogSeenIds.clear();
    setCatalogFormFromSearch(search);
  }

  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const missionIds = new Set((currentSnapshot?.settings?.products || []).map((product) => product.id));
  const prepIds = new Set((currentSnapshot?.settings?.walmartPrepCandidates || []).map((candidate) => candidate.id));
  const existingIds = new Set([...missionIds, ...prepIds]);
  const currentIds = new Set(items.map((item) => item.id));
  for (const id of [...catalogSelectedIds]) {
    if (!currentIds.has(id) || existingIds.has(id)) catalogSelectedIds.delete(id);
  }
  for (const id of [...catalogSeenIds]) {
    if (!currentIds.has(id)) catalogSeenIds.delete(id);
  }
  for (const item of items) {
    if (!catalogSeenIds.has(item.id)) {
      catalogSeenIds.add(item.id);
      if (!existingIds.has(item.id)) catalogSelectedIds.add(item.id);
    }
  }

  elements.catalogList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = search ? "Waiting for visible retailer result cards…" : "No catalog results yet.";
    elements.catalogList.append(empty);
  }
  for (const item of items) {
    const alreadyAdded = existingIds.has(item.id);
    const card = document.createElement("article");
    card.className = `catalog-card${alreadyAdded ? " already-added" : ""}`;
    card.dataset.retailer = item.retailer;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = catalogSelectedIds.has(item.id) && !alreadyAdded;
    checkbox.disabled = alreadyAdded || catalogImportInFlight;
    checkbox.setAttribute("aria-label", `Select ${item.title}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) catalogSelectedIds.add(item.id);
      else catalogSelectedIds.delete(item.id);
      renderCatalog(currentSnapshot?.catalog || {});
    });

    const main = document.createElement("div");
    main.className = "catalog-result-main";
    const title = document.createElement("strong");
    title.className = "catalog-result-title";
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "catalog-result-meta";
    meta.textContent = `${STORE_LABELS[item.retailer] || item.retailer} · ${SKU_LABELS[item.retailer] || "Item ID"} ${item.sku} · ${relativeTime(item.observedAt)}`;
    const productUrl = document.createElement("div");
    productUrl.className = "catalog-result-url";
    productUrl.textContent = item.productUrl;
    productUrl.title = item.productUrl;
    main.append(title, meta, productUrl);

    const price = document.createElement("div");
    price.className = "catalog-result-price";
    price.textContent = item.price === null ? "Not shown" : money(item.price);
    const note = document.createElement("small");
    note.textContent = missionIds.has(item.id) ? "Already in Items" : prepIds.has(item.id) ? "Prep monitor" : "listing only";
    price.append(note);
    card.append(checkbox, main, price);
    elements.catalogList.append(card);
  }

  const availableCount = items.filter((item) => !existingIds.has(item.id)).length;
  elements.catalogCount.textContent = `${items.length} result${items.length === 1 ? "" : "s"} · ${availableCount} available`;
  elements.catalogStatus.textContent = catalogStatusText(catalog);
  const busy = catalogSearchInFlight || catalogImportInFlight;
  elements.catalogSearchButton.disabled = busy || isArmed();
  elements.catalogClearButton.disabled = busy || (!search && !items.length);
  elements.catalogSelectAllButton.disabled = busy || availableCount === 0;
  elements.catalogSelectNoneButton.disabled = busy || catalogSelectedIds.size === 0;
  elements.catalogItemProfile.disabled = busy || isArmed();
  elements.catalogAddButton.disabled = busy || isArmed() || catalogSelectedIds.size === 0;
  elements.catalogAddButton.textContent = catalogSelectedIds.size
    ? `Add selected (${catalogSelectedIds.size}) to Items`
    : "Add selected to Items";
  const walmartSelected = [...catalogSelectedIds].filter((id) => id.startsWith("walmart:"));
  elements.catalogWalmartPrepButton.disabled = busy || isArmed() || walmartSelected.length === 0;
  elements.catalogWalmartPrepOpenAt.disabled = busy || isArmed();
  elements.catalogWalmartPrepButton.textContent = walmartSelected.length
    ? `Monitor selected Walmart (${walmartSelected.length})`
    : "Monitor selected for Walmart prep";
  renderWalmartPrepCandidates();
}

function renderWalmartPrepCandidates() {
  const candidates = currentSnapshot?.settings?.walmartPrepCandidates || [];
  elements.walmartPrepList.replaceChildren();
  if (!candidates.length) return;
  for (const candidate of candidates) {
    const card = document.createElement("article");
    card.className = "catalog-card";
    card.dataset.retailer = "walmart";
    const main = document.createElement("div");
    main.className = "catalog-result-main";
    const title = document.createElement("strong");
    title.className = "catalog-result-title";
    title.textContent = candidate.title || candidate.sku;
    const meta = document.createElement("div");
    meta.className = "catalog-result-meta";
    meta.textContent = `Prep monitor · Walmart ${candidate.sku} · drop ${new Date(candidate.openAt).toLocaleString()}`;
    main.append(title, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button ghost compact";
    remove.textContent = "Remove";
    remove.disabled = isArmed();
    remove.addEventListener("click", () => void runAction(async () => {
      const next = await window.cartAssist.saveSettings({
        ...currentSnapshot.settings,
        walmartPrepCandidates: currentSnapshot.settings.walmartPrepCandidates.filter((item) => item.id !== candidate.id)
      });
      render(next);
    }, `${productLabel(candidate)} removed from Walmart prep monitoring.`));
    card.append(main, remove);
    elements.walmartPrepList.append(card);
  }
}

function newCustomId(prefix) {
  return `${prefix}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function resetItemProfileForm() {
  editingItemProfileId = "";
  elements.itemProfileId.value = "";
  elements.itemProfileName.value = "";
  elements.itemProfileQuantity.value = "1";
  elements.itemProfileAction.value = "watch";
  elements.itemProfileFulfillment.value = "shipping";
  elements.itemProfileAlert.value = "standard";
  elements.itemProfileEnabled.checked = true;
  elements.itemProfileDeleteButton.hidden = true;
}

function fillItemProfileForm(profile) {
  if (!profile?.id.startsWith("custom:")) return;
  editingItemProfileId = profile.id;
  elements.itemProfileId.value = profile.id;
  elements.itemProfileName.value = profile.name;
  elements.itemProfileQuantity.value = String(profile.settings.quantity);
  elements.itemProfileAction.value = profile.settings.action;
  elements.itemProfileFulfillment.value = profile.settings.fulfillmentMode;
  elements.itemProfileAlert.value = profile.settings.alertLevel;
  elements.itemProfileEnabled.checked = profile.settings.enabled;
  elements.itemProfileDeleteButton.hidden = false;
}

function renderItemProfilePickers(settings) {
  const selectedDefault = settings.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID;
  for (const select of [elements.defaultItemProfile, elements.catalogItemProfile, elements.bulkItemProfile]) {
    const current = select.value;
    itemProfileOptions(select, current || selectedDefault, settings);
  }
  elements.defaultItemProfile.value = selectedDefault;
  const profiles = allItemProfiles(settings);
  elements.savedItemProfiles.replaceChildren(...profiles.map((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-chip${profile.id === editingItemProfileId ? " selected" : ""}`;
    button.textContent = `${profile.name} · ×${profile.settings.quantity} · ${ACTION_LABELS[profile.settings.action]}`;
    button.title = profile.description || `${profile.settings.fulfillmentMode}; saved tax and retailer allowance are applied automatically`;
    button.addEventListener("click", () => {
      if (profile.id.startsWith("custom:")) fillItemProfileForm(profile);
      else resetItemProfileForm();
      renderItemProfilePickers(currentSnapshot.settings);
    });
    return button;
  }));
}

function msrpRowRecord(row, existingRecord = null) {
  const existingId = row.dataset.id;
  const nextPrices = Object.fromEntries(ItemDefaults.RETAILERS.map((retailer) => [
    retailer,
    row.querySelector(`[data-msrp='${retailer}']`).value
  ]));
  const now = new Date().toISOString();
  const sources = Object.fromEntries(ItemDefaults.RETAILERS.map((retailer) => {
    const nextPrice = Number(nextPrices[retailer]);
    const previousPrice = Number(existingRecord?.prices?.[retailer]);
    const unchanged = Number.isFinite(nextPrice) && nextPrice > 0 && nextPrice === previousPrice;
    return [retailer, unchanged
      ? existingRecord?.sources?.[retailer] || {}
      : (Number.isFinite(nextPrice) && nextPrice > 0
          ? { label: "Operator approved", url: "", verifiedAt: now }
          : {})];
  }));
  return ItemDefaults.normalizeMsrpRecord({
    id: existingId || newCustomId("msrp"),
    productLine: row.querySelector("[data-msrp='line']").value,
    productType: row.querySelector("[data-msrp='type']").value,
    matchTerms: row.querySelector("[data-msrp='terms']").value,
    excludeTerms: row.dataset.excludeTerms || "",
    prices: nextPrices,
    sources,
    sourceLabel: row.dataset.sourceLabel || "",
    sourceUrl: row.dataset.sourceUrl || "",
    verifiedAt: now
  });
}

function msrpInput(fieldName, value, label, type = "text") {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const caption = document.createElement("span");
  caption.textContent = label;
  const input = document.createElement("input");
  input.dataset.msrp = fieldName;
  input.type = type;
  input.value = value ?? "";
  if (type === "number") {
    input.min = "0.01";
    input.max = "1000000";
    input.step = "0.01";
    input.placeholder = "Needs approval";
  }
  wrapper.append(caption, input);
  return wrapper;
}

function buildMsrpRow(record) {
  const row = document.createElement("div");
  row.className = "msrp-row";
  row.dataset.id = record.id;
  row.dataset.excludeTerms = (record.excludeTerms || []).join(", ");
  row.dataset.sourceLabel = record.sourceLabel || "";
  row.dataset.sourceUrl = record.sourceUrl || "";
  row.append(
    msrpInput("line", record.productLine, "Product line"),
    msrpInput("type", record.productType, "Product type"),
    msrpInput("terms", (record.matchTerms || []).join(", "), "Title match terms"),
    msrpInput("target", record.prices?.target, "Target", "number"),
    msrpInput("walmart", record.prices?.walmart, "Walmart", "number"),
    msrpInput("amazon", record.prices?.amazon, "Amazon", "number")
  );
  const source = document.createElement("div");
  source.className = "msrp-source";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "button secondary compact";
  save.textContent = "Save prices";
  const note = document.createElement("small");
  const approvedStores = ItemDefaults.RETAILERS.filter((retailer) => Number(record.prices?.[retailer]) > 0);
  note.textContent = approvedStores.length
    ? approvedStores.map((retailer) => {
        const evidence = record.sources?.[retailer] || {};
        return `${STORE_LABELS[retailer]}: ${evidence.label || "Operator approved"}`;
      }).join(" · ")
    : "Needs approval";
  source.append(save, note);
  const sourceActions = document.createElement("div");
  sourceActions.className = "action-row";
  for (const retailer of approvedStores) {
    const evidence = record.sources?.[retailer] || {};
    if (!evidence.url) continue;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button ghost compact";
    open.textContent = `${STORE_LABELS[retailer]} source`;
    open.title = evidence.url;
    open.addEventListener("click", () => void runAction(
      () => window.cartAssist.openResearchSource(evidence.url),
      `${STORE_LABELS[retailer]} MSRP source opened.`
    ));
    sourceActions.append(open);
  }
  if (sourceActions.childElementCount) source.append(sourceActions);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "button ghost compact";
  remove.textContent = "✕";
  remove.setAttribute("aria-label", `Remove ${record.productType}`);
  save.addEventListener("click", () => void runAction(async () => {
    if (isArmed()) throw new Error("Switch Autopilot off before changing MSRP defaults.");
    const nextRecord = msrpRowRecord(row, record);
    const catalog = (currentSnapshot.settings.msrpCatalog || []).map((candidate) => (
      candidate.id === record.id ? nextRecord : candidate
    ));
    const next = await window.cartAssist.saveSettings({ ...currentSnapshot.settings, msrpCatalog: catalog });
    render(next);
    return nextRecord.productType;
  }, (name) => `${name} MSRP saved as an approved local default.`));
  remove.addEventListener("click", () => void runAction(async () => {
    if (isArmed()) throw new Error("Switch Autopilot off before changing MSRP defaults.");
    const next = await window.cartAssist.saveSettings({
      ...currentSnapshot.settings,
      msrpCatalog: currentSnapshot.settings.msrpCatalog.filter((candidate) => candidate.id !== record.id)
    });
    render(next);
    return record.productType;
  }, (name) => `${name} MSRP type removed.`));
  row.append(source, remove);
  return row;
}

function renderMsrpCatalog(settings) {
  elements.msrpList.replaceChildren(...(settings.msrpCatalog || []).map(buildMsrpRow));
  if (!(settings.msrpCatalog || []).length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No MSRP product types yet.";
    elements.msrpList.append(empty);
  }
  const research = currentSnapshot?.msrpResearch || {};
  elements.researchMsrpButton.disabled = isArmed() || research.inFlight || !research.credentialUsable;
  elements.msrpResearchEnabled.checked = Boolean(settings.msrpResearchEnabled);
  elements.msrpResearchEnabled.disabled = !research.credentialUsable || research.inFlight;
  elements.removeMsrpResearchKeyButton.hidden = !research.configured;
  elements.saveMsrpResearchKeyButton.disabled = research.inFlight;
  elements.msrpResearchStatus.textContent = research.inFlight
    ? "Researching current prices with cited web search…"
    : research.lastError
      ? research.lastError
      : research.configured
        ? `Cited research is configured${research.lastRunAt ? ` · last run ${relativeTime(research.lastRunAt)}` : ""}. Suggestions require review.`
        : "Optional cited research is not configured. Manual prices work offline.";
  const byRecord = new Map((settings.msrpCatalog || []).map((record) => [record.id, record]));
  elements.msrpSuggestions.replaceChildren(...(research.suggestions || []).map((suggestion) => {
    const record = byRecord.get(suggestion.recordId);
    const card = document.createElement("article");
    card.className = "msrp-suggestion";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${record?.productType || suggestion.recordId} · ${STORE_LABELS[suggestion.retailer]} · ${money(suggestion.price)} suggested`;
    const rationale = document.createElement("p");
    rationale.textContent = suggestion.rationale || "Cited web-search suggestion; review the source before approval.";
    const source = document.createElement("small");
    source.textContent = `${suggestion.sourceTitle || new URL(suggestion.sourceUrl).hostname} · ${suggestion.sourceUrl}`;
    source.title = suggestion.sourceUrl;
    content.append(title, rationale, source);
    const actions = document.createElement("div");
    actions.className = "action-row";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button ghost compact";
    open.textContent = "Open source";
    open.addEventListener("click", () => void runAction(
      () => window.cartAssist.openResearchSource(suggestion.sourceUrl),
      "Research source opened in your browser."
    ));
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "button primary compact";
    accept.textContent = "Accept MSRP";
    accept.disabled = isArmed();
    accept.addEventListener("click", () => void runAction(async () => {
      const next = await window.cartAssist.acceptMsrpSuggestion(suggestion.id);
      render(next);
      return next;
    }, `${STORE_LABELS[suggestion.retailer]} ${money(suggestion.price)} approved as MSRP. Existing item caps were not changed.`));
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "button ghost compact";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => void runAction(async () => {
      const next = await window.cartAssist.dismissMsrpSuggestion(suggestion.id);
      render(next);
      return next;
    }, "MSRP suggestion dismissed."));
    actions.append(open, accept, dismiss);
    card.append(content, actions);
    return card;
  }));
}

function filteredMissionProducts() {
  const filters = missionFilterValues();
  return savedItems().filter((item) => missionMatchesFilters(item, filters));
}

function renderBulkMissionControls(settings) {
  renderPlanHistoryControls();
  const currentItems = savedItems(settings.products);
  const currentIds = new Set(currentItems.map((item) => item.id));
  for (const id of [...bulkMissionSelectedIds]) if (!currentIds.has(id)) bulkMissionSelectedIds.delete(id);
  elements.missionPlanTools.hidden = !planEditMode;
  elements.planEditButton.textContent = planEditMode ? "Finish editing" : "Edit plan";
  elements.planEditButton.classList.toggle("primary", planEditMode);
  elements.planEditButton.classList.toggle("secondary", !planEditMode);
  elements.planEditButton.setAttribute("aria-pressed", String(planEditMode));
  if (!planEditMode) return;

  elements.missionPlanTools.classList.toggle("is-empty", !currentItems.length);
  const selectedGroupId = elements.bulkMissionGroup.value;
  missionGroupOptions(elements.bulkMissionGroup, selectedGroupId);
  const visible = filteredMissionProducts();
  const selected = bulkMissionSelectedIds.size;
  elements.bulkMissionSelectionCount.textContent = currentItems.length
    ? `${selected} item${selected === 1 ? "" : "s"} selected · ${visible.length} shown · ${settings.products.length} store route${settings.products.length === 1 ? "" : "s"}`
    : "No items yet — create or import one to build the plan.";
  elements.applyBulkItemProfileButton.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.applyBulkMissionGroupButton.disabled = !bulkMissionSelectedIds.size;
  elements.copySelectedMissionListButton.disabled = !bulkMissionSelectedIds.size;
  elements.bulkEnableMissionsButton.disabled = !bulkMissionSelectedIds.size;
  elements.bulkDisableMissionsButton.disabled = !bulkMissionSelectedIds.size;
  elements.combineSelectedItemsButton.disabled = bulkMissionSelectedIds.size < 2 || isArmed();
  elements.bulkMissionOpenAt.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.scheduleCandidateMissionsButton.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.clearSelectedMissionSchedulesButton.disabled = isArmed() || !settings.products.some((product) => (
    bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product)) && product.openAt
  ));
  elements.bulkMissionSelectAllButton.disabled = !visible.length;
  elements.bulkMissionSelectAllButton.textContent = visible.length ? `Select shown (${visible.length})` : "Select shown";
  elements.bulkMissionSelectNoneButton.disabled = !bulkMissionSelectedIds.size;
}

function renderItemDefaults(settings) {
  const allowances = ItemDefaults.normalizeStoreOrderAllowances(settings.storeOrderAllowances);
  const taxPercent = ItemDefaults.normalizeOrderTaxPercent(settings.orderTaxPercent);
  if (document.activeElement !== elements.orderTaxPercent) {
    elements.orderTaxPercent.value = String(taxPercent);
  }
  elements.orderTaxPercent.disabled = isArmed();
  const allowanceInputs = {
    target: elements.targetOrderAllowance,
    walmart: elements.walmartOrderAllowance,
    amazon: elements.amazonOrderAllowance
  };
  for (const retailer of ItemDefaults.RETAILERS) {
    if (document.activeElement !== allowanceInputs[retailer]) {
      allowanceInputs[retailer].value = String(allowances[retailer]);
    }
    allowanceInputs[retailer].disabled = isArmed();
  }
  elements.saveStoreAllowancesButton.disabled = isArmed();
  renderItemProfilePickers(settings);
  renderMsrpCatalog(settings);
}

async function submitCatalogSearch() {
  if (catalogSearchInFlight || catalogImportInFlight) return;
  if (isArmed()) {
    setMessage("Switch Autopilot off before searching retailer catalogs.", "error");
    return;
  }
  if (!elements.catalogQuery.checkValidity()) {
    elements.catalogQuery.reportValidity();
    return;
  }
  const input = catalogSearchInput();
  if (!input.retailers.length) {
    setMessage("Choose at least one retailer to search.", "error");
    return;
  }
  if (elements.catalogMaxPrice.value && !elements.catalogMaxPrice.checkValidity()) {
    elements.catalogMaxPrice.reportValidity();
    return;
  }

  catalogSearchInFlight = true;
  renderCatalog(currentSnapshot?.catalog || {});
  try {
    const result = await window.cartAssist.searchCatalog(input);
    render(result.snapshot);
    const defaultBrowser = (result.openings || []).some((opening) => opening.via === "default-browser");
    setMessage(
      `${result.openings?.length || input.retailers.length} official search page${input.retailers.length === 1 ? "" : "s"} opened. Visible results will arrive in this inbox.${defaultBrowser ? " Chrome was not found, so capture requires opening these searches in the Chrome profile that has Quick add loaded." : ""}`,
      defaultBrowser ? "warn" : "success"
    );
  } catch (error) {
    setMessage(error.message || "The catalog search could not start.", "error");
  } finally {
    catalogSearchInFlight = false;
    renderCatalog(currentSnapshot?.catalog || {});
  }
}

async function addSelectedCatalogMissions() {
  if (catalogSearchInFlight || catalogImportInFlight) return;
  if (editingId) {
    setMessage("Finish the open item editor before importing catalog results.", "error");
    return;
  }
  if (isArmed()) {
    setMessage("Switch Autopilot off before adding catalog results to Items.", "error");
    return;
  }
  const selectedIds = [...catalogSelectedIds];
  if (!selectedIds.length) return;
  catalogImportInFlight = true;
  renderCatalog(currentSnapshot?.catalog || {});
  try {
    const before = planEditMode ? capturePlanSnapshot() : null;
    const result = await window.cartAssist.addCatalogMissions(selectedIds, elements.catalogItemProfile.value);
    render(result.snapshot);
    if (result.summary?.imported > 0) recordPlanChange(before);
    const summary = result.summary || {};
    const extras = [];
    if (summary.duplicates) extras.push(`${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped`);
    if (summary.overCapacity) extras.push(`${summary.overCapacity} over the ${MAX_MISSIONS}-store-option safety limit`);
    if (summary.missing) extras.push(`${summary.missing} no longer available`);
    if (summary.ready) extras.push(`${summary.ready} ready with approved MSRP`);
    if (summary.needsPrice) extras.push(`${summary.needsPrice} left Off pending price approval`);
    setMessage(
      summary.imported
        ? `${summary.imported} catalog item${summary.imported === 1 ? "" : "s"} added with the selected template.${extras.length ? ` ${extras.join(" · ")}.` : ""}`
        : extras.join(" · ") || "No selected catalog results were imported.",
      summary.imported ? "success" : "warn"
    );
  } catch (error) {
    setMessage(error.message || "The selected catalog results could not be imported.", "error");
  } finally {
    catalogImportInFlight = false;
    renderCatalog(currentSnapshot?.catalog || {});
  }
}

async function addSelectedWalmartPrepCandidates() {
  if (catalogSearchInFlight || catalogImportInFlight || isArmed()) return;
  const selectedIds = [...catalogSelectedIds].filter((id) => id.startsWith("walmart:"));
  if (!selectedIds.length) return;
  if (!elements.catalogWalmartPrepOpenAt.value) {
    elements.catalogWalmartPrepOpenAt.reportValidity();
    setMessage("Choose the known Walmart drop time first.", "error");
    return;
  }
  catalogImportInFlight = true;
  renderCatalog(currentSnapshot?.catalog || {});
  try {
    const result = await window.cartAssist.addWalmartPrepCandidates(
      selectedIds,
      elements.catalogItemProfile.value,
      new Date(elements.catalogWalmartPrepOpenAt.value).toISOString()
    );
    render(result.snapshot);
    const summary = result.summary || {};
    setMessage(
      summary.added
        ? `${summary.added} exact Walmart item${summary.added === 1 ? "" : "s"} authorized for lightweight prep monitoring.`
        : `${summary.needsPrice || 0} item${summary.needsPrice === 1 ? "" : "s"} lacked approved MSRP/profile pricing; ${summary.skipped || 0} were skipped; ${summary.overCapacity || 0} exceeded the 20-candidate limit.`,
      summary.added ? "success" : "warn"
    );
  } finally {
    catalogImportInFlight = false;
    renderCatalog(currentSnapshot?.catalog || {});
  }
}

async function clearCatalog() {
  if (catalogSearchInFlight || catalogImportInFlight) return;
  if (!window.confirm("Clear the Catalog Inbox and stop accepting results for its current search?")) return;
  try {
    const next = await window.cartAssist.clearCatalog();
    render(next);
    setMessage("Catalog Inbox cleared.", "success");
  } catch (error) {
    setMessage(error.message || "The Catalog Inbox could not be cleared.", "error");
  }
}

function renderMissionFilterOptions() {
  const selected = elements.missionGroupFilter.value || "all";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All groups";
  const ungrouped = document.createElement("option");
  ungrouped.value = UNGROUPED_FILTER_VALUE;
  ungrouped.textContent = "Ungrouped";
  const groups = savedMissionGroups().map((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    return option;
  });
  elements.missionGroupFilter.replaceChildren(all, ungrouped, ...groups);
  elements.missionGroupFilter.value = ["all", UNGROUPED_FILTER_VALUE, ...savedMissionGroups().map((group) => group.id)]
    .includes(selected) ? selected : "all";
  elements.newMissionGroupButton.disabled = savedMissionGroups().length >= MAX_MISSION_GROUPS;
  elements.newMissionGroupButton.title = elements.newMissionGroupButton.disabled
    ? `The ${MAX_MISSION_GROUPS}-group limit has been reached.`
    : "Create a named item group";
}

function missionFilterValues() {
  return {
    query: elements.missionSearch.value.trim().toLowerCase(),
    groupId: elements.missionGroupFilter.value || "all",
    retailer: elements.missionRetailerFilter.value || "all",
    active: elements.missionActiveFilter.value || "all"
  };
}

function missionMatchesFilters(item, filters) {
  if (filters.groupId === UNGROUPED_FILTER_VALUE && item.groupId) return false;
  if (!["all", UNGROUPED_FILTER_VALUE].includes(filters.groupId) && item.groupId !== filters.groupId) return false;
  if (filters.retailer !== "all" && !item.variants.some((variant) => variant.retailer === filters.retailer)) return false;
  if (filters.active === "active" && !item.enabled) return false;
  if (filters.active === "inactive" && item.enabled) return false;
  if (filters.active === "problem") {
    const statuses = currentSnapshot?.productStatuses || {};
    const hasProblem = item.variants.some((variant) => variant.enabled !== false && (
      BLOCKING_REASONS.has(statuses[variant.id]?.reason)
      || (variant.action !== "watch" && Number(variant.maxPrice) <= 0)
      || (variant.openAt && new Date(variant.openAt).getTime() < Date.now() - 120_000)
    ));
    if (!hasProblem) return false;
  }
  if (filters.query) {
    const haystack = [
      item.title,
      ...item.variants.flatMap((variant) => [
        variant.sku,
        variant.retailer,
        STORE_LABELS[variant.retailer],
        variant.productUrl
      ])
    ].join(" ").toLowerCase();
    if (!haystack.includes(filters.query)) return false;
  }
  return true;
}

function missionFiltersActive(filters) {
  return Boolean(
    filters.query
    || filters.groupId !== "all"
    || filters.retailer !== "all"
    || filters.active !== "all"
  );
}

function buildMissionGroupSection(group, members, visibleMembers, statuses) {
  const section = document.createElement("section");
  section.className = `mission-group${group.id ? "" : " mission-group-ungrouped"}`;
  section.dataset.groupId = group.id || "";

  const header = document.createElement("div");
  header.className = "mission-group-header";
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "mission-group-collapse";
  collapse.textContent = group.collapsed ? "▸" : "▾";
  collapse.title = `${group.collapsed ? "Expand" : "Collapse"} ${group.name}`;
  collapse.setAttribute("aria-label", collapse.title);
  collapse.setAttribute("aria-expanded", String(!group.collapsed));
  collapse.disabled = !group.id;

  const name = document.createElement("h3");
  name.textContent = group.name;
  const count = document.createElement("span");
  count.className = "mission-group-count";
  count.textContent = missionFiltersActive(missionFilterValues()) && visibleMembers.length !== members.length
    ? `${visibleMembers.length}/${members.length}`
    : String(members.length);

  const enabledLabel = document.createElement("label");
  enabledLabel.className = "mission-group-enabled";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  const enabledCount = members.filter((item) => item.enabled).length;
  enabled.checked = Boolean(members.length) && enabledCount === members.length;
  enabled.indeterminate = enabledCount > 0 && enabledCount < members.length;
  enabled.disabled = !members.length;
  enabled.setAttribute("aria-label", `Turn every item in ${group.name} on or off`);
  const enabledText = document.createElement("span");
  enabledText.textContent = enabled.indeterminate ? "Mixed" : enabled.checked ? "On" : "Off";
  enabledLabel.title = `Activate or deactivate all ${members.length} item${members.length === 1 ? "" : "s"} in ${group.name}`;
  enabledLabel.append(enabled, enabledText);
  enabled.addEventListener("change", () => void runAction(
    () => setMissionsEnabled(new Map(members.map((item) => [item.id, enabled.checked]))),
    `${group.name} items turned ${enabled.checked ? "On" : "Off"}.`
  ));

  const actions = document.createElement("div");
  actions.className = "mission-group-actions";
  if (group.id) {
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "mission-icon-button";
    rename.textContent = "✎";
    setMissionButtonLabel(rename, `Rename ${group.name}`);
    rename.addEventListener("click", () => {
      const nextName = window.prompt("Rename item group", group.name);
      if (nextName === null) return;
      void runAction(async () => {
        const cleaned = nextName.replace(/\s+/g, " ").trim().slice(0, 40);
        if (!cleaned) throw new Error("Enter a group name.");
        await saveMissionList(savedProducts(), {
          missionGroups: savedMissionGroups().map((candidate) => (
            candidate.id === group.id ? { ...candidate, name: cleaned } : candidate
          ))
        });
        return cleaned;
      }, (cleaned) => `Item group renamed to ${cleaned}.`);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mission-icon-button";
    remove.textContent = "✕";
    setMissionButtonLabel(remove, `Delete ${group.name} and move its items to Ungrouped`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete the group "${group.name}"? Its items will move to Ungrouped and keep all purchase settings.`)) return;
      void runAction(async () => {
        if (elements.missionGroupFilter.value === group.id) elements.missionGroupFilter.value = "all";
        await saveMissionList(savedProducts().map((product) => (
          product.groupId === group.id ? { ...product, groupId: "" } : product
        )), {
          missionGroups: savedMissionGroups().filter((candidate) => candidate.id !== group.id)
        });
      }, `${group.name} deleted; its items are now Ungrouped.`);
    });
    actions.append(rename, remove);

    collapse.addEventListener("click", () => void runAction(async () => {
      const collapsed = !group.collapsed;
      await saveMissionList(savedProducts(), {
        missionGroups: savedMissionGroups().map((candidate) => (
          candidate.id === group.id ? { ...candidate, collapsed } : candidate
        ))
      });
      return collapsed;
    }, (collapsed) => `${group.name} ${collapsed ? "collapsed" : "expanded"}.`));
  }

  header.append(collapse, name, count, enabledLabel, actions);
  const body = document.createElement("div");
  body.className = "mission-group-body";
  body.hidden = Boolean(group.collapsed);
  body.id = `mission-group-${String(group.id || "ungrouped").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  collapse.setAttribute("aria-controls", body.id);
  if (visibleMembers.length) {
    body.append(...visibleMembers.map((item) => (
      editingId === item.id && editCardNode
        ? editCardNode
        : buildViewCard(item, statuses)
    )));
  } else {
    const empty = document.createElement("div");
    empty.className = "mission-group-empty";
    empty.textContent = members.length ? "No items in this group match the current filters." : "No items in this group yet.";
    body.append(empty);
  }
  section.append(header, body);
  return section;
}

function clearMissionFilters() {
  elements.missionSearch.value = "";
  elements.missionGroupFilter.value = "all";
  elements.missionRetailerFilter.value = "all";
  elements.missionActiveFilter.value = "all";
  missionVisibleLimit = 25;
  renderMissions();
}

function renderMissions() {
  // While a mission editor is open, leave the list DOM alone: background
  // snapshot broadcasts must not steal focus from the person typing.
  if (editingId && editCardNode && elements.missionList.contains(editCardNode)) {
    renderBulkMissionControls(currentSnapshot?.settings || { products: [] });
    updateWorstCase();
    return;
  }
  renderMissionFilterOptions();
  renderBulkMissionControls(currentSnapshot?.settings || { products: [] });
  const statuses = currentSnapshot?.productStatuses || {};
  const items = savedItems();
  const filters = missionFilterValues();
  const matchingItems = items.filter((item) => missionMatchesFilters(item, filters));
  const shownMatchingItems = matchingItems.slice(0, missionVisibleLimit);
  elements.missionFilterCount.textContent = missionFiltersActive(filters)
    ? `${matchingItems.length} of ${items.length}`
    : `${items.length} item${items.length === 1 ? "" : "s"}`;
  const nodes = [];
  if (editingId === "new" && editCardNode) nodes.push(editCardNode);

  const groups = savedMissionGroups();
  if (groups.length) {
    const forceItem = editingId && editingId !== "new"
      ? items.find((item) => item.id === editingId)
      : null;
    for (const group of groups) {
      if (!["all", group.id].includes(filters.groupId) && forceItem?.groupId !== group.id) continue;
      const members = items.filter((item) => item.groupId === group.id);
      const visibleMembers = members.filter((item) => shownMatchingItems.includes(item));
      if (forceItem?.groupId === group.id && !visibleMembers.includes(forceItem)) visibleMembers.push(forceItem);
      if (!visibleMembers.length && members.length && forceItem?.groupId !== group.id) continue;
      if (!visibleMembers.length && (missionFiltersActive(filters) || filters.groupId !== "all") && filters.groupId !== group.id) continue;
      if (!visibleMembers.length && missionFiltersActive(filters) && filters.groupId === "all") continue;
      nodes.push(buildMissionGroupSection(group, members, visibleMembers, statuses));
    }
    const ungroupedMembers = items.filter((item) => !item.groupId);
    const visibleUngrouped = ungroupedMembers.filter((item) => shownMatchingItems.includes(item));
    if (forceItem && !forceItem.groupId && !visibleUngrouped.includes(forceItem)) visibleUngrouped.push(forceItem);
    if (
      ["all", UNGROUPED_FILTER_VALUE].includes(filters.groupId)
      && (visibleUngrouped.length || filters.groupId === UNGROUPED_FILTER_VALUE)
    ) {
      nodes.push(buildMissionGroupSection(
        { id: "", name: "Ungrouped", collapsed: false },
        ungroupedMembers,
        visibleUngrouped,
        statuses
      ));
    }
  } else {
    for (const item of items) {
      if (!shownMatchingItems.includes(item) && editingId !== item.id) continue;
      nodes.push(editingId === item.id && editCardNode
        ? editCardNode
        : buildViewCard(item, statuses));
    }
  }
  if (matchingItems.length > shownMatchingItems.length && !editingId) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "button secondary mission-load-more";
    const remaining = matchingItems.length - shownMatchingItems.length;
    more.textContent = `Show ${Math.min(25, remaining)} more · ${remaining} remaining`;
    more.addEventListener("click", () => {
      missionVisibleLimit += 25;
      renderMissions();
    });
    nodes.push(more);
  }

  if (!items.length && editingId !== "new") {
    const empty = document.createElement("div");
    empty.className = "empty-state mission-empty";
    const line = document.createElement("p");
    line.textContent = "Add an item once, then choose Target, Walmart, and Amazon as store options.";
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "button primary";
    cta.textContent = "+ Create your first item";
    cta.addEventListener("click", () => startEdit(null));
    empty.append(line, cta);
    nodes.push(empty);
  } else if (!matchingItems.length && !editingId) {
    nodes.length = 0;
    const empty = document.createElement("div");
    empty.className = "empty-state mission-filter-empty";
    const line = document.createElement("p");
    line.textContent = "No items match the current filters.";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "button ghost compact";
    clear.textContent = "Clear filters";
    clear.addEventListener("click", clearMissionFilters);
    empty.append(line, clear);
    nodes.push(empty);
  }
  elements.missionList.replaceChildren(...nodes);
  updateWorstCase();
}

function updateStatusAges() {
  for (const age of elements.missionList.querySelectorAll(".status-age")) {
    age.textContent = relativeTime(age.dataset.at || "");
  }
}

function missionMaximumExposure(products = savedProducts()) {
  const items = savedItems(products);
  return {
    total: ItemMissions.maximumItemExposure(products),
    autoBuyCount: items.filter((item) => item.enabled && item.action === "checkout").length
  };
}

// The hard ceiling: what everything hitting at once could cost.
function updateWorstCase() {
  const products = savedProducts();
  if (!products.length) {
    elements.worstCase.textContent = "";
    return;
  }
  const { total, autoBuyCount } = missionMaximumExposure(products);
  const exposure = total > 0
    ? `Maximum exposure if every enabled item reaches its highest selected-store cap: $${Math.round(total)}.`
    : "No spending exposure: only watch-only items are enabled.";
  const liveNote = isArmed()
    ? autoBuyCount > 0
      ? ` Autopilot is ON — ${autoBuyCount} auto-buy item${autoBuyCount === 1 ? "" : "s"} can place a real order through its first successful store.`
      : " Autopilot is ON."
    : "";
  elements.worstCase.textContent = `${exposure}${liveNote}`;
}

function renderReadiness(settings, status, productStatuses = {}) {
  const products = settings.products || [];
  const items = savedItems(products);
  const enabled = items.filter((item) => item.enabled);
  const scheduled = items.filter((item) => item.openAt);
  const { total, autoBuyCount } = missionMaximumExposure(products);
  const actionCounts = Object.fromEntries(Object.keys(ACTION_LABELS).map((action) => [
    action,
    enabled.filter((item) => item.action === action).length
  ]));
  const actionSummary = [
    actionCounts.watch && `${actionCounts.watch} watch`,
    actionCounts.cart && `${actionCounts.cart} add-only`,
    actionCounts.review && `${actionCounts.review} review`,
    actionCounts.checkout && `${actionCounts.checkout} auto-buy`
  ].filter(Boolean).join(" · ");

  const disconnected = status.companion !== "connected";
  const unpriced = enabled.filter((item) => item.action !== "watch" && item.variants.some((variant) => (
    variant.enabled !== false && Number(variant.maxPrice) <= 0
  )));
  const missed = enabled.filter((item) => {
    if (!item.openAt) return false;
    const at = new Date(item.openAt).getTime();
    return Number.isFinite(at) && at < Date.now() - 120_000;
  });
  const blocked = enabled.filter((item) => item.variants.some((variant) => (
    variant.enabled !== false && BLOCKING_REASONS.has(productStatuses[variant.id]?.reason)
  )));
  const issues = [];
  if (!items.length) issues.push("Add at least one item.");
  else if (!enabled.length) issues.push("Turn on at least one item.");
  if (disconnected) issues.push("Connect the Chrome companion.");
  if (unpriced.length) issues.push(`${unpriced.length} active item${unpriced.length === 1 ? " needs" : "s need"} a positive cap at every selected store.`);
  if (missed.length) issues.push(`${missed.length} scheduled time${missed.length === 1 ? " has" : "s have"} passed and must be cleared or replaced.`);
  if (blocked.length) issues.push(`${blocked.length} active item${blocked.length === 1 ? " has" : "s have"} a blocking status.`);
  lastReadinessIssueItemIds = new Set([...unpriced, ...missed, ...blocked].map((item) => item.id));

  const running = Boolean(settings.automationEnabled);
  const ready = !issues.length;
  elements.readinessState.textContent = running
    ? ready ? "Autopilot running" : "Running · action needed"
    : ready ? "Ready" : items.length ? "Needs review" : "No plan";
  elements.readinessState.classList.toggle("ready", ready);
  elements.readinessState.classList.toggle("attention", !ready);
  elements.readinessConnection.textContent = disconnected ? "Needs connection" : "Connected";
  elements.readinessEnabled.textContent = `${enabled.length} / ${items.length}`;
  elements.readinessScheduled.textContent = String(scheduled.length);
  elements.readinessExposure.textContent = total > 0 ? compactMissionPrice(total) : "$0";
  elements.readinessSummary.textContent = enabled.length
    ? `${enabled.length} item${enabled.length === 1 ? " is" : "s are"} On across ${products.filter((product) => product.enabled !== false).length} selected store route${products.filter((product) => product.enabled !== false).length === 1 ? "" : "s"}${actionSummary ? ` · ${actionSummary}` : ""}.`
    : items.length
      ? `${items.length} item${items.length === 1 ? " is" : "s are"} saved, but all are Off.`
      : "Build a reusable item plan, review it here, then start one run.";
  elements.readinessNote.textContent = issues.length
    ? issues.join(" ")
    : autoBuyCount
      ? `${autoBuyCount} item${autoBuyCount === 1 ? " can" : "s can"} submit one real order through the first successful store after live verification.`
      : "No blockers found. Starting Autopilot will use the saved plan as shown.";
  elements.readinessNote.classList.toggle("attention", Boolean(issues.length));
  elements.readinessReviewButton.textContent = issues.length ? `Review ${lastReadinessIssueItemIds.size || "run"} issue${lastReadinessIssueItemIds.size === 1 ? "" : "s"}` : "Review & start";
}

function runReviewModel() {
  const settings = currentSnapshot?.settings || { products: [] };
  const status = currentSnapshot?.status || {};
  const statuses = currentSnapshot?.productStatuses || {};
  const items = savedItems(settings.products);
  const enabled = items.filter((item) => item.enabled);
  const due = enabled.filter((item) => !item.openAt || new Date(item.openAt).getTime() <= Date.now() + 120_000);
  const scheduled = enabled.filter((item) => item.openAt && new Date(item.openAt).getTime() > Date.now() + 120_000);
  const unpriced = enabled.filter((item) => item.action !== "watch" && item.variants.some((variant) => (
    variant.enabled !== false && Number(variant.maxPrice) <= 0
  )));
  const missed = enabled.filter((item) => item.openAt && new Date(item.openAt).getTime() < Date.now() - 120_000);
  const blocked = enabled.filter((item) => item.variants.some((variant) => (
    variant.enabled !== false && BLOCKING_REASONS.has(statuses[variant.id]?.reason)
  )));
  const hardIssues = [];
  const warnings = [];
  if (!items.length) hardIssues.push("Add at least one item.");
  else if (!enabled.length) hardIssues.push("Turn on at least one item.");
  if (unpriced.length) hardIssues.push(`${unpriced.length} purchase item${unpriced.length === 1 ? " needs" : "s need"} a cap at every selected store.`);
  if (missed.length) hardIssues.push(`${missed.length} item${missed.length === 1 ? " has" : "s have"} a missed schedule.`);
  if (status.companion !== "connected") warnings.push("Chrome is not connected yet; starting will open one safe item page to connect it.");
  if (blocked.length) warnings.push(`${blocked.length} item${blocked.length === 1 ? " currently has" : "s currently have"} a blocking store status; unaffected items can continue.`);
  const exposure = missionMaximumExposure(settings.products);
  return { items, enabled, due, scheduled, unpriced, missed, blocked, hardIssues, warnings, exposure };
}

function closeRunReview() {
  if (typeof elements.runReviewDialog.close === "function") elements.runReviewDialog.close();
  else elements.runReviewDialog.removeAttribute("open");
}

function openRunReview() {
  const model = runReviewModel();
  const routes = model.enabled.reduce((count, item) => count + item.variants.filter((variant) => variant.enabled !== false).length, 0);
  elements.runReviewSummary.textContent = model.enabled.length
    ? `${model.enabled.length} item${model.enabled.length === 1 ? "" : "s"} will run across ${routes} selected store option${routes === 1 ? "" : "s"}. ${model.due.length} ${model.due.length === 1 ? "is" : "are"} due now; ${model.scheduled.length} will wait for the schedule.`
    : "Nothing is ready to run yet.";
  const metrics = [
    ["Items on", `${model.enabled.length} / ${model.items.length}`],
    ["Due now", String(model.due.length)],
    ["Auto-buy", String(model.exposure.autoBuyCount)],
    ["Maximum exposure", compactMissionPrice(model.exposure.total)]
  ];
  elements.runReviewMetrics.replaceChildren(...metrics.map(([label, value]) => {
    const node = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    node.append(name, strong);
    return node;
  }));
  const issueEntries = [
    ...model.hardIssues.map((text) => ({ text, hard: true })),
    ...model.warnings.map((text) => ({ text, hard: false }))
  ];
  elements.runReviewIssues.replaceChildren(...(issueEntries.length ? issueEntries : [{ text: "No run blockers found.", hard: false }]).map((issue) => {
    const row = document.createElement("li");
    row.className = issue.hard ? "hard" : "";
    row.textContent = issue.text;
    return row;
  }));
  elements.runReviewMonitorButton.disabled = model.enabled.length === 0 || openRunInFlight || isArmed();
  elements.runReviewMonitorButton.textContent = isArmed() ? "Stop Autopilot before monitoring only" : "Start monitoring only";
  elements.runReviewAutopilotButton.disabled = model.hardIssues.length > 0 || openRunInFlight || isArmed();
  elements.runReviewAutopilotButton.textContent = isArmed() ? "Autopilot already active" : "Start Autopilot";
  if (typeof elements.runReviewDialog.showModal === "function") elements.runReviewDialog.showModal();
  else elements.runReviewDialog.setAttribute("open", "");
}

// --- Companion connection card ---

function companionStepState() {
  if (currentSnapshot && !currentSnapshot.app?.companionPort) {
    return {
      done: false,
      label: "Local server error",
      hint: "This app could not start its local server on ports 32191–32195, so the extension has nothing to connect to. Close any other Cart Confirm windows or programs using those ports, then restart the app."
    };
  }
  const connected = currentSnapshot?.status?.companion === "connected";
  if (connected) return { done: true, label: "Connected ✓", hint: "" };
  const hello = currentSnapshot?.companionHello;
  const appVersion = currentSnapshot?.app?.version || "";
  if (!hello) {
    const diag = currentSnapshot?.serverDiagnostics || {};
    if (diag.rejectedAt && (!diag.configServedAt || diag.rejectedAt > diag.configServedAt)) {
      return {
        done: false,
        label: "Extension rejected",
        hint: `Chrome IS reaching this app, but its requests come from “${diag.rejectedOrigin}”, which is not the expected Cart Confirm extension. On chrome://extensions, remove the extension and use Load unpacked again with the exact folder from “Show companion folder” — its ID must be kmpoonjaidgnldeobaaopfhfhlalclhd.`
      };
    }
    if (diag.configServedAt) {
      return {
        done: false,
        label: "Report missing",
        hint: `The extension contacted this app (last at ${formatTime(diag.configServedAt)}) but its status report never arrived — it is probably running old companion code. On chrome://extensions, click the reload arrow on the Cart Confirm card, check it for a red “Errors” button, and confirm it was loaded from the folder shown by “Show companion folder”. Then click the toolbar icon to retry.`
      };
    }
    return {
      done: false,
      label: "Waiting for Chrome",
      hint: "Nothing from Chrome has reached this app yet. Starting Autopilot or choosing Monitor only opens one item page in Chrome and waits for the companion automatically. If that connection fails, confirm the extension was loaded once from the folder shown by “Show companion folder”; its badge explains the problem: IDLE/ARM = connected · OFF = desktop unreachable · UPD = reload needed · PAIR = pairing issue."
    };
  }
  if (hello.reason === "version-mismatch") {
    return {
      done: false,
      label: "Reload the extension",
      hint: `Chrome has companion v${hello.version} but this app is v${appVersion}. In chrome://extensions, click the reload arrow on the Quick add card.`
    };
  }
  if (hello.reason === "pairing-mismatch") {
    return {
      done: false,
      label: "Re-pair the extension",
      hint: "The pinned pairing changed. Remove the unpacked extension and load it again from the companion folder."
    };
  }
  return {
    done: false,
    label: "Open a store tab",
    hint: "Extension loaded ✓. Starting Autopilot or choosing Monitor only will open a Target, Walmart, or Amazon item page and finish this connection automatically."
  };
}

// --- Schedule agenda ---

function scheduledProducts(includeDisabled = false) {
  return savedItems()
    .filter((item) => item.openAt && (includeDisabled || item.enabled))
    .map((item) => ({ ...item, openAtMs: new Date(item.openAt).getTime() }))
    .filter((item) => Number.isFinite(item.openAtMs))
    .sort((left, right) => left.openAtMs - right.openAtMs);
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const chunks = [];
  if (days) chunks.push(`${days}d`);
  if (days || hours) chunks.push(`${hours}h`);
  chunks.push(`${minutes}m`, `${seconds}s`);
  return chunks.join(" ");
}

function updateScheduleNext() {
  const items = scheduledProducts();
  if (!items.length) {
    elements.scheduleNext.textContent = "Nothing scheduled";
    return;
  }
  const item = items[0];
  const remaining = item.openAtMs - Date.now();
  elements.scheduleNext.textContent = remaining <= 0
    ? `${itemLabel(item)}: scheduled time passed`
    : `Next: ${itemLabel(item)} in ${formatRemaining(remaining)}`;
}

function renderSchedule() {
  const items = scheduledProducts(true);
  elements.schedulePanel.hidden = items.length === 0;
  if (!items.length) return;
  const enabledCount = items.filter((item) => item.enabled).length;
  elements.scheduleCoverage.textContent = `${enabledCount}/${items.length} enabled`;
  elements.enableScheduledButton.hidden = enabledCount === items.length;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  elements.scheduleTimezone.textContent = timezone;
  const missedCount = items.filter((item) => item.openAtMs < Date.now() - 120_000).length;
  elements.clearMissedSchedulesButton.hidden = missedCount === 0;
  elements.clearMissedSchedulesButton.textContent = `Clear ${missedCount} missed`;

  const cohorts = new Map();
  for (const item of items) {
    const key = new Date(item.openAtMs).toISOString();
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(item);
  }
  const rows = [...cohorts.entries()].map(([key, cohortItems]) => {
    const time = new Date(key);
    const missed = time.getTime() < Date.now() - 120_000;
    const row = document.createElement("section");
    row.className = `schedule-agenda-row${missed ? " missed" : ""}`;
    const when = document.createElement("div");
    when.className = "schedule-agenda-when";
    const date = document.createElement("strong");
    date.textContent = time.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const clock = document.createElement("span");
    clock.textContent = time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const state = document.createElement("small");
    state.textContent = missed ? "Missed — update or clear" : cohortItems.length > 1 ? `${cohortItems.length} items at once` : "1 item";
    when.append(date, clock, state);
    const list = document.createElement("div");
    list.className = "schedule-agenda-items";
    for (const item of cohortItems) {
      const entry = document.createElement("div");
      entry.className = `schedule-agenda-item${item.enabled ? "" : " off"}`;
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = item.enabled;
      toggle.setAttribute("aria-label", `Turn ${itemLabel(item)} ${item.enabled ? "off" : "on"}`);
      toggle.addEventListener("change", () => void runAction(
        () => setMissionsEnabled(new Map([[item.id, toggle.checked]])),
        `${itemLabel(item)} turned ${toggle.checked ? "On" : "Off"}.`
      ));
      const details = document.createElement("button");
      details.type = "button";
      details.className = "schedule-agenda-item-details";
      details.textContent = itemLabel(item);
      details.title = `${item.variants.map((variant) => STORE_LABELS[variant.retailer]).join(" + ")} · edit schedule`;
      details.addEventListener("click", () => void startEdit(item));
      entry.append(toggle, details);
      list.append(entry);
    }
    row.append(when, list);
    return row;
  });
  elements.scheduleWeek.replaceChildren(...rows);
  updateScheduleNext();
}

// --- Loud alarm for alert-level "alarm" missions (throttled per mission) ---

const ALARM_EVENT_TYPES = new Set(["offer-observed", "cart-reached", "cart-item-confirmed", "order-confirmed", "notification-sent"]);
const ALARM_THROTTLE_MS = 5 * 60_000;
const ALARM_MAX_MS = 30_000;

function silenceAlarm() {
  clearInterval(alarmBeepInterval);
  clearTimeout(alarmStopTimer);
  alarmBeepInterval = null;
  alarmStopTimer = null;
  elements.alarmBar.hidden = true;
}

function beep() {
  try {
    alarmAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = alarmAudio.currentTime;
    for (const [offset, frequency] of [[0, 880], [0.18, 1245], [0.36, 880]]) {
      const oscillator = alarmAudio.createOscillator();
      const gain = alarmAudio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
      oscillator.connect(gain).connect(alarmAudio.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.16);
    }
  } catch {
    // Audio is best-effort; the visual alarm bar still shows.
  }
}

function startAlarm(label) {
  elements.alarmText.textContent = `🔔 ${label}`;
  elements.alarmBar.hidden = false;
  beep();
  clearInterval(alarmBeepInterval);
  clearTimeout(alarmStopTimer);
  alarmBeepInterval = setInterval(beep, 1_500);
  alarmStopTimer = setTimeout(silenceAlarm, ALARM_MAX_MS);
}

function checkForAlarmEvents(events) {
  if (currentSnapshot?.settings?.monitoringPaused) {
    if (events.length && events[0].timestamp > lastAlarmEventStamp) lastAlarmEventStamp = events[0].timestamp;
    return;
  }
  const products = savedProducts();
  for (const event of events.slice(0, 20)) {
    if (!event.timestamp || event.timestamp <= lastAlarmEventStamp) break;
    if (!ALARM_EVENT_TYPES.has(event.eventType)) continue;
    if (event.eventType === "offer-observed" && event.eligible !== true) continue;
    const product = products.find((candidate) => candidate.id === event.productId);
    if (!product || product.alertLevel !== "alarm") continue;
    const lastFired = alarmLastFiredAt.get(product.id) || 0;
    if (Date.now() - lastFired < ALARM_THROTTLE_MS) continue;
    alarmLastFiredAt.set(product.id, Date.now());
    startAlarm(event.message || `${productLabel(product)}: ${eventName(event.eventType)}`);
    break;
  }
  if (events.length && events[0].timestamp > lastAlarmEventStamp) lastAlarmEventStamp = events[0].timestamp;
}

// --- Feed ---

function renderEvents(allEvents) {
  const events = eventFilterProductId
    ? allEvents.filter((event) => event.productId === eventFilterProductId)
    : allEvents;
  elements.eventFilterButton.hidden = !eventFilterProductId;
  if (eventFilterProductId) {
    elements.eventFilterButton.textContent = `Showing ${productTitle(eventFilterProductId) || "one item"} — show all`;
  }
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = eventFilterProductId ? "No activity for this item yet." : "No activity yet.";
    elements.eventList.replaceChildren(empty);
    return;
  }

  elements.eventList.replaceChildren(...events.map((event) => {
    const row = document.createElement("div");
    row.className = "event-item";
    const dot = document.createElement("span");
    dot.className = event.eligible ? "event-dot good" : "event-dot";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = event.message || eventName(event.eventType);
    const detail = document.createElement("small");
    const parts = [
      STORE_LABELS[event.retailer],
      productTitle(event.productId) || event.sku,
      eventName(event.eventType)
    ].filter(Boolean);
    if (event.price !== undefined) parts.push(money(event.price));
    if (event.orderTotal !== undefined) parts.push(`total ${money(event.orderTotal)}`);
    if (event.reason) parts.push(event.reason.replaceAll("-", " "));
    if (Number.isInteger(event.quantity)) parts.push(`qty ${event.quantity}`);
    if (Number.isInteger(event.attempt)) parts.push(`attempt ${event.attempt}`);
    detail.textContent = parts.join(" · ");
    content.append(title, detail);
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = formatTime(event.timestamp);
    row.append(dot, content, time);
    return row;
  }));
}

// --- Discord connection and restock signal inbox ---

function signalStateLabel(signal) {
  const labels = {
    historical: "History",
    "new-product": "New product",
    disabled: "Recorded",
    stale: "Stale",
    pending: "Opening",
    opened: "Opened",
    failed: "Open failed"
  };
  return labels[signal.autoOpenState] || "Recorded";
}

function freshSignal(signal) {
  const observedAt = new Date(signal.observedAt).getTime();
  return Number.isFinite(observedAt) && Date.now() - observedAt <= 2 * 60_000;
}

function signalMissionSeed(signal) {
  const price = Number(signal.price);
  const seed = {
    retailer: signal.retailer,
    title: signal.title || `${STORE_LABELS[signal.retailer]} ${signal.sku}`,
    productUrl: signal.productUrl,
    sku: signal.sku,
    maxPrice: Number.isFinite(price) && price > 0 ? price : 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "checkout",
    alertLevel: "standard",
    fulfillmentMode: "shipping",
    itemProfileId: currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID,
    priceSource: Number.isFinite(price) && price > 0 ? "signal-observed" : "",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    enabled: false
  };
  const profile = ItemDefaults.itemProfileById(seed.itemProfileId, currentSnapshot?.settings?.itemProfiles || []);
  if (!profile) return seed;
  return {
    ...ItemDefaults.applyItemProfile(
      seed,
      profile,
      currentSnapshot?.settings?.msrpCatalog || [],
      {
        storeOrderAllowances: currentSnapshot?.settings?.storeOrderAllowances,
        orderTaxPercent: currentSnapshot?.settings?.orderTaxPercent
      }
    ),
    // Discord data prefills the workflow but still requires the operator to
    // review the editor and deliberately choose On before saving.
    enabled: false
  };
}

async function addSignalAsMission(signal) {
  await startEdit(null, signalMissionSeed(signal));
  editCardNode?.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

function signalActionButton(label, className = "ghost") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${className} compact`;
  button.textContent = label;
  return button;
}

function buildSignalCard(signal) {
  const card = document.createElement("article");
  card.className = `signal-card ${signal.desired ? "desired" : "new"}`;
  card.dataset.retailer = signal.retailer;

  const top = document.createElement("div");
  top.className = "signal-card-top";
  const identity = document.createElement("div");
  const store = document.createElement("span");
  store.className = "store-name";
  store.textContent = STORE_LABELS[signal.retailer] || signal.retailer;
  const title = document.createElement("strong");
  title.textContent = signal.title || `${STORE_LABELS[signal.retailer]} ${signal.sku}`;
  identity.append(store, title);
  const badge = document.createElement("span");
  badge.className = `signal-match ${signal.desired ? "desired" : "new"}`;
  badge.textContent = signal.desired ? "Desired" : "New";
  top.append(identity, badge);

  const metadata = document.createElement("small");
  metadata.className = "signal-meta";
  const parts = [signal.sku, money(signal.price)];
  if (Number.isInteger(signal.stock)) parts.push(`stock ${signal.stock}`);
  if (Number.isInteger(signal.orderLimit)) parts.push(`limit ${signal.orderLimit}`);
  if (signal.seller) parts.push(signal.seller);
  parts.push(relativeTime(signal.observedAt));
  metadata.textContent = parts.filter(Boolean).join(" · ");

  const note = document.createElement("p");
  note.className = "signal-note";
  note.textContent = `${signalStateLabel(signal)} — ${signal.note || "Signal recorded."}`;

  const actions = document.createElement("div");
  actions.className = "action-row signal-actions";
  const productButton = signalActionButton("Product", "secondary");
  productButton.addEventListener("click", () => void runAction(
    () => window.cartAssist.openSignal(signal.id, "product"),
    (result) => result?.via === "companion-tab" ? "Product opened in an existing Chrome tab." : "Product page opened in Chrome."
  ));
  actions.append(productButton);

  const desiredProduct = savedProducts().find((product) => product.id === signal.productId);
  if (desiredProduct?.affiliateUrl) {
    const shareButton = signalActionButton("Copy campaign link", "secondary");
    shareButton.title = "Copies the admin-provisioned retailer-domain campaign link for this exact product.";
    shareButton.addEventListener("click", () => void runAction(
      () => copyAffiliateProduct(desiredProduct),
      `${productLabel(desiredProduct)} retailer-domain campaign link copied.`
    ));
    actions.append(shareButton);
  }
  const signalPrice = Number(signal.price);
  const directAllowed = Boolean(
    desiredProduct?.enabled
    && isArmed()
    && freshSignal(signal)
    && Number.isFinite(signalPrice)
    && signalPrice > 0
    && signalPrice <= desiredProduct.maxPrice
  );
  const directButtons = [
    ["walmartBuyNowUrl", "walmart-buy-now", "Walmart Buy Now"],
    ["amazonAtcUrl", "amazon-atc", "Amazon ATC"],
    ["amazonBuyNowUrl", "amazon-buy-now", "Amazon Buy Now"]
  ];
  for (const [urlField, entry, label] of directButtons) {
    if (!signal[urlField]) continue;
    const button = signalActionButton(label);
    const sellerAllowed = !entry.startsWith("amazon-") || /^amazon(?:\.com)?$/i.test(String(signal.seller || "").trim());
    const actionAllowed = entry === "amazon-atc"
      ? ["cart", "review", "checkout"].includes(desiredProduct?.action)
      : ["review", "checkout"].includes(desiredProduct?.action);
    button.disabled = !directAllowed || !sellerAllowed || !actionAllowed;
    button.title = button.disabled
      ? "Direct entry requires a desired item/store match, Autopilot ON, a signal under two minutes old and under its cap, plus Amazon.com seller proof for Amazon."
      : "Uses the sanitized exact-SKU link; the browser still re-verifies every purchase condition.";
    button.addEventListener("click", () => void runAction(
      () => window.cartAssist.openSignal(signal.id, entry),
      (result) => result?.directFallback
        ? "Browser context was unavailable, so the canonical product page opened safely instead."
        : `${label} opened with durable item/store context.`
    ));
    actions.append(button);
  }

  if (!signal.desired) {
    const addButton = signalActionButton("+ Add as desired", "primary");
    addButton.addEventListener("click", () => void addSignalAsMission(signal));
    actions.append(addButton);
  }

  card.append(top, metadata, note, actions);
  return card;
}

function renderDiscord(discord = {}, settings = {}) {
  const connected = Boolean(discord.connected);
  const configured = Boolean(discord.configured);
  const credentialUsable = Boolean(discord.credentialUsable);
  const enabled = Boolean(discord.enabled);
  const failed = Boolean(discord.lastError);
  elements.discordState.className = `step-state ${connected ? "ready" : failed ? "attention" : ""}`.trim();
  elements.discordState.textContent = connected
    ? `Listening${discord.channelName ? ` · #${discord.channelName}` : ""}`
    : failed
      ? "Needs attention"
      : enabled && configured
        ? "Connecting…"
        : configured
          ? "Disconnected"
          : "Not connected";
  elements.discordHint.textContent = failed
    ? discord.lastError
    : connected
      ? `Last checked ${relativeTime(discord.lastPollAt)}. New desired signals are matched by store + SKU.`
      : configured
        ? "The bot token is saved securely. Connect to resume listening, or remove the saved token."
        : "Connect an official bot with View Channel, Read Message History, and Message Content access. Discord user tokens and self-bots are never accepted.";
  if (document.activeElement !== elements.discordChannelId) {
    elements.discordChannelId.value = discord.channelId || settings.discordChannelId || "";
  }
  elements.discordBotToken.placeholder = configured
    ? credentialUsable
      ? "Saved securely — leave blank to reuse"
      : "Paste a replacement official bot token"
    : "Paste an official bot token";
  elements.discordConnectButton.textContent = configured
    ? credentialUsable ? "Connect / reconnect" : "Replace token"
    : "Connect & import";
  elements.discordDisconnectButton.hidden = !enabled;
  elements.discordForgetButton.hidden = !configured;
  if (document.activeElement !== elements.discordAutoOpen) {
    elements.discordAutoOpen.checked = settings.discordAutoOpen !== false;
  }
}

function renderSignals(signals = []) {
  const desired = signals.filter((signal) => signal.desired).length;
  const fresh = signals.filter(freshSignal).length;
  elements.signalCount.textContent = `${signals.length} signal${signals.length === 1 ? "" : "s"} · ${desired} desired · ${fresh} fresh`;
  elements.clearSignalsButton.disabled = signals.length === 0;
  if (!signals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No restock signals yet.";
    elements.signalList.replaceChildren(empty);
    return;
  }
  elements.signalList.replaceChildren(...signals.map(buildSignalCard));
}

// --- Top-level render ---

function populateSettingsInputs(settings) {
  const map = [
    [elements.watcherIntervalSeconds, settings.watcherIntervalSeconds],
    [elements.retryIntervalSeconds, settings.retryIntervalSeconds],
    [elements.eligibilityRefreshIntervalSeconds, settings.eligibilityRefreshIntervalSeconds],
    [elements.blitzRetryDelayMs, settings.blitzRetryDelayMs],
    [elements.blitzWindowSeconds, settings.blitzWindowSeconds],
    [elements.scheduledBlitzDurationSeconds, settings.scheduledBlitzDurationSeconds],
    [elements.walmartQueueCaptureReloads, settings.walmartQueueCaptureReloads],
    [elements.storeNavigationIntervalSeconds, settings.storeNavigationIntervalSeconds],
    [elements.overloadCooldownSeconds, settings.overloadCooldownSeconds]
  ];
  for (const [input, value] of map) {
    if (document.activeElement !== input) input.value = value;
  }
  if (document.activeElement !== elements.fastMode) elements.fastMode.checked = settings.fastMode;
  if (document.activeElement !== elements.combinedOrder) elements.combinedOrder.checked = settings.combinedOrderEnabled === true;
}

function render(snapshot) {
  currentSnapshot = snapshot;
  const { settings, status, productStatuses, events, app } = snapshot;

  const companionState = companionStepState();
  elements.connectCard.hidden = companionState.done;
  elements.connectState.textContent = companionState.label;
  elements.connectHint.textContent = companionState.hint;
  elements.connectHint.hidden = !companionState.hint;
  elements.connectionPill.classList.toggle("connected", status.companion === "connected");
  elements.connectionText.textContent = status.companion === "connected"
    ? "Companion connected"
    : companionState.label;
  elements.connectionPill.title = companionState.hint;

  const armed = Boolean(settings.automationEnabled);
  const paused = Boolean(settings.monitoringPaused);
  elements.autopilotToggle.classList.toggle("on", armed);
  elements.autopilotState.textContent = armed ? "ON" : paused ? "STOPPED" : "OFF";
  elements.runStateBanner.dataset.mode = armed ? "autopilot" : paused ? "stopped" : "monitor";
  elements.runStateTitle.textContent = armed ? "Autopilot active" : paused ? "Stopped" : "Monitoring only";
  elements.runStateDetail.textContent = armed
    ? "Purchase actions are enabled. Item-level locks ensure only the first successful selected store can secure each item."
    : paused
      ? "Monitoring is paused, queued openings are cancelled, and purchase actions are off. Your plan and schedule remain saved."
      : "Store pages may keep checking and alerting, but nothing can be added or purchased.";
  elements.testButton.textContent = paused ? "Start monitoring" : "Refresh monitoring";
  elements.disarmButton.textContent = armed || !paused ? "Stop" : "Stopped";
  elements.disarmButton.disabled = paused && !armed;

  populateSettingsInputs(settings);
  renderConfigurationProfiles(settings);
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;
  renderUpdaterState(app.update || { status: "idle" });

  renderMissions();
  renderReadiness(settings, status, productStatuses);
  renderCatalog(snapshot.catalog || {});
  renderItemDefaults(settings);
  renderDiscord(snapshot.discord, settings);
  renderSignals(snapshot.signals || []);
  checkForAlarmEvents(events);
  renderEvents(events);
  renderSchedule();
}

// --- Actions ---

elements.autopilotToggle.addEventListener("click", async () => {
  if (openRunInFlight) return;
  if (!currentSnapshot?.settings?.automationEnabled && !runReviewApproved) {
    if (editingId) {
      setMessage("Finish the open item editor first (Done or Cancel).", "error");
      return;
    }
    if (planEditMode) {
      setMessage("Choose Finish editing before starting Autopilot.", "error");
      return;
    }
    openRunReview();
    return;
  }
  setMissionOpenBusy(true);
  try {
    await runAction(async () => {
      if (!currentSnapshot) throw new Error("Settings have not loaded yet.");
      const approvedFromReview = runReviewApproved;
      runReviewApproved = false;
      if (editingId) throw new Error("Finish the open item editor first (Done or Cancel).");
      if (planEditMode) throw new Error("Choose Finish editing before starting Autopilot.");
      const saved = currentSnapshot.settings;
      if (saved.automationEnabled) {
        const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: false });
        render(next);
        return { armed: false };
      }
      const autoSubmit = autoSubmitArmingSummary(saved);
      if (
        autoSubmit.count > 0
        && !approvedFromReview
        && !window.confirm(`${autoSubmit.count} enabled store option${autoSubmit.count === 1 ? "" : "s"} may submit a real order.${liveVerificationWarning(autoSubmit.liveVerificationCount)} Re-arming starts a new run. If the companion is disconnected, one item page opens first to connect Chrome automatically. Every remaining eligible, tabless Target and Walmart store option gets its own randomized 45–90 second public-page check and opens Chrome after a likely stock signal; Amazon must open now. Scheduled items wait for their exact time. Verify retailer order history first. "Prepare checkout, I submit" is safer. Switch Autopilot on anyway?`)
      ) {
        throw new Error("Autopilot was not switched on.");
      }
      const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
      render(next);
      setMessage("Autopilot ON. Connecting the Chrome companion automatically, then starting every due item…");
      try {
        const launch = await window.cartAssist.openBuyList({ backgroundFirst: true });
        return { armed: true, ...launch };
      } catch (error) {
        try {
          const stopped = await window.cartAssist.saveSettings({ ...next.settings, automationEnabled: false });
          render(stopped);
        } catch (rollbackError) {
          throw new Error(`Autopilot could not finish starting and may still be ON. Stop it before retrying. Startup error: ${error.message || "unknown opening error"}. Stop error: ${rollbackError.message || "unknown save error"}`);
        }
        throw new Error(`Autopilot could not start and was switched back off: ${error.message || "unknown opening error"}`);
      }
    }, (result) => {
      if (!result?.armed) return "Autopilot OFF. Monitoring pages stay open, but nothing will be clicked.";
      const count = Number(result.count || 0);
      const background = Number(result.background || 0);
      const scheduled = Number(result.scheduled || 0);
      const prepMonitoring = Number(result.prepMonitoring || 0);
      const parts = ["Autopilot ON"];
      if (result.connectionOpened) {
        parts.push(result.connectionProductId
          ? "Chrome companion connected automatically on one item page"
          : "Chrome companion connected automatically");
      }
      if (background) {
        parts.push(`${background} Target/Walmart watcher${background === 1 ? "" : "s"} armed background-first`);
      }
      if (count) parts.push(`${count} browser-required store page${count === 1 ? "" : "s"} opened`);
      if (!background && !count && !scheduled && !prepMonitoring) parts.push("no due items needed a browser page");
      if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
      if (result.deduped) parts.push(`${result.deduped} already queued`);
      if (scheduled) parts.push(`${scheduled} waiting for ${scheduled === 1 ? "its" : "their"} calendar time`);
      if (prepMonitoring) parts.push(`${prepMonitoring} Walmart prep candidate${prepMonitoring === 1 ? "" : "s"} monitoring public-page changes`);
      const browserNote = result.defaultBrowser
        ? " Chrome was not found, so some pages used your default browser; Autopilot only works inside Chrome."
        : "";
      const watcherNote = background
        ? " Every eligible quiet watcher is checked independently on a randomized 45–90 second target and opens in Chrome after a likely stock signal."
        : "";
      return `${parts.join(", ")}.${watcherNote} Every open store option performs authoritative browser validation before its configured action. Review items remain on checkout review; a successful auto-submit remains on Target's confirmation page.${browserNote}`;
    });
  } finally {
    setMissionOpenBusy(false);
  }
});

elements.disarmButton.addEventListener("click", () => {
  stopUiEpoch += 1;
  resumeAutopilotAfterPlanEdit = false;
  planEditMode = false;
  planEditBaseline = null;
  planEditUndoStack = [];
  bulkMissionSelectedIds.clear();
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  return runAction(async () => {
    silenceAlarm();
    elements.digestBar.hidden = true;
    const next = await window.cartAssist.stopAll();
    render(next);
    return next;
  }, "Stopped. Autopilot off, all monitoring paused, and queued page openings cancelled. Your plan and scheduled times are still saved.");
});

elements.planEditButton.addEventListener("click", () => {
  if (planEditMode) void finishPlanEditSession();
  else void beginPlanEditSession();
});
elements.planUndoButton.addEventListener("click", () => void runAction(
  undoPlanChange,
  "Last plan change undone."
));
elements.planRevertButton.addEventListener("click", () => void revertPlanChanges());
elements.catalogLauncherButton.addEventListener("click", async () => {
  if (isArmed() && !await beginPlanEditSession()) return;
  const panel = document.getElementById("catalogPanel");
  const toggle = panel?.querySelector(".panel-toggle");
  if (toggle) setPanelExpanded(toggle, true);
  panel?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  setTimeout(() => elements.catalogQuery.focus(), 250);
});
elements.readinessReviewButton.addEventListener("click", () => {
  if (!lastReadinessIssueItemIds.size && runReviewModel().hardIssues.length === 0) {
    openRunReview();
    return;
  }
  const panel = document.getElementById("missionsPanel");
  const toggle = panel?.querySelector(".panel-toggle");
  if (toggle) setPanelExpanded(toggle, true);
  clearMissionFilters();
  if (lastReadinessIssueItemIds.size) {
    elements.missionActiveFilter.value = "problem";
    renderMissions();
  }
  panel?.scrollIntoView?.({ behavior: "smooth", block: "start" });
});
elements.runReviewOpenButton.addEventListener("click", openRunReview);
elements.runReviewCloseButton.addEventListener("click", closeRunReview);
elements.runReviewMonitorButton.addEventListener("click", () => {
  closeRunReview();
  elements.testButton.click();
});
elements.runReviewAutopilotButton.addEventListener("click", () => {
  runReviewApproved = true;
  closeRunReview();
  elements.autopilotToggle.click();
});
elements.testConnectionButton.addEventListener("click", () => {
  elements.testButton.click();
});
elements.newMissionButton.addEventListener("click", () => void startEdit(null));
elements.newMissionGroupButton.addEventListener("click", () => {
  const requested = window.prompt("Name this item group", "New group");
  if (requested === null) return;
  void runAction(async () => {
    if (savedMissionGroups().length >= MAX_MISSION_GROUPS) {
      throw new Error(`You can save up to ${MAX_MISSION_GROUPS} item groups.`);
    }
    const name = requested.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!name) throw new Error("Enter a group name.");
    const group = { id: newCustomId("group"), name, collapsed: false };
    await saveMissionList(savedProducts(), { missionGroups: [...savedMissionGroups(), group] });
    return group;
  }, (group) => `${group.name} group created. Assign items from an individual edit or the plan tools.`);
});
const resetMissionPageAndRender = () => {
  missionVisibleLimit = 25;
  renderMissions();
};
elements.missionSearch.addEventListener("input", resetMissionPageAndRender);
elements.missionGroupFilter.addEventListener("change", resetMissionPageAndRender);
elements.missionRetailerFilter.addEventListener("change", resetMissionPageAndRender);
elements.missionActiveFilter.addEventListener("change", resetMissionPageAndRender);
elements.bulkImportButton.addEventListener("click", () => void openBulkImportDialog());
elements.bulkImportText.addEventListener("input", () => {
  if (elements.bulkImportText.value.trim() === bulkImportPreviewText) return;
  bulkImportPreviewText = "";
  elements.bulkImportSubmitButton.textContent = "Preview import";
});
elements.bulkImportSubmitButton.addEventListener("click", () => void submitBulkImport());
elements.bulkImportCancelButton.addEventListener("click", closeBulkImportDialog);
elements.bulkImportDialog.addEventListener("cancel", (event) => {
  if (bulkImportInFlight) event.preventDefault();
});
elements.bulkImportText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void submitBulkImport();
  }
});
elements.catalogSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitCatalogSearch();
});
elements.catalogClearButton.addEventListener("click", () => void clearCatalog());
elements.catalogSelectAllButton.addEventListener("click", () => {
  const existingIds = new Set((currentSnapshot?.settings?.products || []).map((product) => product.id));
  for (const item of currentSnapshot?.catalog?.items || []) {
    if (!existingIds.has(item.id)) catalogSelectedIds.add(item.id);
  }
  renderCatalog(currentSnapshot?.catalog || {});
});
elements.catalogSelectNoneButton.addEventListener("click", () => {
  catalogSelectedIds.clear();
  renderCatalog(currentSnapshot?.catalog || {});
});
elements.catalogAddButton.addEventListener("click", () => void addSelectedCatalogMissions());
elements.catalogWalmartPrepButton.addEventListener("click", () => void addSelectedWalmartPrepCandidates());

elements.storeAllowanceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    if (isArmed()) throw new Error("Switch Autopilot off before changing tax or store order-total allowances.");
    const inputs = [
      elements.orderTaxPercent,
      elements.targetOrderAllowance,
      elements.walmartOrderAllowance,
      elements.amazonOrderAllowance
    ];
    for (const input of inputs) {
      if (!input.checkValidity()) {
        input.reportValidity();
        throw new Error("Enter a tax percentage from 0% to 100% and a valid non-negative allowance for every retailer.");
      }
    }
    const orderTaxPercent = ItemDefaults.normalizeOrderTaxPercent(elements.orderTaxPercent.value);
    const storeOrderAllowances = ItemDefaults.normalizeStoreOrderAllowances({
      target: elements.targetOrderAllowance.value,
      walmart: elements.walmartOrderAllowance.value,
      amazon: elements.amazonOrderAllowance.value
    });
    const previousTaxPercent = ItemDefaults.normalizeOrderTaxPercent(currentSnapshot.settings.orderTaxPercent);
    const taxChanged = orderTaxPercent !== previousTaxPercent;
    const previous = ItemDefaults.normalizeStoreOrderAllowances(currentSnapshot.settings.storeOrderAllowances);
    const changedRetailers = ItemDefaults.RETAILERS.filter((retailer) => (
      storeOrderAllowances[retailer] !== previous[retailer]
    ));
    const affectedPreflights = currentSnapshot.settings.products.filter((product) => (
      (taxChanged || changedRetailers.includes(product.retailer))
      && product.action === "checkout"
      && product.checkoutPreflightApproved
    )).length;
    const next = await window.cartAssist.saveSettings({
      ...currentSnapshot.settings,
      orderTaxPercent,
      storeOrderAllowances
    });
    render(next);
    return { changed: changedRetailers.length + Number(taxChanged), affectedPreflights };
  }, ({ changed, affectedPreflights }) => {
    if (!changed) return "Tax and store allowances were already up to date.";
    const preflightNote = affectedPreflights
      ? ` ${affectedPreflights} optional saved preflight${affectedPreflights === 1 ? " was" : "s were"} cleared; live checkout verification remains available.`
      : "";
    return `Tax and store allowances saved; final-order caps recalculated.${preflightNote}`;
  });
});

elements.defaultItemProfile.addEventListener("change", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before changing the default item profile.");
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    defaultItemProfileId: elements.defaultItemProfile.value
  });
  render(next);
  return next;
}, "Default import profile saved."));

elements.itemProfileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void runAction(async () => {
    if (isArmed()) throw new Error("Switch Autopilot off before changing item profiles.");
    const name = elements.itemProfileName.value.replace(/\s+/g, " ").trim();
    if (!name) throw new Error("Enter a profile name.");
    const profile = ItemDefaults.normalizeCustomItemProfile({
      id: editingItemProfileId || newCustomId("custom"),
      name,
      description: "Custom reusable item defaults.",
      settings: {
        quantity: elements.itemProfileQuantity.value,
        action: elements.itemProfileAction.value,
        fulfillmentMode: elements.itemProfileFulfillment.value,
        alertLevel: elements.itemProfileAlert.value,
        signalAutoOpen: true,
        enabled: elements.itemProfileEnabled.checked
      }
    });
    const existing = currentSnapshot.settings.itemProfiles || [];
    const duplicate = existing.find((candidate) => (
      candidate.id !== profile.id && candidate.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase()
    ));
    if (duplicate) throw new Error("That item profile name already exists.");
    if (!editingItemProfileId && existing.length >= ItemDefaults.MAX_ITEM_PROFILES) {
      throw new Error(`You can save up to ${ItemDefaults.MAX_ITEM_PROFILES} item profiles.`);
    }
    const profiles = existing.some((candidate) => candidate.id === profile.id)
      ? existing.map((candidate) => candidate.id === profile.id ? profile : candidate)
      : [...existing, profile];
    const linkedProducts = editingItemProfileId
      ? currentSnapshot.settings.products.filter((product) => product.itemProfileId === profile.id)
      : [];
    const updateLinked = linkedProducts.length > 0 && window.confirm(
      `${linkedProducts.length} store option${linkedProducts.length === 1 ? " uses" : "s use"} this template. Apply the updated quantity, action, fulfillment, alerts, and approved MSRP caps to ${linkedProducts.length === 1 ? "it" : "them"} now?`
    );
    const before = updateLinked && planEditMode ? capturePlanSnapshot() : null;
    const products = updateLinked
      ? currentSnapshot.settings.products.map((product) => (
          product.itemProfileId === profile.id
            ? ItemDefaults.applyItemProfile(
                product,
                profile,
                currentSnapshot.settings.msrpCatalog,
                {
                  storeOrderAllowances: currentSnapshot.settings.storeOrderAllowances,
                  orderTaxPercent: currentSnapshot.settings.orderTaxPercent
                }
              )
            : product
        ))
      : currentSnapshot.settings.products;
    const next = await window.cartAssist.saveSettings({
      ...currentSnapshot.settings,
      itemProfiles: profiles,
      products
    });
    render(next);
    recordPlanChange(before);
    fillItemProfileForm(profile);
    renderItemProfilePickers(next.settings);
    return { name: profile.name, updated: updateLinked ? linkedProducts.length : 0 };
  }, ({ name, updated }) => `${name} item template saved.${updated ? ` ${updated} linked store option${updated === 1 ? " was" : "s were"} updated in the same change.` : ""}`);
});

elements.itemProfileResetButton.addEventListener("click", () => {
  resetItemProfileForm();
  renderItemProfilePickers(currentSnapshot.settings);
});

elements.itemProfileDeleteButton.addEventListener("click", () => {
  const profile = (currentSnapshot.settings.itemProfiles || []).find((candidate) => candidate.id === editingItemProfileId);
  if (!profile || !window.confirm(`Delete the item profile "${profile.name}"?`)) return;
  void runAction(async () => {
    if (isArmed()) throw new Error("Switch Autopilot off before changing item profiles.");
    const profiles = currentSnapshot.settings.itemProfiles.filter((candidate) => candidate.id !== profile.id);
    const next = await window.cartAssist.saveSettings({
      ...currentSnapshot.settings,
      itemProfiles: profiles,
      defaultItemProfileId: currentSnapshot.settings.defaultItemProfileId === profile.id
        ? ItemDefaults.DEFAULT_ITEM_PROFILE_ID
        : currentSnapshot.settings.defaultItemProfileId
    });
    resetItemProfileForm();
    render(next);
    return profile.name;
  }, (name) => `${name} item profile deleted.`);
});

elements.addMsrpRecordButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before changing MSRP defaults.");
  if (currentSnapshot.settings.msrpCatalog.length >= ItemDefaults.MAX_MSRP_RECORDS) {
    throw new Error(`You can save up to ${ItemDefaults.MAX_MSRP_RECORDS} MSRP product types.`);
  }
  const record = ItemDefaults.normalizeMsrpRecord({
    id: newCustomId("msrp"),
    productLine: "Pokémon",
    productType: "New product type",
    matchTerms: ["replace me"],
    prices: {},
    sourceLabel: "Needs approval"
  });
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    msrpCatalog: [...currentSnapshot.settings.msrpCatalog, record]
  });
  render(next);
  return next;
}, "New MSRP product type added. Edit its match terms and approved store prices."));

elements.researchMsrpButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before researching MSRP defaults.");
  const next = await window.cartAssist.researchMsrp();
  render(next);
  return next;
}, "Cited MSRP suggestions are ready for review; no purchase caps were changed."));

elements.saveMsrpResearchKeyButton.addEventListener("click", () => void runAction(async () => {
  const key = elements.msrpResearchApiKey.value.trim();
  if (!key) throw new Error("Paste an OpenAI API key first.");
  const next = await window.cartAssist.saveMsrpResearchKey(key);
  elements.msrpResearchApiKey.value = "";
  render(next);
  return next;
}, "OpenAI API key encrypted by the operating system. Enable the separate 30-day option if you want automatic research."));

elements.removeMsrpResearchKeyButton.addEventListener("click", () => {
  if (!window.confirm("Remove the encrypted OpenAI API key and disable monthly MSRP research? Approved prices remain saved.")) return;
  void runAction(async () => {
    const next = await window.cartAssist.removeMsrpResearchKey();
    elements.msrpResearchApiKey.value = "";
    render(next);
    return next;
  }, "OpenAI API key removed. Approved local MSRP values remain available offline.");
});

elements.msrpResearchEnabled.addEventListener("change", () => void runAction(async () => {
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    msrpResearchEnabled: elements.msrpResearchEnabled.checked
  });
  render(next);
  return elements.msrpResearchEnabled.checked;
}, (enabled) => enabled ? "Monthly cited MSRP research enabled." : "Monthly MSRP research disabled."));

elements.bulkMissionSelectAllButton.addEventListener("click", () => {
  for (const item of filteredMissionProducts()) bulkMissionSelectedIds.add(item.id);
  renderMissions();
});
elements.bulkMissionSelectNoneButton.addEventListener("click", () => {
  bulkMissionSelectedIds.clear();
  renderMissions();
});
elements.bulkEnableMissionsButton.addEventListener("click", () => void runAction(
  () => setMissionsEnabled(new Map([...bulkMissionSelectedIds].map((id) => [id, true]))),
  `${bulkMissionSelectedIds.size} selected item${bulkMissionSelectedIds.size === 1 ? "" : "s"} turned On.`
));
elements.bulkDisableMissionsButton.addEventListener("click", () => void runAction(
  () => setMissionsEnabled(new Map([...bulkMissionSelectedIds].map((id) => [id, false]))),
  `${bulkMissionSelectedIds.size} selected item${bulkMissionSelectedIds.size === 1 ? "" : "s"} turned Off.`
));
elements.copySelectedMissionListButton.addEventListener("click", () => void runAction(
  () => window.cartAssist.copyMissionList(selectedRouteIds()),
  ({ count }) => `${bulkMissionSelectedIds.size} selected item${bulkMissionSelectedIds.size === 1 ? "" : "s"} (${count} store route${count === 1 ? "" : "s"}) copied as a consolidated list.`
));
elements.combineSelectedItemsButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Stop Autopilot before combining items.");
  const selected = [...bulkMissionSelectedIds];
  const products = ItemMissions.combineItems(savedProducts(), selected);
  const combinedItemId = ItemMissions.itemIdForProduct(products.find((product) => selected.includes(ItemMissions.itemIdForProduct(product))) || {});
  await saveMissionList(products);
  bulkMissionSelectedIds.clear();
  if (combinedItemId) bulkMissionSelectedIds.add(combinedItemId);
  renderMissions();
  return selected.length;
}, (count) => `${count} store-specific entries combined into one item. Its stores now act as alternatives, and the first successful store stops the others.`));
elements.applyBulkItemProfileButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before bulk updating items.");
  const profile = ItemDefaults.itemProfileById(elements.bulkItemProfile.value, currentSnapshot.settings.itemProfiles);
  if (!profile) throw new Error("Choose an item profile.");
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product))
      ? ItemDefaults.applyItemProfile(
          product,
          profile,
          currentSnapshot.settings.msrpCatalog,
          {
            storeOrderAllowances: currentSnapshot.settings.storeOrderAllowances,
            orderTaxPercent: currentSnapshot.settings.orderTaxPercent
          }
        )
      : product
  ));
  const ready = savedItems(products).filter((item) => bulkMissionSelectedIds.has(item.id) && item.enabled).length;
  await saveMissionList(products);
  return { selected: bulkMissionSelectedIds.size, ready };
}, ({ selected, ready }) => `${selected} item${selected === 1 ? "" : "s"} updated; ${ready} now On with positive caps.`));

elements.applyBulkMissionGroupButton.addEventListener("click", () => void runAction(async () => {
  if (!bulkMissionSelectedIds.size) throw new Error("Select at least one item first.");
  const groupId = elements.bulkMissionGroup.value;
  if (groupId && !savedMissionGroups().some((group) => group.id === groupId)) {
    throw new Error("Choose an existing item group.");
  }
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product)) ? { ...product, groupId } : product
  ));
  await saveMissionList(products);
  return { count: bulkMissionSelectedIds.size, groupId };
}, ({ count, groupId }) => {
  const group = savedMissionGroups().find((candidate) => candidate.id === groupId);
  return `${count} selected item${count === 1 ? "" : "s"} moved to ${group?.name || "Ungrouped"}.`;
}));

elements.scheduleCandidateMissionsButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before scheduling items.");
  if (!bulkMissionSelectedIds.size) throw new Error("Select at least one item first.");
  if (!elements.bulkMissionOpenAt.checkValidity() || !elements.bulkMissionOpenAt.value) {
    elements.bulkMissionOpenAt.reportValidity();
    throw new Error("Choose a future candidate opening time.");
  }
  const openAt = new Date(elements.bulkMissionOpenAt.value);
  if (!Number.isFinite(openAt.getTime()) || openAt.getTime() <= Date.now()) {
    throw new Error("Choose a future candidate opening time.");
  }
  const profile = ConfigProfiles.BUILT_IN_PROFILES.find((candidate) => candidate.id === "built-in:candidate-drop");
  if (!profile) throw new Error("The Midnight candidates setup is unavailable.");
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product)) ? { ...product, openAt: openAt.toISOString() } : product
  ));
  selectedConfigurationProfileId = profile.id;
  await saveMissionList(products, profile.configuration);
  return { count: bulkMissionSelectedIds.size, openAt: openAt.toISOString() };
}, ({ count, openAt }) => (
  `${count} candidate item${count === 1 ? "" : "s"} scheduled for ${new Date(openAt).toLocaleString()}; the bounded 15-minute candidate setup is active.`
)));

elements.clearSelectedMissionSchedulesButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before clearing schedules.");
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(ItemMissions.itemIdForProduct(product)) ? { ...product, openAt: "" } : product
  ));
  const cleared = savedItems().filter((item) => bulkMissionSelectedIds.has(item.id) && item.openAt).length;
  await saveMissionList(products);
  return cleared;
}, (cleared) => `${cleared} selected item schedule${cleared === 1 ? "" : "s"} cleared.`));

elements.showDiscordButton.addEventListener("click", () => {
  elements.discordLauncher.hidden = true;
  elements.signalPanel.hidden = false;
  elements.showDiscordButton.setAttribute("aria-expanded", "true");
  const toggle = elements.signalPanel.querySelector(".panel-toggle");
  if (toggle) {
    setPanelExpanded(toggle, true);
    toggle.focus();
  }
});

elements.discordConnectButton.addEventListener("click", () => void runAction(async () => {
  if (!elements.discordChannelId.checkValidity()) {
    elements.discordChannelId.reportValidity();
    throw new Error("Enter the Discord signal channel ID.");
  }
  const next = await window.cartAssist.connectDiscord({
    token: elements.discordBotToken.value,
    channelId: elements.discordChannelId.value
  });
  elements.discordBotToken.value = "";
  render(next);
  return next;
}, "Discord connected. Recent messages were imported as history; only later fresh signals can open pages automatically."));

elements.discordDisconnectButton.addEventListener("click", () => void runAction(async () => {
  const next = await window.cartAssist.disconnectDiscord();
  render(next);
  return next;
}, "Discord signal listening is disconnected. The encrypted bot token remains saved."));

elements.discordForgetButton.addEventListener("click", () => {
  if (!window.confirm("Remove the encrypted Discord bot token from this computer? Existing signal inbox entries will remain.")) return;
  void runAction(async () => {
    const next = await window.cartAssist.forgetDiscord();
    elements.discordBotToken.value = "";
    render(next);
    return next;
  }, "Saved Discord bot token removed.");
});

elements.discordAutoOpen.addEventListener("change", () => void runAction(async () => {
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    discordAutoOpen: elements.discordAutoOpen.checked
  });
  render(next);
  return next;
}, () => elements.discordAutoOpen.checked
  ? "Fresh desired Discord signals will open automatically."
  : "Discord signals will be recorded without automatic openings."));

elements.clearSignalsButton.addEventListener("click", () => {
  if (!window.confirm("Clear the local Discord signal inbox? This does not delete anything from Discord.")) return;
  void runAction(async () => {
    const next = await window.cartAssist.clearSignals();
    render(next);
    return next;
  }, "Local signal inbox cleared.");
});

// Drag a mission card to reorder; order is cosmetic and saves immediately.
elements.missionList.addEventListener("dragover", (event) => {
  if (!editingId) event.preventDefault();
});
elements.missionList.addEventListener("drop", (event) => {
  event.preventDefault();
  const sourceId = event.dataTransfer.getData("text/plain");
  if (!sourceId || editingId) return;
  const products = [...savedProducts()];
  const items = savedItems(products);
  const from = items.findIndex((candidate) => candidate.id === sourceId);
  if (from === -1) return;
  const targetCard = event.target instanceof Element ? event.target.closest(".mission-card") : null;
  const targetId = targetCard?.dataset.itemId || "";
  if (targetId === sourceId) return;
  const targetSection = event.target instanceof Element ? event.target.closest(".mission-group") : null;
  const targetItem = items.find((candidate) => candidate.id === targetId);
  const destinationGroupId = targetItem?.groupId ?? targetSection?.dataset.groupId;
  const [source] = items.splice(from, 1);
  const moved = destinationGroupId === undefined
    ? source
    : { ...source, groupId: destinationGroupId, variants: source.variants.map((variant) => ({ ...variant, groupId: destinationGroupId })) };
  let to = items.length;
  if (targetId) {
    const targetIndex = items.findIndex((candidate) => candidate.id === targetId);
    if (targetIndex !== -1) to = targetIndex;
  } else if (destinationGroupId !== undefined) {
    const lastGroupIndex = items.findLastIndex((candidate) => (
      (candidate.groupId || "") === destinationGroupId
    ));
    if (lastGroupIndex !== -1) to = lastGroupIndex + 1;
  }
  items.splice(to, 0, moved);
  const reordered = items.flatMap((item) => item.variants);
  void runAction(() => saveMissionList(reordered), destinationGroupId !== undefined && destinationGroupId !== source.groupId
    ? "Item moved to its new group."
    : "Items reordered.");
});

function setMissionOpenBusy(busy) {
  openRunInFlight = busy;
  elements.autopilotToggle.disabled = busy;
  elements.testButton.disabled = busy;
  elements.openAllButton.disabled = busy;
  elements.planEditButton.disabled = busy;
}

elements.testButton.addEventListener("click", async () => {
  if (openRunInFlight) return;
  setMissionOpenBusy(true);
  setMessage("Connecting the Chrome companion automatically, then checking every due enabled item…");
  try {
    await runAction(async () => {
      if (isArmed()) {
        throw new Error("Switch Autopilot off before Monitor only — it opens item pages without buying anything.");
      }
      return window.cartAssist.testEvent();
    }, (result) => {
      const count = Number(result?.count || 0);
      const parts = [`Monitor-only check started for ${count} enabled store option${count === 1 ? "" : "s"}`];
      if (result?.connectionOpened) parts.push("Chrome companion connected automatically");
      if (result?.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
      if (result?.deduped) parts.push(`${result.deduped} already queued`);
      if (result?.scheduled) parts.push(`${result.scheduled} waiting for ${result.scheduled === 1 ? "its" : "their"} calendar time`);
      const browserNote = result?.defaultBrowser
        ? " Chrome was not found, so your default browser was used — the companion only checks pages opened in Chrome."
        : "";
      return `${parts.join(", ")}. Autopilot is OFF, so nothing will be added.${browserNote}`;
    });
  } finally {
    setMissionOpenBusy(false);
  }
});

elements.openAllButton.addEventListener("click", async () => {
  if (openRunInFlight) return;
  const actionStopEpoch = stopUiEpoch;
  setMissionOpenBusy(true);
  setMessage("Opening due enabled items… multiple store pages are paced to respect store limits.");
  try {
    const result = await window.cartAssist.openBuyList();
    if (actionStopEpoch !== stopUiEpoch) return;
    const parts = [`${result.count} store page${result.count === 1 ? "" : "s"} opened`];
    if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
    if (result.deduped) parts.push(`${result.deduped} already queued`);
    if (result.scheduled) parts.push(`${result.scheduled} waiting for ${result.scheduled === 1 ? "its" : "their"} calendar time`);
    const armNote = result.armed
      ? "Autopilot is ON — items act as each store page loads."
      : "Autopilot is OFF — nothing will be added until you switch it on.";
    const browserNote = result.defaultBrowser
      ? " Chrome was not found, so your default browser was used — the companion only works inside Chrome."
      : "";
    setMessage(`${parts.join(", ")}. ${armNote}${browserNote}`, result.defaultBrowser ? "error" : result.armed ? "success" : "warn");
  } catch (error) {
    if (actionStopEpoch === stopUiEpoch) setMessage(error.message || "The action failed.", "error");
  } finally {
    setMissionOpenBusy(false);
  }
});

function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    const rapidSeconds = Number(elements.eligibilityRefreshIntervalSeconds.value);
    const normalSeconds = Number(elements.storeNavigationIntervalSeconds.value);
    elements.eligibilityRefreshIntervalSeconds.setCustomValidity(
      rapidSeconds > normalSeconds
        ? "Pre-eligibility refresh cannot be slower than the normal store traffic spacing."
        : ""
    );
    for (const input of [
      elements.watcherIntervalSeconds,
      elements.retryIntervalSeconds,
      elements.eligibilityRefreshIntervalSeconds,
      elements.blitzRetryDelayMs,
      elements.blitzWindowSeconds,
      elements.scheduledBlitzDurationSeconds,
      elements.walmartQueueCaptureReloads,
      elements.storeNavigationIntervalSeconds,
      elements.overloadCooldownSeconds
    ]) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }
    }
    void runAction(() => saveMissionList(savedProducts()), "Settings saved.");
  }, 600);
}

elements.fastMode.addEventListener("change", scheduleSettingsSave);
elements.combinedOrder.addEventListener("change", scheduleSettingsSave);
elements.watcherIntervalSeconds.addEventListener("change", scheduleSettingsSave);
elements.retryIntervalSeconds.addEventListener("change", scheduleSettingsSave);
elements.eligibilityRefreshIntervalSeconds.addEventListener("change", scheduleSettingsSave);
elements.blitzRetryDelayMs.addEventListener("change", scheduleSettingsSave);
elements.blitzWindowSeconds.addEventListener("change", scheduleSettingsSave);
elements.scheduledBlitzDurationSeconds.addEventListener("change", scheduleSettingsSave);
elements.walmartQueueCaptureReloads.addEventListener("change", scheduleSettingsSave);
elements.storeNavigationIntervalSeconds.addEventListener("change", scheduleSettingsSave);
elements.overloadCooldownSeconds.addEventListener("change", scheduleSettingsSave);

elements.configurationProfileSelect.addEventListener("change", () => {
  selectedConfigurationProfileId = elements.configurationProfileSelect.value;
  renderConfigurationProfiles(currentSnapshot.settings);
});

elements.applyConfigurationProfileButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before applying a saved setup.");
  const profile = selectedConfigurationProfile();
  if (!profile) throw new Error("Choose a setup first.");
  clearTimeout(settingsSaveTimer);
  await saveMissionList(
    savedProducts(),
    ConfigProfiles.normalizeConfiguration(profile.configuration)
  );
  return profile.name;
}, (name) => `${name} applied. Products, caps, quantities, and purchase actions were not changed.`));

elements.saveConfigurationProfileButton.addEventListener("click", () => void runAction(async () => {
  const name = elements.configurationProfileName.value.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Enter a name for your setup.");
  if (name.length > 40) throw new Error("Setup names can contain at most 40 characters.");
  const customProfiles = [...(currentSnapshot.settings.configurationProfiles || [])];
  const selected = selectedConfigurationProfile();
  const selectedIndex = selected?.id.startsWith("custom:")
    ? customProfiles.findIndex((profile) => profile.id === selected.id)
    : -1;
  const duplicateIndex = customProfiles.findIndex((profile, index) => (
    index !== selectedIndex && profile.name.toLowerCase() === name.toLowerCase()
  ));
  if (duplicateIndex >= 0) throw new Error("That setup name is already saved. Select it to update or delete it.");
  if (selectedIndex < 0 && customProfiles.length >= ConfigProfiles.MAX_CUSTOM_PROFILES) {
    throw new Error(`You can save up to ${ConfigProfiles.MAX_CUSTOM_PROFILES} custom setups.`);
  }

  const profile = {
    id: selectedIndex >= 0
      ? customProfiles[selectedIndex].id
      : `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    configuration: currentConfiguration()
  };
  if (selectedIndex >= 0) customProfiles[selectedIndex] = profile;
  else customProfiles.push(profile);
  selectedConfigurationProfileId = profile.id;
  clearTimeout(settingsSaveTimer);
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    ...profile.configuration,
    configurationProfiles: customProfiles
  });
  render(next);
  return name;
}, (name) => `${name} saved. It stores only the speed and traffic settings.`));

elements.deleteConfigurationProfileButton.addEventListener("click", () => {
  const profile = selectedConfigurationProfile();
  if (!profile?.id.startsWith("custom:")) return;
  if (!window.confirm(`Delete the saved setup "${profile.name}"?`)) return;
  void runAction(async () => {
    const nextProfiles = (currentSnapshot.settings.configurationProfiles || []).filter((candidate) => candidate.id !== profile.id);
    selectedConfigurationProfileId = ConfigProfiles.BUILT_IN_PROFILES[0].id;
    const next = await window.cartAssist.saveSettings({
      ...currentSnapshot.settings,
      configurationProfiles: nextProfiles
    });
    render(next);
    return profile.name;
  }, (name) => `${name} deleted. Your current settings were not changed.`);
});

elements.openCartButton.addEventListener("click", () => runAction(
  () => window.cartAssist.openCart(elements.storeShortcut.value),
  `${STORE_LABELS[elements.storeShortcut.value]} cart opened.`
));

elements.openOrdersButton.addEventListener("click", () => runAction(
  () => window.cartAssist.openOrders(elements.storeShortcut.value),
  `${STORE_LABELS[elements.storeShortcut.value]} orders opened.`
));

elements.showExtensionButton.addEventListener("click", () => runAction(
  () => window.cartAssist.showExtension(),
  "Companion folder shown in File Explorer."
));

elements.copyExtensionButton.addEventListener("click", () => runAction(
  () => window.cartAssist.copyExtensionPath(),
  "Companion folder path copied."
));
elements.openChromeExtensionsButton.addEventListener("click", () => runAction(
  () => window.cartAssist.openChromeExtensions(),
  "Chrome extensions opened. Turn on Developer mode, choose Load unpacked, then select the companion folder."
));

elements.clearEventsButton.addEventListener("click", () => runAction(async () => {
  const next = await window.cartAssist.clearEvents();
  render(next);
}, "Activity cleared."));

elements.enableScheduledButton.addEventListener("click", () => {
  const updates = new Map(
    scheduledProducts(true).filter((item) => !item.enabled).map((item) => [item.id, true])
  );
  if (!updates.size) return;
  void runAction(
    () => setMissionsEnabled(updates),
    `${updates.size} scheduled item${updates.size === 1 ? "" : "s"} enabled.`
  );
});
elements.clearMissedSchedulesButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Stop Autopilot before clearing missed schedule times.");
  const missedIds = new Set(scheduledProducts(true)
    .filter((item) => item.openAtMs < Date.now() - 120_000)
    .map((item) => item.id));
  const next = await saveMissionList(savedProducts().map((product) => (
    missedIds.has(ItemMissions.itemIdForProduct(product)) ? { ...product, openAt: "" } : product
  )));
  return { next, count: missedIds.size };
}, ({ count }) => `${count} missed item schedule${count === 1 ? "" : "s"} cleared.`));

// Morning digest: summarize what happened while the window was unfocused.
const DIGEST_MIN_AWAY_MS = 10 * 60_000;

function showDigest(text) {
  elements.digestText.textContent = text;
  elements.digestBar.hidden = false;
}

elements.digestDismissButton.addEventListener("click", () => {
  elements.digestBar.hidden = true;
});

window.addEventListener("blur", () => {
  awaySince = Date.now();
});

window.addEventListener("focus", () => {
  const since = awaySince;
  awaySince = 0;
  if (!since || Date.now() - since < DIGEST_MIN_AWAY_MS) return;
  const sinceIso = new Date(since).toISOString();
  const recent = (currentSnapshot?.events || []).filter((event) => event.timestamp > sinceIso);
  if (!recent.length) return;
  const count = (predicate) => recent.filter(predicate).length;
  const orders = count((event) => event.eventType === "order-confirmed");
  const secured = count((event) => event.eventType === "cart-item-confirmed");
  const reviews = count((event) => event.eventType === "notification-sent" && event.sourceEventType === "review-ready");
  const sightings = count((event) => event.eventType === "offer-observed" && event.eligible === true);
  const blocks = count((event) => (
    event.eventType === "notification-sent"
    && ["automation-blocked", "store-error"].includes(event.sourceEventType)
  ));
  const parts = [];
  if (orders) parts.push(`${orders} order${orders === 1 ? "" : "s"} confirmed`);
  if (secured) parts.push(`${secured} cart${secured === 1 ? "" : "s"} secured`);
  if (reviews) parts.push(`${reviews} final review${reviews === 1 ? "" : "s"} ready`);
  if (sightings) parts.push(`${sightings} eligible sighting${sightings === 1 ? "" : "s"}`);
  if (blocks) parts.push(`${blocks} block${blocks === 1 ? "" : "s"}`);
  if (!parts.length) return;
  showDigest(`While you were away: ${parts.join(" · ")}.`);
});

elements.silenceAlarmButton.addEventListener("click", silenceAlarm);
elements.updateButton.addEventListener("click", () => {
  if (updateButtonMode === "install") void requestAppUpdate();
  else void requestUpdateCheck();
});
elements.eventFilterButton.addEventListener("click", () => {
  eventFilterProductId = null;
  renderEvents(currentSnapshot?.events || []);
});

window.cartAssist.onUpdate((snapshot) => render(snapshot));
if (typeof window.cartAssist.onUpdaterState === "function") {
  window.cartAssist.onUpdaterState((state) => renderUpdaterState(state));
}
setInterval(() => {
  updateScheduleNext();
  updateStatusAges();
}, 1000);

window.cartAssist.getSnapshot()
  .then((snapshot) => render(snapshot))
  .catch((error) => setMessage(error.message || "Unable to load the app.", "error"));
