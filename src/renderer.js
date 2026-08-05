"use strict";

const elements = {
  automationEnabled: document.getElementById("automationEnabled"),
  fastMode: document.getElementById("fastMode"),
  retryIntervalSeconds: document.getElementById("retryIntervalSeconds"),
  storeNavigationIntervalSeconds: document.getElementById("storeNavigationIntervalSeconds"),
  overloadCooldownSeconds: document.getElementById("overloadCooldownSeconds"),
  scheduledOpenEnabled: document.getElementById("scheduledOpenEnabled"),
  scheduledRetailer: document.getElementById("scheduledRetailer"),
  scheduledOpenAt: document.getElementById("scheduledOpenAt"),
  countdown: document.getElementById("countdown"),
  productList: document.getElementById("productList"),
  productRowTemplate: document.getElementById("productRowTemplate"),
  productStatusList: document.getElementById("productStatusList"),
  addProductButton: document.getElementById("addProductButton"),
  saveButton: document.getElementById("saveButton"),
  openBuyListButton: document.getElementById("openBuyListButton"),
  disarmButton: document.getElementById("disarmButton"),
  storeShortcut: document.getElementById("storeShortcut"),
  openCartButton: document.getElementById("openCartButton"),
  openOrdersButton: document.getElementById("openOrdersButton"),
  showExtensionButton: document.getElementById("showExtensionButton"),
  copyExtensionButton: document.getElementById("copyExtensionButton"),
  clearEventsButton: document.getElementById("clearEventsButton"),
  testButton: document.getElementById("testButton"),
  connectionPill: document.getElementById("connectionPill"),
  connectionText: document.getElementById("connectionText"),
  boundaryBanner: document.getElementById("boundaryBanner"),
  boundaryText: document.getElementById("boundaryText"),
  latestMessage: document.getElementById("latestMessage"),
  latestTime: document.getElementById("latestTime"),
  eventList: document.getElementById("eventList"),
  portBadge: document.getElementById("portBadge"),
  message: document.getElementById("message"),
  versionText: document.getElementById("versionText")
};

const STORE_LABELS = Object.freeze({ target: "Target", walmart: "Walmart", amazon: "Amazon" });
const SKU_LABELS = Object.freeze({ target: "TCIN", walmart: "Walmart item ID", amazon: "ASIN" });
const BLOCKING_REASONS = new Set([
  "cart-unverified",
  "manual-action-required",
  "over-price",
  "over-total",
  "price-unavailable",
  "quantity-unavailable",
  "seller-unverified",
  "store-error",
  "third-party",
  "total-unavailable",
  "traffic-overload",
  "unmatched-product"
]);
let currentSnapshot = null;
let messageTimer = null;

function setMessage(text, kind = "") {
  clearTimeout(messageTimer);
  elements.message.textContent = text;
  elements.message.className = `message ${kind}`.trim();
  if (text) {
    messageTimer = setTimeout(() => {
      elements.message.textContent = "";
      elements.message.className = "message";
    }, 7000);
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
  return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : "Not observed";
}

function eventName(type) {
  return String(type || "event")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function field(row, name) {
  return row.querySelector(`[data-field="${name}"]`);
}

function updateRowStore(row) {
  const retailer = field(row, "retailer").value;
  row.dataset.retailer = retailer;
  row.querySelector(".sku-label").textContent = SKU_LABELS[retailer];
  const skuInput = field(row, "sku");
  skuInput.placeholder = retailer === "amazon" ? "B0ABC12345" : "Digits only";
  skuInput.inputMode = retailer === "amazon" ? "text" : "numeric";
}

function markIdentityDirty(row) {
  row.dataset.productId = "";
  const openButton = row.querySelector(".open-product-row");
  openButton.disabled = true;
  openButton.title = "Save this product before opening it.";
}

function createProductRow(product = {}) {
  const row = elements.productRowTemplate.content.firstElementChild.cloneNode(true);
  const retailer = product.retailer || "target";
  row.dataset.productId = product.id || "";
  field(row, "retailer").value = retailer;
  field(row, "productUrl").value = product.productUrl || "";
  field(row, "sku").value = product.sku || "";
  field(row, "maxPrice").value = Number(product.maxPrice || 0).toFixed(2);
  field(row, "maxOrderTotal").value = Number(product.maxOrderTotal || 0).toFixed(2);
  field(row, "quantity").value = product.quantity || 1;
  field(row, "action").value = product.action || "cart";
  field(row, "enabled").checked = product.enabled !== false;
  updateRowStore(row);

  const openButton = row.querySelector(".open-product-row");
  openButton.disabled = !row.dataset.productId;
  openButton.title = row.dataset.productId ? "Open this saved product." : "Save this product before opening it.";

  field(row, "retailer").addEventListener("change", () => {
    updateRowStore(row);
    markIdentityDirty(row);
  });
  field(row, "productUrl").addEventListener("change", () => {
    const detected = detectRetailer(field(row, "productUrl").value);
    if (detected) {
      field(row, "retailer").value = detected;
      updateRowStore(row);
      if (!field(row, "sku").value.trim()) {
        field(row, "sku").value = extractSku(detected, field(row, "productUrl").value);
      }
    }
    markIdentityDirty(row);
  });
  field(row, "sku").addEventListener("change", () => {
    if (field(row, "retailer").value === "amazon") {
      field(row, "sku").value = field(row, "sku").value.trim().toUpperCase();
    }
    markIdentityDirty(row);
  });
  field(row, "action").addEventListener("change", updateBoundary);
  field(row, "enabled").addEventListener("change", updateBoundary);

  openButton.addEventListener("click", () => {
    if (!row.dataset.productId) {
      setMessage("Save this product before opening it.", "error");
      return;
    }
    void runAction(
      () => window.cartAssist.openProduct(row.dataset.productId),
      `${STORE_LABELS[field(row, "retailer").value]} product opened in your default browser.`
    );
  });

  row.querySelector(".remove-product-row").addEventListener("click", () => {
    if (elements.productList.childElementCount <= 1) {
      setMessage("The buy list must contain at least one product.", "error");
      return;
    }
    row.remove();
    updateBoundary();
  });

  return row;
}

function populateForm(settings) {
  elements.automationEnabled.checked = settings.automationEnabled;
  elements.fastMode.checked = settings.fastMode;
  elements.retryIntervalSeconds.value = settings.retryIntervalSeconds;
  elements.storeNavigationIntervalSeconds.value = settings.storeNavigationIntervalSeconds;
  elements.overloadCooldownSeconds.value = settings.overloadCooldownSeconds;
  elements.scheduledOpenEnabled.checked = settings.scheduledOpenEnabled;
  elements.scheduledRetailer.value = settings.scheduledRetailer || "target";
  elements.scheduledOpenAt.value = toLocalInputValue(settings.scheduledOpenAt);
  elements.productList.replaceChildren(...settings.products.map(createProductRow));
  updateScheduleControls();
  updateBoundary();
}

function collectProducts() {
  return [...elements.productList.querySelectorAll(".product-row")].map((row) => {
    const retailer = field(row, "retailer").value;
    const sku = field(row, "sku").value.trim();
    return {
      retailer,
      productUrl: field(row, "productUrl").value.trim(),
      sku: retailer === "amazon" ? sku.toUpperCase() : sku,
      maxPrice: Number(field(row, "maxPrice").value),
      maxOrderTotal: Number(field(row, "maxOrderTotal").value),
      quantity: Number(field(row, "quantity").value),
      action: field(row, "action").value,
      enabled: field(row, "enabled").checked
    };
  });
}

function validateVisibleInputs() {
  for (const input of elements.productList.querySelectorAll("input, select")) {
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  if (!elements.retryIntervalSeconds.checkValidity()) {
    elements.retryIntervalSeconds.reportValidity();
    return false;
  }
  if (!elements.storeNavigationIntervalSeconds.checkValidity()) {
    elements.storeNavigationIntervalSeconds.reportValidity();
    return false;
  }
  if (!elements.overloadCooldownSeconds.checkValidity()) {
    elements.overloadCooldownSeconds.reportValidity();
    return false;
  }
  if (elements.scheduledOpenEnabled.checked && !elements.scheduledOpenAt.value) {
    setMessage("Choose a date and time for the single store schedule.", "error");
    elements.scheduledOpenAt.focus();
    return false;
  }
  return true;
}

function formSettings() {
  const scheduledOpenAt = elements.scheduledOpenAt.value
    ? new Date(elements.scheduledOpenAt.value).toISOString()
    : "";
  return {
    products: collectProducts(),
    automationEnabled: elements.automationEnabled.checked,
    fastMode: elements.fastMode.checked,
    retryIntervalSeconds: Number(elements.retryIntervalSeconds.value),
    storeNavigationIntervalSeconds: Number(elements.storeNavigationIntervalSeconds.value),
    overloadCooldownSeconds: Number(elements.overloadCooldownSeconds.value),
    scheduledOpenEnabled: elements.scheduledOpenEnabled.checked,
    scheduledRetailer: elements.scheduledRetailer.value,
    scheduledOpenAt
  };
}

async function saveCurrentForm() {
  if (!validateVisibleInputs()) throw new Error("Fix the highlighted settings before saving.");
  const next = await window.cartAssist.saveSettings(formSettings());
  render(next, true);
  return next;
}

function updateBoundary() {
  const armed = elements.automationEnabled.checked;
  const checkoutCount = [...elements.productList.querySelectorAll(".product-row")]
    .filter((row) => field(row, "enabled").checked && field(row, "action").value === "checkout")
    .length;
  elements.boundaryBanner.classList.toggle("armed", armed);
  elements.boundaryBanner.querySelector("strong").textContent = armed
    ? "Automation is armed."
    : "Automation is disarmed.";
  elements.boundaryText.textContent = armed
    ? `${checkoutCount} enabled product${checkoutCount === 1 ? "" : "s"} may submit an order only after complete-cart, seller, unit-price, quantity, and final-total checks pass.`
    : "Save your buy list, verify every cap and quantity, then explicitly arm it when ready.";
}

function updateScheduleControls() {
  const enabled = elements.scheduledOpenEnabled.checked;
  elements.scheduledRetailer.disabled = !enabled;
  elements.scheduledOpenAt.disabled = !enabled;
  updateCountdown();
}

function updateCountdown() {
  const enabled = elements.scheduledOpenEnabled.checked;
  const value = elements.scheduledOpenAt.value;
  const store = STORE_LABELS[elements.scheduledRetailer.value] || "Selected store";

  if (!enabled || !value) {
    elements.countdown.textContent = "No scheduled opening. Only one store schedule can be active.";
    return;
  }

  const target = new Date(value).getTime();
  if (Number.isNaN(target)) {
    elements.countdown.textContent = "Choose a valid local date and time.";
    return;
  }

  const remaining = target - Date.now();
  if (remaining <= 0) {
    elements.countdown.textContent = `${store} scheduled time reached. Save a future time to arm it again.`;
    return;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const chunks = [];
  if (days) chunks.push(`${days}d`);
  chunks.push(`${hours}h`, `${minutes}m`, `${seconds}s`);
  elements.countdown.textContent = `${store} products open once in ${chunks.join(" ")}.`;
}

function productStateClass(product, status) {
  if (!product.enabled) return "disabled";
  if (status.order === "confirmed") return "good";
  if (BLOCKING_REASONS.has(status.reason)) return "bad";
  if (status.eligible) return "good";
  if (status.cart !== "not-confirmed" || status.checkout !== "not-started") return "waiting";
  return "";
}

function stateLabel(product, status) {
  if (!product.enabled) return "Disabled";
  if (status.order === "confirmed") return "Order confirmed";
  if (BLOCKING_REASONS.has(status.reason)) return status.reason.replaceAll("-", " ");
  if (status.checkout === "reached") return "Checkout reached";
  if (status.cart === "confirmed") return "Cart confirmed";
  if (status.eligible) return "Eligible offer";
  if (status.reason) return status.reason.replaceAll("-", " ");
  return "Waiting";
}

function statusMetric(label, value, kind = "") {
  const item = document.createElement("div");
  item.className = `status-metric ${kind}`.trim();
  const title = document.createElement("span");
  title.textContent = label;
  const text = document.createElement("strong");
  text.textContent = value;
  item.append(title, text);
  return item;
}

function renderProductStatuses(products, statuses) {
  const cards = products.map((product) => {
    const status = statuses[product.id] || {
      availability: "unknown",
      eligible: false,
      reason: "",
      observedPrice: null,
      observedOrderTotal: null,
      seller: "",
      firstParty: false,
      cart: "not-confirmed",
      checkout: "not-started",
      order: "not-confirmed",
      attempts: 0,
      lastMessage: "Waiting for this product to be observed."
    };
    const card = document.createElement("article");
    const stateClass = productStateClass(product, status);
    card.className = `product-status-card ${stateClass}`.trim();
    card.dataset.retailer = product.retailer;

    const heading = document.createElement("div");
    heading.className = "product-status-heading";
    const identity = document.createElement("div");
    const store = document.createElement("span");
    store.className = "store-name";
    store.textContent = STORE_LABELS[product.retailer];
    const sku = document.createElement("strong");
    sku.textContent = product.sku;
    identity.append(store, sku);
    const state = document.createElement("span");
    state.className = `state-chip ${stateClass}`.trim();
    state.textContent = stateLabel(product, status);
    heading.append(identity, state);

    const message = document.createElement("p");
    message.textContent = status.lastMessage || "Waiting for this product to be observed.";

    const metrics = document.createElement("div");
    metrics.className = "status-metrics";
    metrics.append(
      statusMetric("Observed / cap", `${money(status.observedPrice)} / ${money(product.maxPrice)}`, status.eligible ? "good" : ""),
      statusMetric("Final total / cap", product.action === "checkout"
        ? `${money(status.observedOrderTotal)} / ${money(product.maxOrderTotal)}`
        : "Add only"),
      statusMetric("Seller", status.firstParty ? `${status.seller || STORE_LABELS[product.retailer]} ✓` : status.seller || "Unverified", status.firstParty ? "good" : ""),
      statusMetric("Availability", status.availability || "unknown"),
      statusMetric("Quantity", String(product.quantity)),
      statusMetric("Action", product.action === "checkout" ? "Complete checkout" : "Add only"),
      statusMetric("Attempts", String(status.attempts || 0))
    );

    card.append(heading, message, metrics);
    return card;
  });
  elements.productStatusList.replaceChildren(...cards);
}

function renderEvents(events) {
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No events yet.";
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
    const parts = [STORE_LABELS[event.retailer], event.sku, eventName(event.eventType)].filter(Boolean);
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

function render(snapshot, populate = false) {
  currentSnapshot = snapshot;
  const { settings, status, productStatuses, events, app } = snapshot;
  if (populate) populateForm(settings);

  elements.connectionPill.classList.toggle("connected", status.companion === "connected");
  elements.connectionText.textContent = status.companion === "connected"
    ? "Browser companion connected"
    : "Waiting for companion";
  elements.latestMessage.textContent = status.lastMessage || "Waiting for the browser companion.";
  elements.latestTime.textContent = formatDateTime(status.lastEventAt);
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;
  elements.disarmButton.disabled = !settings.automationEnabled;
  renderProductStatuses(settings.products, productStatuses);
  renderEvents(events);
  updateCountdown();
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

elements.addProductButton.addEventListener("click", () => {
  elements.productList.append(createProductRow({
    retailer: elements.storeShortcut.value,
    maxPrice: 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "cart",
    enabled: true
  }));
  updateBoundary();
});

elements.saveButton.addEventListener("click", () => runAction(
  saveCurrentForm,
  "Buy list saved. The browser companion will pick up the new configuration shortly."
));

elements.openBuyListButton.addEventListener("click", () => runAction(
  () => window.cartAssist.openBuyList(),
  (count) => `${count} enabled product page${count === 1 ? "" : "s"} opened in your default browser.`
));

elements.disarmButton.addEventListener("click", () => runAction(async () => {
  if (!currentSnapshot) throw new Error("Settings have not loaded yet.");
  const next = await window.cartAssist.saveSettings({
    ...currentSnapshot.settings,
    automationEnabled: false
  });
  render(next, true);
}, "Automation disarmed and saved."));

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
}, "Event log cleared."));

elements.testButton.addEventListener("click", () => runAction(
  () => window.cartAssist.testEvent(),
  "Local companion server is running. Load the Chrome companion for live store events."
));

elements.automationEnabled.addEventListener("change", updateBoundary);
elements.scheduledOpenEnabled.addEventListener("change", updateScheduleControls);
elements.scheduledRetailer.addEventListener("change", updateCountdown);
elements.scheduledOpenAt.addEventListener("input", updateCountdown);

window.cartAssist.onUpdate((snapshot) => render(snapshot));
setInterval(updateCountdown, 1000);

window.cartAssist.getSnapshot()
  .then((snapshot) => render(snapshot, true))
  .catch((error) => setMessage(error.message || "Unable to load the app.", "error"));
