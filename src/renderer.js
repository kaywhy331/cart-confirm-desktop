"use strict";

const ConfigProfiles = globalThis.CartConfirmConfigProfiles;
const ItemDefaults = globalThis.CartConfirmItemDefaults;
const elements = {
  autopilotToggle: document.getElementById("autopilotToggle"),
  autopilotState: document.getElementById("autopilotState"),
  disarmButton: document.getElementById("disarmButton"),
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
  copyExtensionButton: document.getElementById("copyExtensionButton"),
  portBadge: document.getElementById("portBadge"),
  missionList: document.getElementById("missionList"),
  missionViewTemplate: document.getElementById("missionViewTemplate"),
  missionEditTemplate: document.getElementById("missionEditTemplate"),
  newMissionButton: document.getElementById("newMissionButton"),
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
  defaultItemProfile: document.getElementById("defaultItemProfile"),
  itemProfileForm: document.getElementById("itemProfileForm"),
  itemProfileId: document.getElementById("itemProfileId"),
  itemProfileName: document.getElementById("itemProfileName"),
  itemProfileQuantity: document.getElementById("itemProfileQuantity"),
  itemProfileAction: document.getElementById("itemProfileAction"),
  itemProfileFulfillment: document.getElementById("itemProfileFulfillment"),
  itemProfileBuffer: document.getElementById("itemProfileBuffer"),
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
  bulkMissionList: document.getElementById("bulkMissionList"),
  bulkItemProfile: document.getElementById("bulkItemProfile"),
  applyBulkItemProfileButton: document.getElementById("applyBulkItemProfileButton"),
  copySelectedMissionListButton: document.getElementById("copySelectedMissionListButton"),
  bulkMissionOpenAt: document.getElementById("bulkMissionOpenAt"),
  scheduleCandidateMissionsButton: document.getElementById("scheduleCandidateMissionsButton"),
  clearSelectedMissionSchedulesButton: document.getElementById("clearSelectedMissionSchedulesButton"),
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

function setPanelExpanded(toggle, expanded) {
  const panel = toggle.closest(".collapsible-panel");
  if (!panel) return;
  const content = document.getElementById(toggle.getAttribute("aria-controls"));
  panel.classList.toggle("is-collapsed", !expanded);
  if (content) content.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded ? "Minimize" : "Expand";
}

for (const toggle of document.querySelectorAll(".panel-toggle")) {
  setPanelExpanded(toggle, toggle.getAttribute("aria-expanded") !== "false");
  toggle.addEventListener("click", () => {
    setPanelExpanded(toggle, toggle.getAttribute("aria-expanded") !== "true");
  });
}

let currentSnapshot = null;
let messageTimer = null;
let openRunInFlight = false;
let editingId = null; // null | product id | "new"
let editCardNode = null;
let resumeAutopilotAfterEdit = false;
let awaySince = 0;
let settingsSaveTimer = null;
let selectedConfigurationProfileId = "built-in:recommended";
let eventFilterProductId = null;
let bulkImportInFlight = false;
let catalogSearchInFlight = false;
let catalogImportInFlight = false;
let renderedCatalogSearchId = "";
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
  const applied = ItemDefaults.applyItemProfile(
    profileSeedFromFields(card),
    profile,
    currentSnapshot?.settings?.msrpCatalog || []
  );
  field(card, "maxPrice").value = String(applied.maxPrice || 0);
  field(card, "maxOrderTotal").value = String(applied.maxOrderTotal || 0);
  field(card, "quantity").value = String(applied.quantity);
  field(card, "action").value = applied.action;
  field(card, "alertLevel").value = applied.alertLevel;
  field(card, "fulfillmentMode").value = applied.fulfillmentMode;
  field(card, "signalAutoOpen").checked = applied.signalAutoOpen;
  field(card, "enabled").checked = applied.enabled;
  field(card, "msrpRecordId").value = applied.msrpRecordId || "";
  field(card, "priceSource").value = applied.priceSource || "";
  field(card, "action").dispatchEvent(new Event("change", { bubbles: true }));
  return applied;
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

function globalSettings(products) {
  return {
    products,
    automationEnabled: isArmed(),
    fastMode: elements.fastMode.checked,
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
    scheduledOpenEnabled: false,
    scheduledRetailer: currentSnapshot?.settings?.scheduledRetailer || "target",
    scheduledOpenAt: "",
    discordEnabled: Boolean(currentSnapshot?.settings?.discordEnabled),
    discordChannelId: currentSnapshot?.settings?.discordChannelId || "",
    discordAutoOpen: currentSnapshot?.settings?.discordAutoOpen !== false
  };
}

async function saveMissionList(products) {
  const next = await window.cartAssist.saveSettings(globalSettings(products));
  render(next);
  return next;
}

// --- Pause / resume Autopilot around edits, so armed missions stay editable ---

async function pauseAutopilot() {
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    automationEnabled: false
  });
  render(next);
}

async function resumeAutopilot() {
  const saved = currentSnapshot.settings;
  const autoSubmitCount = [...saved.products, ...(saved.walmartPrepCandidates || [])]
    .filter((product) => product.enabled && product.action === "checkout").length;
  if (
    autoSubmitCount > 0
    && !window.confirm(`${autoSubmitCount} enabled mission${autoSubmitCount === 1 ? "" : "s"} may submit a real order. Resuming starts a new run. Switch Autopilot back on?`)
  ) {
    setMessage("Autopilot stayed off. Switch it on from the header when ready.", "warn");
    return;
  }
  const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
  render(next);
}

// Apply per-mission enabled changes, transparently pausing and resuming
// Autopilot when it is on (a resume starts a new run by design).
async function setMissionsEnabled(updates) {
  const actionStopEpoch = stopUiEpoch;
  const wasArmed = isArmed();
  if (wasArmed) await pauseAutopilot();
  await saveMissionList(savedProducts().map((product) => (
    updates.has(product.id) ? { ...product, enabled: updates.get(product.id) } : product
  )));
  if (wasArmed && actionStopEpoch === stopUiEpoch) await resumeAutopilot();
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
  if (status.eligible) return "Eligible offer";
  if (status.reason) return status.reason.replaceAll("-", " ");
  return "Waiting";
}

function defaultStatus() {
  return {
    eligible: false,
    reason: "",
    cart: "not-confirmed",
    checkout: "not-started",
    order: "not-confirmed",
    lastEventAt: "",
    lastMessage: "Waiting for this mission to be observed."
  };
}

function buildViewCard(product, status) {
  const card = elements.missionViewTemplate.content.firstElementChild.cloneNode(true);
  const stateClass = productStateClass(product, status);
  card.classList.add(stateClass || "idle");
  card.dataset.retailer = product.retailer;
  card.title = `${STORE_LABELS[product.retailer]} ${product.sku} — ${status.lastMessage || "Waiting."}`;

  view(card, "enabled").checked = product.enabled !== false;
  view(card, "store").textContent = STORE_LABELS[product.retailer];
  view(card, "title").textContent = productLabel(product);

  const subParts = [`$${Number(product.maxPrice).toFixed(2)} cap`, `×${product.quantity}`];
  if (["review", "checkout"].includes(product.action)) subParts.push(`total cap $${Number(product.maxOrderTotal).toFixed(2)}`);
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
  if (product.affiliateUrl) subParts.push("Campaign share ready");
  view(card, "sub").textContent = subParts.join(" · ");

  view(card, "action").textContent = ACTION_LABELS[product.action] || product.action;
  view(card, "action").dataset.action = product.action;
  const age = view(card, "age");
  age.dataset.at = status.lastEventAt || "";
  age.textContent = relativeTime(status.lastEventAt || "");
  const state = view(card, "state");
  state.className = `state-chip ${stateClass}`.trim();
  state.textContent = stateLabel(product, status);

  const armedNow = isArmed();
  const editButton = card.querySelector(".mission-edit");
  const removeButton = card.querySelector(".mission-remove");
  if (armedNow) {
    editButton.title = "Pauses Autopilot while you edit; it resumes on Done";
    removeButton.title = "Pauses Autopilot to remove, then resumes";
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


  card.querySelector(".mission-open").addEventListener("click", () => {
    void runAction(
      () => window.cartAssist.openProduct(product.id),
      (result) => (result?.via === "companion-tab"
        ? `${productLabel(product)} opened in your existing Chrome tab.`
        : `${productLabel(product)} page opened in Chrome.`)
    );
  });
  const copyAffiliateButton = card.querySelector(".mission-copy-affiliate");
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
      const actionStopEpoch = stopUiEpoch;
      const wasArmed = isArmed();
      if (wasArmed) await pauseAutopilot();
      await saveMissionList(savedProducts().filter((candidate) => candidate.id !== product.id));
      if (wasArmed && actionStopEpoch === stopUiEpoch) await resumeAutopilot();
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

function buildEditCard(product, options = {}) {
  const card = elements.missionEditTemplate.content.firstElementChild.cloneNode(true);
  const retailer = product?.retailer || "target";
  const initialProfile = ItemDefaults.itemProfileById(
    product?.itemProfileId || currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID,
    currentSnapshot?.settings?.itemProfiles || []
  ) || ItemDefaults.BUILT_IN_ITEM_PROFILES[0];
  field(card, "retailer").value = retailer;
  field(card, "title").value = product?.title || "";
  field(card, "productUrl").value = product?.productUrl || "";
  field(card, "sku").value = product?.sku || "";
  field(card, "maxPrice").value = product ? String(Number(product.maxPrice || 0)) : "";
  field(card, "maxOrderTotal").value = String(Number(product?.maxOrderTotal || 0));
  field(card, "quantity").value = product?.quantity || initialProfile.settings.quantity;
  field(card, "action").value = product?.action || initialProfile.settings.action;
  field(card, "alertLevel").value = product?.alertLevel || initialProfile.settings.alertLevel;
  field(card, "fulfillmentMode").value = product?.fulfillmentMode || initialProfile.settings.fulfillmentMode;
  field(card, "signalEntry").value = product?.signalEntry || "product";
  field(card, "signalAutoOpen").checked = product ? product.signalAutoOpen !== false : true;
  itemProfileOptions(
    field(card, "itemProfileId"),
    product?.itemProfileId || currentSnapshot?.settings?.defaultItemProfileId || ItemDefaults.DEFAULT_ITEM_PROFILE_ID
  );
  field(card, "msrpRecordId").value = product?.msrpRecordId || "";
  field(card, "priceSource").value = product?.priceSource || "";
  field(card, "openAt").value = toLocalInputValue(product?.openAt);
  field(card, "enabled").checked = product ? product.enabled !== false : false;
  updateEditStore(card);

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

  field(card, "retailer").addEventListener("change", () => updateEditStore(card));
  field(card, "productUrl").addEventListener("change", () => {
    const url = field(card, "productUrl").value;
    const detected = detectRetailer(url);
    if (detected) {
      field(card, "retailer").value = detected;
      updateEditStore(card);
      const detectedSku = extractSku(detected, url);
      if (detectedSku) field(card, "sku").value = detectedSku;
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
  });
  field(card, "sku").addEventListener("change", () => {
    if (field(card, "retailer").value === "amazon") {
      field(card, "sku").value = field(card, "sku").value.trim().toUpperCase();
    }
  });
  field(card, "action").addEventListener("change", () => {
    if (["review", "checkout"].includes(field(card, "action").value)) advanced.open = true;
    validateFulfillmentSelection();
    updateSignalEntryOptions(card);
  });
  field(card, "fulfillmentMode").addEventListener("change", validateFulfillmentSelection);
  field(card, "maxPrice").addEventListener("change", () => {
    field(card, "priceSource").value = Number(field(card, "maxPrice").value) > 0 ? "manual" : "";
    if (options.isNew) updateNewMissionPriceDefaults(card);
  });
  field(card, "quantity").addEventListener("change", () => {
    if (options.isNew) updateNewMissionPriceDefaults(card);
  });
  card.querySelector(".mission-apply-profile").addEventListener("click", () => {
    try {
      const applied = applyProfileToEditor(card);
      setMessage(applied.enabled
        ? `Profile applied with a $${applied.maxPrice.toFixed(2)} approved MSRP cap.`
        : "Profile applied. No approved MSRP matched, so the mission remains Off until you set or approve a price.",
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
    if (resumeAutopilotAfterEdit) {
      resumeAutopilotAfterEdit = false;
      void runAction(() => resumeAutopilot(), "Autopilot resumed.");
    }
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

function collectMission(card) {
  const retailer = field(card, "retailer").value;
  const sku = field(card, "sku").value.trim();
  const openAtValue = field(card, "openAt").value;
  const existing = editingId && editingId !== "new"
    ? savedProducts().find((candidate) => candidate.id === editingId)
    : null;
  return {
    retailer,
    title: field(card, "title").value.trim(),
    openAt: openAtValue ? new Date(openAtValue).toISOString() : "",
    productUrl: field(card, "productUrl").value.trim(),
    sku: retailer === "amazon" ? sku.toUpperCase() : sku,
    maxPrice: Number(field(card, "maxPrice").value),
    maxOrderTotal: Number(field(card, "maxOrderTotal").value),
    quantity: Number(field(card, "quantity").value),
    action: field(card, "action").value,
    alertLevel: field(card, "alertLevel").value,
    fulfillmentMode: field(card, "fulfillmentMode").value,
    itemProfileId: field(card, "itemProfileId").value,
    msrpRecordId: field(card, "msrpRecordId").value,
    priceSource: field(card, "priceSource").value || (Number(field(card, "maxPrice").value) > 0 ? "manual" : ""),
    signalAutoOpen: field(card, "signalAutoOpen").checked,
    signalEntry: field(card, "signalEntry").value,
    enabled: field(card, "enabled").checked,
    checkoutPreflightApproved: existing?.checkoutPreflightApproved === true,
    checkoutPreflightCapturedAt: existing?.checkoutPreflightCapturedAt || ""
  };
}

async function finishEdit(card) {
  for (const input of card.querySelectorAll("input, select")) {
    if (!input.checkValidity()) {
      reportInvalid(input);
      return;
    }
  }
  const mission = collectMission(card);
  const existing = savedProducts();
  const products = editingId === "new"
    ? [...existing, mission]
    : existing.map((candidate) => (candidate.id === editingId ? mission : candidate));
  const saved = await runAction(
    () => saveMissionList(products),
    "Mission saved. The browser companion picks it up within a few seconds."
  );
  if (saved) {
    editingId = null;
    editCardNode = null;
    renderMissions();
    if (resumeAutopilotAfterEdit) {
      resumeAutopilotAfterEdit = false;
      await runAction(() => resumeAutopilot(), "Autopilot resumed.");
    }
  }
}

function updateNewMissionPriceDefaults(card) {
  const price = Number(field(card, "maxPrice").value);
  const quantity = Number(field(card, "quantity").value);
  const profile = ItemDefaults.itemProfileById(
    field(card, "itemProfileId").value,
    currentSnapshot?.settings?.itemProfiles || []
  );
  if (!profile || !Number.isFinite(price) || price <= 0 || !Number.isInteger(quantity) || quantity <= 0) return;
  const profileSettings = ItemDefaults.normalizeItemProfileSettings(profile.settings);
  if (["review", "checkout"].includes(field(card, "action").value)) {
    field(card, "maxOrderTotal").value = String(Math.round((price * quantity + profileSettings.maxOrderBuffer) * 100) / 100);
  }
  if (profileSettings.enabled) field(card, "enabled").checked = true;
}

async function startEdit(product, seed = null) {
  if (editingId) {
    setMessage("Finish the open mission editor first (Done or Cancel).", "error");
    return;
  }
  if (isArmed()) {
    const actionStopEpoch = stopUiEpoch;
    try {
      await pauseAutopilot();
      resumeAutopilotAfterEdit = actionStopEpoch === stopUiEpoch;
      if (resumeAutopilotAfterEdit) {
        setMessage("Autopilot paused while you edit — it resumes on Done.", "warn");
      }
    } catch (error) {
      setMessage(error.message || "Could not pause Autopilot.", "error");
      return;
    }
  }
  editingId = product ? product.id : "new";
  editCardNode = buildEditCard(product || seed, { isNew: !product });
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
}

function openBulkImportDialog() {
  if (editingId) {
    setMessage("Finish the open mission editor before importing URLs.", "error");
    return;
  }
  elements.bulkImportText.value = "";
  setBulkImportResult("");
  if (typeof elements.bulkImportDialog.showModal === "function") elements.bulkImportDialog.showModal();
  else elements.bulkImportDialog.setAttribute("open", "");
  elements.bulkImportText.focus();
}

function bulkImportSummaryText(summary = {}) {
  const parts = [];
  if (summary.imported) parts.push(`${summary.imported} imported with the default profile`);
  if (summary.ready) parts.push(`${summary.ready} ready with approved MSRP`);
  if (summary.needsPrice) parts.push(`${summary.needsPrice} left Off pending price approval`);
  if (summary.duplicates) parts.push(`${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped`);
  if (summary.invalid) parts.push(`${summary.invalid} invalid line${summary.invalid === 1 ? "" : "s"}`);
  if (summary.overCapacity) parts.push(`${summary.overCapacity} over the 50-mission limit`);
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

  const actionStopEpoch = stopUiEpoch;
  const wasArmed = isArmed();
  bulkImportInFlight = true;
  elements.bulkImportSubmitButton.disabled = true;
  elements.bulkImportCancelButton.disabled = true;
  setBulkImportResult("Validating and deduplicating URLs…");
  try {
    if (wasArmed) await pauseAutopilot();
    const result = await window.cartAssist.bulkImportMissions(text);
    render(result.snapshot);
    const summaryText = bulkImportSummaryText(result.summary);
    const issueText = (result.issues || []).map((issue) => `Line ${issue.line}: ${issue.reason}`).join(" ");
    if (result.summary?.imported > 0) {
      bulkImportInFlight = false;
      closeBulkImportDialog();
      if (wasArmed && actionStopEpoch === stopUiEpoch) await resumeAutopilot();
      setMessage(`${summaryText}. Review each imported mission before enabling it.`, "success");
      return;
    }
    setBulkImportResult(`${summaryText}${issueText ? ` ${issueText}` : ""}`, "error");
    if (wasArmed && actionStopEpoch === stopUiEpoch) await resumeAutopilot();
  } catch (error) {
    setBulkImportResult(error.message || "The URL import failed.", "error");
    if (wasArmed && actionStopEpoch === stopUiEpoch) {
      try {
        await resumeAutopilot();
      } catch {
        setMessage("Import failed and Autopilot could not be resumed. Review the header state.", "error");
      }
    }
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
    note.textContent = missionIds.has(item.id) ? "Already in Missions" : prepIds.has(item.id) ? "Prep monitor" : "listing only";
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
    ? `Add selected (${catalogSelectedIds.size}) to Missions`
    : "Add selected to Missions";
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
  elements.itemProfileAction.value = "checkout";
  elements.itemProfileFulfillment.value = "shipping";
  elements.itemProfileBuffer.value = "15";
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
  elements.itemProfileBuffer.value = String(profile.settings.maxOrderBuffer);
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
    button.title = profile.description || `${profile.settings.fulfillmentMode}, $${profile.settings.maxOrderBuffer.toFixed(2)} total allowance`;
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
    }, `${STORE_LABELS[suggestion.retailer]} ${money(suggestion.price)} approved as MSRP. Existing mission caps were not changed.`));
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

function renderBulkMissionDefaults(settings) {
  const currentIds = new Set(settings.products.map((product) => product.id));
  for (const id of [...bulkMissionSelectedIds]) if (!currentIds.has(id)) bulkMissionSelectedIds.delete(id);
  elements.bulkMissionList.replaceChildren(...settings.products.map((product) => {
    const label = document.createElement("label");
    label.className = "bulk-mission-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = bulkMissionSelectedIds.has(product.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) bulkMissionSelectedIds.add(product.id);
      else bulkMissionSelectedIds.delete(product.id);
      renderBulkMissionDefaults(currentSnapshot.settings);
    });
    const text = document.createElement("span");
    text.textContent = `${STORE_LABELS[product.retailer]} · ${productLabel(product)} · ${ACTION_LABELS[product.action]}`;
    label.append(checkbox, text);
    return label;
  }));
  if (!settings.products.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add missions before using bulk update.";
    elements.bulkMissionList.append(empty);
  }
  elements.applyBulkItemProfileButton.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.copySelectedMissionListButton.disabled = !bulkMissionSelectedIds.size;
  elements.bulkMissionOpenAt.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.scheduleCandidateMissionsButton.disabled = !bulkMissionSelectedIds.size || isArmed();
  elements.clearSelectedMissionSchedulesButton.disabled = isArmed() || !settings.products.some((product) => (
    bulkMissionSelectedIds.has(product.id) && product.openAt
  ));
  elements.bulkMissionSelectAllButton.disabled = !settings.products.length;
  elements.bulkMissionSelectNoneButton.disabled = !bulkMissionSelectedIds.size;
}

function renderItemDefaults(settings) {
  renderItemProfilePickers(settings);
  renderMsrpCatalog(settings);
  renderBulkMissionDefaults(settings);
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
    setMessage("Finish the open mission editor before importing catalog results.", "error");
    return;
  }
  if (isArmed()) {
    setMessage("Switch Autopilot off before adding catalog results to Missions.", "error");
    return;
  }
  const selectedIds = [...catalogSelectedIds];
  if (!selectedIds.length) return;
  catalogImportInFlight = true;
  renderCatalog(currentSnapshot?.catalog || {});
  try {
    const result = await window.cartAssist.addCatalogMissions(selectedIds, elements.catalogItemProfile.value);
    render(result.snapshot);
    const summary = result.summary || {};
    const extras = [];
    if (summary.duplicates) extras.push(`${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped`);
    if (summary.overCapacity) extras.push(`${summary.overCapacity} over the 50-mission limit`);
    if (summary.missing) extras.push(`${summary.missing} no longer available`);
    if (summary.ready) extras.push(`${summary.ready} ready with approved MSRP`);
    if (summary.needsPrice) extras.push(`${summary.needsPrice} left Off pending price approval`);
    setMessage(
      summary.imported
        ? `${summary.imported} catalog mission${summary.imported === 1 ? "" : "s"} added with the selected profile.${extras.length ? ` ${extras.join(" · ")}.` : ""}`
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

function renderMissions() {
  // While a mission editor is open, leave the list DOM alone: background
  // snapshot broadcasts must not steal focus from the person typing.
  if (editingId && editCardNode && elements.missionList.contains(editCardNode)) {
    updateWorstCase();
    return;
  }
  const statuses = currentSnapshot?.productStatuses || {};
  const cards = [];
  if (editingId === "new" && editCardNode) cards.push(editCardNode);
  for (const product of savedProducts()) {
    if (editingId === product.id && editCardNode) cards.push(editCardNode);
    else cards.push(buildViewCard(product, statuses[product.id] || defaultStatus()));
  }
  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state mission-empty";
    const line = document.createElement("p");
    line.textContent = "Watch or buy anything on Target, Walmart, or Amazon.";
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "button primary";
    cta.textContent = "+ Create your first mission";
    cta.addEventListener("click", () => startEdit(null));
    empty.append(line, cta);
    cards.push(empty);
  }
  elements.missionList.replaceChildren(...cards);
  updateWorstCase();
}

function updateStatusAges() {
  for (const age of elements.missionList.querySelectorAll(".status-age")) {
    age.textContent = relativeTime(age.dataset.at || "");
  }
}

// The hard ceiling: what everything hitting at once could cost.
function updateWorstCase() {
  const products = savedProducts();
  if (!products.length) {
    elements.worstCase.textContent = "";
    return;
  }
  let total = 0;
  let autoBuyCount = 0;
  for (const product of products) {
    if (!product.enabled) continue;
    if (product.action === "checkout") autoBuyCount += 1;
    if (product.action === "watch") continue;
    total += ["review", "checkout"].includes(product.action)
      ? Number(product.maxOrderTotal) || 0
      : (Number(product.maxPrice) || 0) * (Number(product.quantity) || 1);
  }
  const exposure = total > 0
    ? `Worst case if every enabled mission hits its cap: $${Math.round(total)}.`
    : "No spending exposure: only watch-only missions are enabled.";
  const liveNote = isArmed()
    ? autoBuyCount > 0
      ? ` Autopilot is ON — ${autoBuyCount} auto-buy mission${autoBuyCount === 1 ? "" : "s"} can place real orders.`
      : " Autopilot is ON."
    : "";
  elements.worstCase.textContent = `${exposure}${liveNote}`;
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
      hint: "Nothing from Chrome has reached this app yet. Click the Cart Confirm toolbar icon in Chrome (pin it via the puzzle-piece menu) and read its badge: IDLE/ARM = connected · OFF = Chrome cannot reach this app — close ALL other Cart Confirm/Electron processes (or reboot) and check antivirus/firewall web protection · UPD = reload the extension · PAIR = pairing issue. Also confirm the extension was loaded from the folder shown by “Show companion folder”."
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
    hint: "Extension loaded ✓ — now open (or reload) a Target, Walmart, or Amazon tab in the same Chrome profile. Product links opened by this app already go to Chrome."
  };
}

// --- Schedule agenda ---

function scheduledProducts(includeDisabled = false) {
  return savedProducts()
    .filter((product) => product.openAt && (includeDisabled || product.enabled))
    .map((product) => ({ ...product, openAtMs: new Date(product.openAt).getTime() }))
    .filter((product) => Number.isFinite(product.openAtMs))
    .sort((a, b) => a.openAtMs - b.openAtMs);
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
    ? `${productLabel(item)}: opening now`
    : `Next: ${productLabel(item)} in ${formatRemaining(remaining)}`;
}

function renderSchedule() {
  const items = scheduledProducts(true);
  elements.schedulePanel.hidden = items.length === 0;
  if (!items.length) return;
  const enabledCount = items.filter((item) => item.enabled).length;
  elements.scheduleCoverage.textContent = `${enabledCount}/${items.length} enabled`;
  elements.enableScheduledButton.hidden = enabledCount === items.length;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = dayStart.getTime();
  const cells = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const start = weekStart + dayOffset * 86_400_000;
    const end = start + 86_400_000;
    const cell = document.createElement("div");
    cell.className = dayOffset === 0 ? "schedule-day today" : "schedule-day";
    const head = document.createElement("span");
    head.className = "day-head";
    head.textContent = new Date(start).toLocaleDateString([], { weekday: "short", day: "numeric" });
    cell.append(head);
    for (const item of items.filter((candidate) => candidate.openAtMs >= start && candidate.openAtMs < end)) {
      const chip = document.createElement("span");
      chip.className = item.enabled ? "schedule-chip" : "schedule-chip off";
      chip.dataset.retailer = item.retailer;
      chip.textContent = `${new Date(item.openAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${productLabel(item)}`;
      chip.title = `${STORE_LABELS[item.retailer]} · ${productLabel(item)} — click to ${item.enabled ? "disable" : "enable"}`;
      chip.addEventListener("click", () => {
        void runAction(
          () => setMissionsEnabled(new Map([[item.id, !item.enabled]])),
          `${productLabel(item)} ${item.enabled ? "disabled" : "enabled"}.`
        );
      });
      cell.append(chip);
    }
    cells.push(cell);
  }
  const later = items.filter((item) => item.openAtMs >= weekStart + 7 * 86_400_000);
  if (later.length) {
    const div = document.createElement("div");
    div.className = "schedule-later";
    div.textContent = `Later: ${later.map((item) => (
      `${productLabel(item)} — ${new Date(item.openAtMs).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
    )).join(" · ")}`;
    cells.push(div);
  }
  elements.scheduleWeek.replaceChildren(...cells);
  updateScheduleNext();
}

// --- Loud alarm for alert-level "alarm" missions (throttled per mission) ---

const ALARM_EVENT_TYPES = new Set(["offer-observed", "cart-item-confirmed", "review-ready", "order-confirmed"]);
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
    elements.eventFilterButton.textContent = `Showing ${productTitle(eventFilterProductId) || "one mission"} — show all`;
  }
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = eventFilterProductId ? "No events for this mission yet." : "No events yet.";
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
    ...ItemDefaults.applyItemProfile(seed, profile, currentSnapshot?.settings?.msrpCatalog || []),
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
      ? "Direct entry requires a desired mission, Autopilot ON, a signal under two minutes old and under its cap, plus Amazon.com seller proof for Amazon."
      : "Uses the sanitized exact-SKU link; the browser still re-verifies every purchase condition.";
    button.addEventListener("click", () => void runAction(
      () => window.cartAssist.openSignal(signal.id, entry),
      (result) => result?.directFallback
        ? "Browser context was unavailable, so the canonical product page opened safely instead."
        : `${label} opened with durable mission context.`
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

  populateSettingsInputs(settings);
  renderConfigurationProfiles(settings);
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;

  renderMissions();
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
  setMissionOpenBusy(true);
  try {
    await runAction(async () => {
      if (!currentSnapshot) throw new Error("Settings have not loaded yet.");
      if (editingId) throw new Error("Finish the open mission editor first (Done or Cancel).");
      const saved = currentSnapshot.settings;
      if (saved.automationEnabled) {
        const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: false });
        render(next);
        return { armed: false };
      }
      const autoSubmitCount = [...saved.products, ...(saved.walmartPrepCandidates || [])]
        .filter((product) => product.enabled && product.action === "checkout").length;
      if (
        autoSubmitCount > 0
        && !window.confirm(`${autoSubmitCount} enabled mission${autoSubmitCount === 1 ? "" : "s"} may submit a real order. Re-arming starts a new run. Unscheduled Target and Walmart missions start as quiet background watchers and open Chrome only after a likely stock signal; Amazon must open now. Scheduled missions wait for their exact time. Verify retailer order history first. "Prepare checkout, I submit" is safer. Switch Autopilot on anyway?`)
      ) {
        throw new Error("Autopilot was not switched on.");
      }
      const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
      render(next);
      setMessage("Autopilot ON. Starting Target/Walmart background watchers and Walmart prep monitors; opening only missions that require a browser now…");
      try {
        const launch = await window.cartAssist.openBuyList({ backgroundFirst: true });
        return { armed: true, ...launch };
      } catch (error) {
        throw new Error(`Autopilot is ON, but its watchers or required browser pages could not start: ${error.message || "unknown opening error"}`);
      }
    }, (result) => {
      if (!result?.armed) return "Autopilot OFF. Monitoring pages stay open, but nothing will be clicked.";
      const count = Number(result.count || 0);
      const background = Number(result.background || 0);
      const scheduled = Number(result.scheduled || 0);
      const prepMonitoring = Number(result.prepMonitoring || 0);
      const parts = ["Autopilot ON"];
      if (background) {
        parts.push(`${background} Target/Walmart watcher${background === 1 ? "" : "s"} armed background-first`);
      }
      if (count) parts.push(`${count} browser-required mission page${count === 1 ? "" : "s"} opened`);
      if (!background && !count && !scheduled && !prepMonitoring) parts.push("no due missions needed a browser page");
      if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
      if (result.deduped) parts.push(`${result.deduped} already queued`);
      if (scheduled) parts.push(`${scheduled} waiting for ${scheduled === 1 ? "its" : "their"} calendar time`);
      if (prepMonitoring) parts.push(`${prepMonitoring} Walmart prep candidate${prepMonitoring === 1 ? "" : "s"} monitoring public-page changes`);
      const browserNote = result.defaultBrowser
        ? " Chrome was not found, so some pages used your default browser; Autopilot only works inside Chrome."
        : "";
      return `${parts.join(", ")}. A likely stock signal opens Chrome for authoritative validation and the configured action. Review missions remain on checkout review; a successful auto-submit remains on Target's confirmation page.${browserNote}`;
    });
  } finally {
    setMissionOpenBusy(false);
  }
});

elements.disarmButton.addEventListener("click", () => {
  stopUiEpoch += 1;
  resumeAutopilotAfterEdit = false;
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  return runAction(async () => {
    silenceAlarm();
    elements.digestBar.hidden = true;
    const next = await window.cartAssist.stopAll();
    render(next);
    return next;
  }, "Stopped. Autopilot off, all monitoring paused, queued page openings cancelled, and scheduled times cleared.");
});

elements.newMissionButton.addEventListener("click", () => void startEdit(null));
elements.bulkImportButton.addEventListener("click", openBulkImportDialog);
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
      description: "Custom reusable mission defaults.",
      settings: {
        quantity: elements.itemProfileQuantity.value,
        action: elements.itemProfileAction.value,
        fulfillmentMode: elements.itemProfileFulfillment.value,
        alertLevel: elements.itemProfileAlert.value,
        signalAutoOpen: true,
        enabled: elements.itemProfileEnabled.checked,
        maxOrderBuffer: elements.itemProfileBuffer.value
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
    const next = await window.cartAssist.saveSettings({ ...currentSnapshot.settings, itemProfiles: profiles });
    render(next);
    fillItemProfileForm(profile);
    renderItemProfilePickers(next.settings);
    return profile.name;
  }, (name) => `${name} item profile saved.`);
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
  for (const product of savedProducts()) bulkMissionSelectedIds.add(product.id);
  renderBulkMissionDefaults(currentSnapshot.settings);
});
elements.bulkMissionSelectNoneButton.addEventListener("click", () => {
  bulkMissionSelectedIds.clear();
  renderBulkMissionDefaults(currentSnapshot.settings);
});
elements.copySelectedMissionListButton.addEventListener("click", () => void runAction(
  () => window.cartAssist.copyMissionList([...bulkMissionSelectedIds]),
  ({ count }) => `${count} selected mission${count === 1 ? "" : "s"} copied as a consolidated list.`
));
elements.applyBulkItemProfileButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before bulk updating missions.");
  const profile = ItemDefaults.itemProfileById(elements.bulkItemProfile.value, currentSnapshot.settings.itemProfiles);
  if (!profile) throw new Error("Choose an item profile.");
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(product.id)
      ? ItemDefaults.applyItemProfile(product, profile, currentSnapshot.settings.msrpCatalog)
      : product
  ));
  const ready = products.filter((product) => bulkMissionSelectedIds.has(product.id) && product.enabled).length;
  const next = await window.cartAssist.saveSettings({ ...currentSnapshot.settings, products });
  render(next);
  return { selected: bulkMissionSelectedIds.size, ready };
}, ({ selected, ready }) => `${selected} mission${selected === 1 ? "" : "s"} updated; ${ready} now On with positive caps.`));

elements.scheduleCandidateMissionsButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before scheduling missions.");
  if (!bulkMissionSelectedIds.size) throw new Error("Select at least one mission first.");
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
    bulkMissionSelectedIds.has(product.id) ? { ...product, openAt: openAt.toISOString() } : product
  ));
  selectedConfigurationProfileId = profile.id;
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    ...profile.configuration,
    products
  });
  render(next);
  return { count: bulkMissionSelectedIds.size, openAt: openAt.toISOString() };
}, ({ count, openAt }) => (
  `${count} candidate mission${count === 1 ? "" : "s"} scheduled for ${new Date(openAt).toLocaleString()}; the bounded 15-minute candidate setup is active.`
)));

elements.clearSelectedMissionSchedulesButton.addEventListener("click", () => void runAction(async () => {
  if (isArmed()) throw new Error("Switch Autopilot off before clearing schedules.");
  const products = savedProducts().map((product) => (
    bulkMissionSelectedIds.has(product.id) ? { ...product, openAt: "" } : product
  ));
  const cleared = savedProducts().filter((product) => bulkMissionSelectedIds.has(product.id) && product.openAt).length;
  const next = await window.cartAssist.saveSettings({ ...currentSnapshot.settings, products });
  render(next);
  return cleared;
}, (cleared) => `${cleared} selected mission schedule${cleared === 1 ? "" : "s"} cleared.`));

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
  const from = products.findIndex((candidate) => candidate.id === sourceId);
  if (from === -1) return;
  const targetId = event.target instanceof Element
    ? event.target.closest(".mission-card")?.dataset.productId
    : "";
  const [moved] = products.splice(from, 1);
  let to = products.length;
  if (targetId && targetId !== sourceId) {
    const targetIndex = products.findIndex((candidate) => candidate.id === targetId);
    if (targetIndex !== -1) to = targetIndex;
  }
  products.splice(to, 0, moved);
  void runAction(() => saveMissionList(products), "Missions reordered.");
});

function setMissionOpenBusy(busy) {
  openRunInFlight = busy;
  elements.autopilotToggle.disabled = busy;
  elements.testButton.disabled = busy;
  elements.openAllButton.disabled = busy;
}

elements.testButton.addEventListener("click", async () => {
  if (openRunInFlight) return;
  setMissionOpenBusy(true);
  setMessage("Checking every due enabled mission… same-store pages are paced for safety.");
  try {
    await runAction(async () => {
      if (isArmed()) {
        throw new Error("Switch Autopilot off before testing — Test all opens mission pages without buying anything.");
      }
      return window.cartAssist.testEvent();
    }, (result) => {
      const count = Number(result?.count || 0);
      const parts = [`Test started for ${count} enabled mission${count === 1 ? "" : "s"}`];
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
  setMessage("Opening due enabled missions… multiple opens are paced to respect store limits.");
  try {
    const result = await window.cartAssist.openBuyList();
    if (actionStopEpoch !== stopUiEpoch) return;
    const parts = [`${result.count} mission page${result.count === 1 ? "" : "s"} opened`];
    if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
    if (result.deduped) parts.push(`${result.deduped} already queued`);
    if (result.scheduled) parts.push(`${result.scheduled} waiting for ${result.scheduled === 1 ? "its" : "their"} calendar time`);
    const armNote = result.armed
      ? "Autopilot is ON — missions act as each page loads."
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
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    ...ConfigProfiles.normalizeConfiguration(profile.configuration)
  });
  render(next);
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

elements.clearEventsButton.addEventListener("click", () => runAction(async () => {
  const next = await window.cartAssist.clearEvents();
  render(next);
}, "Feed cleared."));

elements.enableScheduledButton.addEventListener("click", () => {
  const updates = new Map(
    scheduledProducts(true).filter((item) => !item.enabled).map((item) => [item.id, true])
  );
  if (!updates.size) return;
  void runAction(
    () => setMissionsEnabled(updates),
    `${updates.size} scheduled mission${updates.size === 1 ? "" : "s"} enabled.`
  );
});

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
  const reviews = count((event) => event.eventType === "review-ready");
  const sightings = count((event) => event.eventType === "offer-observed" && event.eligible === true);
  const blocks = count((event) => ["automation-blocked", "store-error"].includes(event.eventType));
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
elements.eventFilterButton.addEventListener("click", () => {
  eventFilterProductId = null;
  renderEvents(currentSnapshot?.events || []);
});

window.cartAssist.onUpdate((snapshot) => render(snapshot));
setInterval(() => {
  updateScheduleNext();
  updateStatusAges();
}, 1000);

window.cartAssist.getSnapshot()
  .then((snapshot) => render(snapshot))
  .catch((error) => setMessage(error.message || "Unable to load the app.", "error"));
