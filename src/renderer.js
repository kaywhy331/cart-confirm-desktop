"use strict";

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
  testButton: document.getElementById("testButton"),
  openAllButton: document.getElementById("openAllButton"),
  worstCase: document.getElementById("worstCase"),
  settingsBox: document.getElementById("settingsBox"),
  fastMode: document.getElementById("fastMode"),
  watcherIntervalSeconds: document.getElementById("watcherIntervalSeconds"),
  retryIntervalSeconds: document.getElementById("retryIntervalSeconds"),
  eligibilityRefreshIntervalSeconds: document.getElementById("eligibilityRefreshIntervalSeconds"),
  blitzRetryDelayMs: document.getElementById("blitzRetryDelayMs"),
  blitzWindowSeconds: document.getElementById("blitzWindowSeconds"),
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
let eventFilterProductId = null;
let bulkImportInFlight = false;
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
    storeNavigationIntervalSeconds: Number(elements.storeNavigationIntervalSeconds.value),
    overloadCooldownSeconds: Number(elements.overloadCooldownSeconds.value),
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
  const autoSubmitCount = saved.products.filter((product) => product.enabled && product.action === "checkout").length;
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

function buildEditCard(product) {
  const card = elements.missionEditTemplate.content.firstElementChild.cloneNode(true);
  const retailer = product?.retailer || "target";
  field(card, "retailer").value = retailer;
  field(card, "title").value = product?.title || "";
  field(card, "productUrl").value = product?.productUrl || "";
  field(card, "sku").value = product?.sku || "";
  field(card, "maxPrice").value = product ? String(Number(product.maxPrice || 0)) : "";
  field(card, "maxOrderTotal").value = String(Number(product?.maxOrderTotal || 0));
  field(card, "quantity").value = product?.quantity || 1;
  field(card, "action").value = product?.action || "watch";
  field(card, "alertLevel").value = product?.alertLevel || "standard";
  field(card, "fulfillmentMode").value = product?.fulfillmentMode || "manual";
  field(card, "signalEntry").value = product?.signalEntry || "product";
  field(card, "signalAutoOpen").checked = product ? product.signalAutoOpen !== false : true;
  field(card, "openAt").value = toLocalInputValue(product?.openAt);
  field(card, "enabled").checked = product ? product.enabled !== false : true;
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
    signalAutoOpen: field(card, "signalAutoOpen").checked,
    signalEntry: field(card, "signalEntry").value,
    enabled: field(card, "enabled").checked
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
  editCardNode = buildEditCard(product || seed);
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
  if (summary.imported) parts.push(`${summary.imported} imported Off for review`);
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
      hint: `Chrome has companion v${hello.version} but this app is v${appVersion}. In chrome://extensions, click the reload arrow on the Cart Confirm Companion card.`
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
  return {
    retailer: signal.retailer,
    title: signal.title || `${STORE_LABELS[signal.retailer]} ${signal.sku}`,
    productUrl: signal.productUrl,
    sku: signal.sku,
    maxPrice: Number.isFinite(price) && price > 0 ? price : 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "watch",
    alertLevel: "standard",
    fulfillmentMode: "manual",
    signalAutoOpen: true,
    signalEntry: "product",
    openAt: "",
    enabled: true
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
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;

  renderMissions();
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
      const autoSubmitCount = saved.products.filter((product) => product.enabled && product.action === "checkout").length;
      if (
        autoSubmitCount > 0
        && !window.confirm(`${autoSubmitCount} enabled mission${autoSubmitCount === 1 ? "" : "s"} may submit a real order. Re-arming starts a new run. Unscheduled Target and Walmart missions start as quiet background watchers and open Chrome only after a likely stock signal; Amazon must open now. Scheduled missions wait for their exact time. Verify retailer order history first. "Prepare checkout, I submit" is safer. Switch Autopilot on anyway?`)
      ) {
        throw new Error("Autopilot was not switched on.");
      }
      const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
      render(next);
      setMessage("Autopilot ON. Starting Target and Walmart background watchers; opening only missions that require a browser now…");
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
      const parts = ["Autopilot ON"];
      if (background) {
        parts.push(`${background} Target/Walmart watcher${background === 1 ? "" : "s"} armed background-first`);
      }
      if (count) parts.push(`${count} browser-required mission page${count === 1 ? "" : "s"} opened`);
      if (!background && !count && !scheduled) parts.push("no due missions needed a browser page");
      if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
      if (result.deduped) parts.push(`${result.deduped} already queued`);
      if (scheduled) parts.push(`${scheduled} waiting for ${scheduled === 1 ? "its" : "their"} calendar time`);
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
elements.storeNavigationIntervalSeconds.addEventListener("change", scheduleSettingsSave);
elements.overloadCooldownSeconds.addEventListener("change", scheduleSettingsSave);

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
