"use strict";

const elements = {
  autopilotToggle: document.getElementById("autopilotToggle"),
  autopilotState: document.getElementById("autopilotState"),
  disarmButton: document.getElementById("disarmButton"),
  connectionPill: document.getElementById("connectionPill"),
  connectionText: document.getElementById("connectionText"),
  boundaryBanner: document.getElementById("boundaryBanner"),
  boundaryText: document.getElementById("boundaryText"),
  alarmBar: document.getElementById("alarmBar"),
  alarmText: document.getElementById("alarmText"),
  silenceAlarmButton: document.getElementById("silenceAlarmButton"),
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
  testButton: document.getElementById("testButton"),
  openAllButton: document.getElementById("openAllButton"),
  worstCase: document.getElementById("worstCase"),
  settingsBox: document.getElementById("settingsBox"),
  fastMode: document.getElementById("fastMode"),
  retryIntervalSeconds: document.getElementById("retryIntervalSeconds"),
  storeNavigationIntervalSeconds: document.getElementById("storeNavigationIntervalSeconds"),
  overloadCooldownSeconds: document.getElementById("overloadCooldownSeconds"),
  storeShortcut: document.getElementById("storeShortcut"),
  openCartButton: document.getElementById("openCartButton"),
  openOrdersButton: document.getElementById("openOrdersButton"),
  scheduleNext: document.getElementById("scheduleNext"),
  scheduleWeek: document.getElementById("scheduleWeek"),
  latestMessage: document.getElementById("latestMessage"),
  latestTime: document.getElementById("latestTime"),
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
  "attempt-budget-exhausted",
  "run-expired",
  "unmatched-product"
]);

let currentSnapshot = null;
let messageTimer = null;
let openRunInFlight = false;
let editingId = null; // null | product id | "new"
let editCardNode = null;
let settingsSaveTimer = null;
let eventFilterProductId = null;
let lastAlarmEventStamp = "";
const alarmLastFiredAt = new Map();
let alarmAudio = null;
let alarmBeepInterval = null;
let alarmStopTimer = null;

// --- Small helpers ---

function setMessage(text, kind = "") {
  clearTimeout(messageTimer);
  elements.message.textContent = text;
  elements.message.className = `message ${kind}`.trim();
  if (text) {
    messageTimer = setTimeout(() => {
      elements.message.textContent = "";
      elements.message.className = "message";
    }, 9000);
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
  try {
    const result = await action();
    const text = typeof successMessage === "function" ? successMessage(result) : successMessage;
    setMessage(text, "success");
    return result;
  } catch (error) {
    setMessage(error.message || "The action failed.", "error");
    return null;
  }
}

// --- Saving ---

function globalSettings(products) {
  return {
    products,
    automationEnabled: isArmed(),
    fastMode: elements.fastMode.checked,
    retryIntervalSeconds: Number(elements.retryIntervalSeconds.value),
    storeNavigationIntervalSeconds: Number(elements.storeNavigationIntervalSeconds.value),
    overloadCooldownSeconds: Number(elements.overloadCooldownSeconds.value),
    scheduledOpenEnabled: false,
    scheduledRetailer: currentSnapshot?.settings?.scheduledRetailer || "target",
    scheduledOpenAt: ""
  };
}

async function saveMissionList(products) {
  const next = await window.cartAssist.saveSettings(globalSettings(products));
  render(next);
  return next;
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
  view(card, "enabled").disabled = isArmed();
  view(card, "store").textContent = STORE_LABELS[product.retailer];
  view(card, "title").textContent = productLabel(product);

  const subParts = [`$${Math.round(product.maxPrice)} cap`, `×${product.quantity}`];
  if (["review", "checkout"].includes(product.action)) subParts.push(`total cap $${Math.round(product.maxOrderTotal)}`);
  if (product.openAt) {
    subParts.push(`opens ${new Date(product.openAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
  }
  if (product.alertLevel === "alarm") subParts.push("🔔 alarm");
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
  editButton.disabled = armedNow;
  removeButton.disabled = armedNow;
  if (armedNow) {
    editButton.title = "Switch Autopilot off to edit";
    removeButton.title = "Switch Autopilot off to remove";
  }

  card.querySelector(".mission-open").addEventListener("click", () => {
    void runAction(
      () => window.cartAssist.openProduct(product.id),
      (result) => (result?.via === "companion-tab"
        ? `${productLabel(product)} opened in your existing Chrome tab.`
        : `${productLabel(product)} page opened in Chrome.`)
    );
  });
  editButton.addEventListener("click", () => startEdit(product));
  removeButton.addEventListener("click", () => {
    if (savedProducts().length <= 1) {
      setMessage("Keep at least one mission in the list.", "error");
      return;
    }
    if (!window.confirm(`Remove "${productLabel(product)}"?`)) return;
    void runAction(
      () => saveMissionList(savedProducts().filter((candidate) => candidate.id !== product.id)),
      `${productLabel(product)} removed.`
    );
  });
  view(card, "enabled").addEventListener("change", (event) => {
    const enabled = event.target.checked;
    void runAction(
      () => saveMissionList(savedProducts().map((candidate) => (
        candidate.id === product.id ? { ...candidate, enabled } : candidate
      ))),
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
  field(card, "maxPrice").value = product ? String(Math.round(Number(product.maxPrice || 0))) : "";
  field(card, "maxOrderTotal").value = String(Math.round(Number(product?.maxOrderTotal || 0)));
  field(card, "quantity").value = product?.quantity || 1;
  field(card, "action").value = product?.action || "watch";
  field(card, "alertLevel").value = product?.alertLevel || "standard";
  field(card, "fulfillmentMode").value = product?.fulfillmentMode || "manual";
  field(card, "openAt").value = toLocalInputValue(product?.openAt);
  field(card, "enabled").checked = product ? product.enabled !== false : true;
  updateEditStore(card);

  const advanced = card.querySelector(".advanced-fields");
  advanced.open = Boolean(product && (["review", "checkout"].includes(product.action) || Number(product.maxOrderTotal) > 0));

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
  });

  card.querySelector(".mission-done").addEventListener("click", () => void finishEdit(card));
  card.querySelector(".mission-cancel").addEventListener("click", () => {
    editingId = null;
    editCardNode = null;
    renderMissions();
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
  }
}

function startEdit(product) {
  if (isArmed()) {
    setMessage("Switch Autopilot off before editing missions.", "error");
    return;
  }
  if (editingId) {
    setMessage("Finish the open mission editor first (Done or Cancel).", "error");
    return;
  }
  editingId = product ? product.id : "new";
  editCardNode = buildEditCard(product);
  renderMissions();
  editCardNode.querySelector("[data-field='productUrl']").focus();
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
  for (const product of savedProducts()) {
    if (editingId === product.id && editCardNode) cards.push(editCardNode);
    else cards.push(buildViewCard(product, statuses[product.id] || defaultStatus()));
  }
  if (editingId === "new" && editCardNode) cards.push(editCardNode);
  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No missions yet. Click + New mission, paste a product link, and set your price cap.";
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
  let total = 0;
  for (const product of savedProducts()) {
    if (!product.enabled || product.action === "watch") continue;
    total += ["review", "checkout"].includes(product.action)
      ? Number(product.maxOrderTotal) || 0
      : (Number(product.maxPrice) || 0) * (Number(product.quantity) || 1);
  }
  elements.worstCase.textContent = total > 0
    ? `Worst case if every enabled mission hits its cap: $${Math.round(total)}. Automation can never exceed the caps you set.`
    : "No spending exposure: only watch-only missions are enabled.";
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

function scheduledProducts() {
  return savedProducts()
    .filter((product) => product.enabled && product.openAt)
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
  const items = scheduledProducts();
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
      chip.className = "schedule-chip";
      chip.dataset.retailer = item.retailer;
      chip.textContent = `${new Date(item.openAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${productLabel(item)}`;
      chip.title = `${STORE_LABELS[item.retailer]} · ${productLabel(item)}`;
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
  if (events.length && events[0].timestamp) lastAlarmEventStamp = events[0].timestamp;
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

// --- Top-level render ---

function populateSettingsInputs(settings) {
  const map = [
    [elements.retryIntervalSeconds, settings.retryIntervalSeconds],
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
  elements.autopilotToggle.classList.toggle("on", armed);
  elements.autopilotState.textContent = armed ? "ON" : "OFF";
  elements.boundaryBanner.classList.toggle("armed", armed);
  elements.boundaryBanner.querySelector("strong").textContent = armed
    ? "Autopilot is ON."
    : "Autopilot is OFF.";
  const checkoutCount = settings.products.filter((product) => product.enabled && product.action === "checkout").length;
  elements.boundaryText.textContent = armed
    ? `${checkoutCount} auto-buy mission${checkoutCount === 1 ? "" : "s"} may place a real order. Missions act whenever their product pages are open in Chrome.`
    : "Nothing is added to any cart until you switch Autopilot on.";

  populateSettingsInputs(settings);
  elements.latestMessage.textContent = status.lastMessage || "Waiting for the browser companion.";
  elements.latestTime.textContent = formatDateTime(status.lastEventAt);
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;

  renderMissions();
  checkForAlarmEvents(events);
  renderEvents(events);
  renderSchedule();
}

// --- Actions ---

elements.autopilotToggle.addEventListener("click", () => runAction(async () => {
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
    && !window.confirm(`${autoSubmitCount} enabled mission${autoSubmitCount === 1 ? "" : "s"} may submit a real order. Re-arming starts a new run and can retry an item whose prior submission was uncertain. Verify retailer order history first. "Prepare checkout, I submit" is safer. Switch Autopilot on anyway?`)
  ) {
    throw new Error("Autopilot was not switched on.");
  }
  const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
  render(next);
  return { armed: true };
}, (result) => (result?.armed
  ? "Autopilot ON. Missions act whenever their product pages are open — use Open all enabled to launch them."
  : "Autopilot OFF. Monitoring pages stay open, but nothing will be clicked.")));

elements.disarmButton.addEventListener("click", () => runAction(async () => {
  const next = await window.cartAssist.stopAll();
  render(next);
}, "Stopped. Autopilot off, queued page openings cancelled, and scheduled times cleared."));

elements.newMissionButton.addEventListener("click", () => startEdit(null));

elements.testButton.addEventListener("click", () => runAction(async () => {
  if (isArmed()) {
    throw new Error("Switch Autopilot off before testing — Test opens the product page without buying anything.");
  }
  await window.cartAssist.testEvent();
  return window.cartAssist.openProduct();
}, (result) => (result?.via === "companion-tab"
  ? "Test started in your existing Chrome tab. Watch the mission row and feed — nothing is added while Autopilot is off."
  : result?.via === "default-browser"
    ? "Test page opened, but Chrome was not found — it used your default browser, where the companion cannot see it. Install Chrome or open the link in Chrome manually."
    : "Test started: the product page is opening in Chrome. Watch the mission row and feed — nothing is added while Autopilot is off.")));

elements.openAllButton.addEventListener("click", async () => {
  if (openRunInFlight) return;
  openRunInFlight = true;
  elements.openAllButton.disabled = true;
  setMessage("Opening enabled missions… multiple opens are paced to respect store limits.");
  try {
    const result = await window.cartAssist.openBuyList();
    const parts = [`${result.count} mission page${result.count === 1 ? "" : "s"} opened`];
    if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
    if (result.deduped) parts.push(`${result.deduped} already queued`);
    const armNote = result.armed
      ? "Autopilot is ON — missions act as each page loads."
      : "Autopilot is OFF — nothing will be added until you switch it on.";
    const browserNote = result.defaultBrowser
      ? " Chrome was not found, so your default browser was used — the companion only works inside Chrome."
      : "";
    setMessage(`${parts.join(", ")}. ${armNote}${browserNote}`, result.defaultBrowser ? "error" : result.armed ? "success" : "warn");
  } catch (error) {
    setMessage(error.message || "The action failed.", "error");
  } finally {
    openRunInFlight = false;
    elements.openAllButton.disabled = false;
  }
});

function scheduleSettingsSave() {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    for (const input of [
      elements.retryIntervalSeconds,
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
elements.retryIntervalSeconds.addEventListener("change", scheduleSettingsSave);
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
