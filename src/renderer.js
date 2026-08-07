"use strict";

const elements = {
  armButton: document.getElementById("armButton"),
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
  stopTestButton: document.getElementById("stopTestButton"),
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
  versionText: document.getElementById("versionText"),
  stepsColumn: document.getElementById("stepsColumn"),
  stepConnect: document.getElementById("stepConnect"),
  stepConnectState: document.getElementById("stepConnectState"),
  stepConnectHint: document.getElementById("stepConnectHint"),
  stepProducts: document.getElementById("stepProducts"),
  stepProductsState: document.getElementById("stepProductsState"),
  stepVerify: document.getElementById("stepVerify"),
  stepVerifyState: document.getElementById("stepVerifyState"),
  stepRun: document.getElementById("stepRun"),
  stepRunState: document.getElementById("stepRunState")
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
let formDirty = false;
let openRunInFlight = false;

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

function field(row, name) {
  return row.querySelector(`[data-field="${name}"]`);
}

function productTitle(productId) {
  const product = currentSnapshot?.settings?.products?.find((candidate) => candidate.id === productId);
  return product?.title || "";
}

function markDirty() {
  if (formDirty) return;
  formDirty = true;
  updateSteps();
}

function updateRowStore(row) {
  const retailer = field(row, "retailer").value;
  row.dataset.retailer = retailer;
  row.querySelector(".sku-label").textContent = SKU_LABELS[retailer];
  const skuInput = field(row, "sku");
  skuInput.placeholder = retailer === "amazon" ? "B0ABC12345" : "Auto-filled from the link";
  skuInput.inputMode = retailer === "amazon" ? "text" : "numeric";
}

function markIdentityDirty(row) {
  row.dataset.productId = "";
  const openButton = row.querySelector(".open-product-row");
  openButton.disabled = true;
  openButton.title = "Save this item before opening it.";
}

function createProductRow(product = {}) {
  const row = elements.productRowTemplate.content.firstElementChild.cloneNode(true);
  const retailer = product.retailer || "target";
  row.dataset.productId = product.id || "";
  field(row, "retailer").value = retailer;
  field(row, "title").value = product.title || "";
  field(row, "productUrl").value = product.productUrl || "";
  field(row, "sku").value = product.sku || "";
  field(row, "maxPrice").value = Number(product.maxPrice || 0).toFixed(2);
  field(row, "maxOrderTotal").value = Number(product.maxOrderTotal || 0).toFixed(2);
  field(row, "quantity").value = product.quantity || 1;
  field(row, "action").value = product.action || "cart";
  field(row, "fulfillmentMode").value = product.fulfillmentMode || "manual";
  field(row, "enabled").checked = product.enabled !== false;
  updateRowStore(row);

  const advanced = row.querySelector(".advanced-fields");
  advanced.open = (product.action && product.action !== "cart") || Number(product.maxOrderTotal) > 0;

  const openButton = row.querySelector(".open-product-row");
  openButton.disabled = !row.dataset.productId;
  openButton.title = row.dataset.productId ? "Open this saved item." : "Save this item before opening it.";

  field(row, "retailer").addEventListener("change", () => {
    updateRowStore(row);
    markIdentityDirty(row);
  });
  field(row, "productUrl").addEventListener("change", () => {
    const detected = detectRetailer(field(row, "productUrl").value);
    if (detected) {
      field(row, "retailer").value = detected;
      updateRowStore(row);
      const detectedSku = extractSku(detected, field(row, "productUrl").value);
      if (detectedSku) field(row, "sku").value = detectedSku;
    }
    markIdentityDirty(row);
  });
  field(row, "sku").addEventListener("change", () => {
    if (field(row, "retailer").value === "amazon") {
      field(row, "sku").value = field(row, "sku").value.trim().toUpperCase();
    }
    markIdentityDirty(row);
  });
  field(row, "action").addEventListener("change", () => {
    if (field(row, "action").value !== "cart") advanced.open = true;
    updateBoundary();
  });
  field(row, "enabled").addEventListener("change", updateBoundary);

  openButton.addEventListener("click", () => {
    if (!row.dataset.productId) {
      setMessage("Save this item before opening it.", "error");
      return;
    }
    void runAction(
      () => window.cartAssist.openProduct(row.dataset.productId),
      (result) => (result?.via === "companion-tab"
        ? `${STORE_LABELS[field(row, "retailer").value]} item opened in your existing Chrome tab.`
        : result?.via === "default-browser"
          ? `${STORE_LABELS[field(row, "retailer").value]} item opened in your default browser — Chrome was not found, and the companion only works inside Chrome.`
          : `${STORE_LABELS[field(row, "retailer").value]} item page opened in Chrome.`)
    );
  });

  row.querySelector(".remove-product-row").addEventListener("click", () => {
    if (elements.productList.childElementCount <= 1) {
      setMessage("The buy list must contain at least one item.", "error");
      return;
    }
    row.remove();
    markDirty();
    updateBoundary();
  });

  return row;
}

function populateForm(settings) {
  elements.fastMode.checked = settings.fastMode;
  elements.retryIntervalSeconds.value = settings.retryIntervalSeconds;
  elements.storeNavigationIntervalSeconds.value = settings.storeNavigationIntervalSeconds;
  elements.overloadCooldownSeconds.value = settings.overloadCooldownSeconds;
  elements.scheduledOpenEnabled.checked = settings.scheduledOpenEnabled;
  elements.scheduledRetailer.value = settings.scheduledRetailer || "target";
  elements.scheduledOpenAt.value = toLocalInputValue(settings.scheduledOpenAt);
  elements.productList.replaceChildren(...settings.products.map(createProductRow));
  formDirty = false;
  updateScheduleControls();
  updateBoundary();
  updateSteps();
}

function collectProducts() {
  return [...elements.productList.querySelectorAll(".product-row")].map((row) => {
    const retailer = field(row, "retailer").value;
    const sku = field(row, "sku").value.trim();
    return {
      retailer,
      title: field(row, "title").value.trim(),
      productUrl: field(row, "productUrl").value.trim(),
      sku: retailer === "amazon" ? sku.toUpperCase() : sku,
      maxPrice: Number(field(row, "maxPrice").value),
      maxOrderTotal: Number(field(row, "maxOrderTotal").value),
      quantity: Number(field(row, "quantity").value),
      action: field(row, "action").value,
      fulfillmentMode: field(row, "fulfillmentMode").value,
      enabled: field(row, "enabled").checked
    };
  });
}

function reportInvalid(input) {
  const details = input.closest("details");
  if (details && !details.open) details.open = true;
  input.reportValidity();
}

function validateVisibleInputs() {
  for (const input of elements.productList.querySelectorAll("input, select")) {
    if (!input.checkValidity()) {
      reportInvalid(input);
      return false;
    }
  }
  for (const input of [
    elements.retryIntervalSeconds,
    elements.storeNavigationIntervalSeconds,
    elements.overloadCooldownSeconds
  ]) {
    if (!input.checkValidity()) {
      reportInvalid(input);
      return false;
    }
  }
  if (elements.scheduledOpenEnabled.checked && !elements.scheduledOpenAt.value) {
    setMessage("Choose a date and time for the single store schedule.", "error");
    reportInvalid(elements.scheduledOpenAt);
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
    // Armed state is not form data: it only changes through Arm and Stop.
    automationEnabled: Boolean(currentSnapshot?.settings?.automationEnabled),
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
  const armed = Boolean(currentSnapshot?.settings?.automationEnabled);
  const checkoutCount = [...elements.productList.querySelectorAll(".product-row")]
    .filter((row) => field(row, "enabled").checked && field(row, "action").value === "checkout")
    .length;
  elements.boundaryBanner.classList.toggle("armed", armed);
  elements.boundaryBanner.querySelector("strong").textContent = armed
    ? "Automation is armed."
    : "Automation is disarmed.";
  elements.boundaryText.textContent = armed
    ? `${checkoutCount} auto-submit item${checkoutCount === 1 ? "" : "s"} may place a real order. "Prepare checkout" items always stop for your click.`
    : "Nothing is added to any cart until you arm automation in step 4.";
}

function setStepState(section, chip, done, label, attention = false) {
  chip.textContent = label;
  section.classList.toggle("done", done);
  section.classList.toggle("attention", Boolean(attention) && !done);
}

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
    hint: "Extension loaded ✓ — now open (or reload) a Target, Walmart, or Amazon tab in the same Chrome profile. If product links open in another browser (like Edge), this app now opens them in Chrome for you."
  };
}

function updateSteps() {
  const companionState = companionStepState();
  setStepState(
    elements.stepConnect,
    elements.stepConnectState,
    companionState.done,
    companionState.label,
    !companionState.done
  );
  elements.stepConnectHint.textContent = companionState.hint;
  elements.stepConnectHint.hidden = !companionState.hint;

  const hasReadyRow = [...elements.productList.querySelectorAll(".product-row")].some((row) => (
    field(row, "enabled").checked
    && field(row, "productUrl").value.trim() !== ""
    && Number(field(row, "maxPrice").value) > 0
  ));
  setStepState(
    elements.stepProducts,
    elements.stepProductsState,
    hasReadyRow,
    hasReadyRow ? "Ready ✓" : "Add a link + price cap",
    !hasReadyRow
  );

  setStepState(
    elements.stepVerify,
    elements.stepVerifyState,
    !formDirty,
    formDirty ? "Save needed" : "Saved ✓",
    formDirty
  );

  const armed = Boolean(currentSnapshot?.settings?.automationEnabled);
  elements.stepRunState.textContent = armed ? "Armed — live" : "Disarmed";
  elements.stepRun.classList.toggle("done", armed);
  elements.stepRun.classList.toggle("armed", armed);
  elements.stepRun.classList.remove("attention");
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
  elements.countdown.textContent = `${store} items open once in ${chunks.join(" ")}.`;
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
  if (!product.enabled) return "Disabled";
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
      lastMessage: "Waiting for this item to be observed."
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
    store.textContent = `${STORE_LABELS[product.retailer]} · ${product.sku}`;
    const title = document.createElement("strong");
    title.textContent = product.title || `${STORE_LABELS[product.retailer]} ${product.sku}`;
    identity.append(store, title);
    const state = document.createElement("span");
    state.className = `state-chip ${stateClass}`.trim();
    state.textContent = stateLabel(product, status);
    heading.append(identity, state);

    const message = document.createElement("p");
    const armed = Boolean(currentSnapshot?.settings?.automationEnabled);
    const nothingAddedYet = status.cart === "not-confirmed"
      && status.checkout === "not-started"
      && status.order !== "confirmed";
    const disarmedEligibleHint = product.enabled && status.eligible && !armed && nothingAddedYet
      ? " Automation is disarmed, so nothing was added — arm it in step 4 and reopen the item to add it to the cart."
      : "";
    message.textContent = `${status.lastMessage || "Waiting for this item to be observed."}${disarmedEligibleHint}`;

    const metrics = document.createElement("div");
    metrics.className = "status-metrics";
    metrics.append(
      statusMetric("Observed / cap", `${money(status.observedPrice)} / ${money(product.maxPrice)}`, status.eligible ? "good" : ""),
      statusMetric("Final total / cap", product.action !== "cart"
        ? `${money(status.observedOrderTotal)} / ${money(product.maxOrderTotal)}`
        : "Add only"),
      statusMetric("Seller", status.firstParty ? `${status.seller || STORE_LABELS[product.retailer]} ✓` : status.seller || "Unverified", status.firstParty ? "good" : ""),
      statusMetric("Availability", status.availability || "unknown"),
      statusMetric("Quantity", String(product.quantity)),
      statusMetric("Action", product.action === "checkout"
        ? "Auto-submit"
        : product.action === "review" ? "Final review" : "Add only"),
      statusMetric("Fulfillment", product.fulfillmentMode === "shipping"
        ? "Shipping"
        : product.fulfillmentMode === "pickup" ? "Pickup" : "Manual review"),
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

function render(snapshot, populate = false) {
  const previousSettings = currentSnapshot?.settings;
  currentSnapshot = snapshot;
  const { settings, status, productStatuses, events, app } = snapshot;
  if (populate) populateForm(settings);
  else if (previousSettings && (
    previousSettings.scheduledOpenEnabled !== settings.scheduledOpenEnabled
    || previousSettings.scheduledRetailer !== settings.scheduledRetailer
    || previousSettings.scheduledOpenAt !== settings.scheduledOpenAt
  )) {
    elements.scheduledOpenEnabled.checked = settings.scheduledOpenEnabled;
    elements.scheduledRetailer.value = settings.scheduledRetailer || "target";
    elements.scheduledOpenAt.value = toLocalInputValue(settings.scheduledOpenAt);
    updateScheduleControls();
  }

  elements.connectionPill.classList.toggle("connected", status.companion === "connected");
  elements.connectionText.textContent = status.companion === "connected"
    ? "Browser companion connected"
    : "Waiting for companion";
  elements.latestMessage.textContent = status.lastMessage || "Waiting for the browser companion.";
  elements.latestTime.textContent = formatDateTime(status.lastEventAt);
  elements.portBadge.textContent = app.companionPort ? `Port ${app.companionPort}` : "Port unavailable";
  elements.versionText.textContent = `${app.name} v${app.version}`;
  elements.armButton.disabled = Boolean(settings.automationEnabled);
  elements.armButton.textContent = settings.automationEnabled ? "Armed" : "Arm automation";
  renderProductStatuses(settings.products, productStatuses);
  renderEvents(events);
  updateCountdown();
  updateBoundary();
  updateSteps();
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

elements.stepsColumn.addEventListener("input", (event) => {
  if (event.target === elements.storeShortcut) return;
  markDirty();
});
elements.stepsColumn.addEventListener("change", (event) => {
  if (event.target === elements.storeShortcut) return;
  markDirty();
});

elements.addProductButton.addEventListener("click", () => {
  const lastRow = elements.productList.querySelector(".product-row:last-child");
  elements.productList.append(createProductRow({
    retailer: lastRow ? field(lastRow, "retailer").value : "target",
    maxPrice: 0,
    maxOrderTotal: 0,
    quantity: 1,
    action: "cart",
    fulfillmentMode: "manual",
    enabled: true
  }));
  markDirty();
  updateBoundary();
});

elements.saveButton.addEventListener("click", () => runAction(
  saveCurrentForm,
  "Saved. The browser companion picks up the new list within a few seconds."
));

elements.testButton.addEventListener("click", () => runAction(async () => {
  if (formDirty) throw new Error("Save your changes first (step 3), then run the test.");
  if (currentSnapshot?.settings?.automationEnabled) {
    throw new Error("Disarm automation before testing — Test opens the product page without buying anything.");
  }
  await window.cartAssist.testEvent();
  return window.cartAssist.openProduct();
}, (result) => (result?.via === "companion-tab"
  ? "Test started in your existing Chrome tab. Watch “What the companion sees” — nothing is added while disarmed."
  : result?.via === "default-browser"
    ? "Test page opened, but Chrome was not found — it used your default browser, where the companion cannot see it. Install Chrome or open the link in Chrome manually."
    : "Test started: the product page is opening in Chrome. Watch “What the companion sees” — nothing is added while disarmed.")));

elements.openBuyListButton.addEventListener("click", async () => {
  if (openRunInFlight) return;
  openRunInFlight = true;
  elements.openBuyListButton.disabled = true;
  setMessage("Opening enabled items… multiple opens are paced to respect store limits.");
  try {
    const result = await window.cartAssist.openBuyList();
    const parts = [`${result.count} item page${result.count === 1 ? "" : "s"} opened`];
    if (result.reused) parts.push(`${result.reused} reused an existing Chrome tab`);
    if (result.deduped) parts.push(`${result.deduped} already queued`);
    const armNote = result.armed
      ? "Automation is armed — the companion acts as each page loads."
      : "Automation is disarmed — nothing will be added until you arm it in step 4.";
    const browserNote = result.defaultBrowser
      ? " Chrome was not found, so your default browser was used — the companion only works inside Chrome."
      : "";
    setMessage(`${parts.join(", ")}. ${armNote}${browserNote}`, result.defaultBrowser ? "error" : result.armed ? "success" : "warn");
  } catch (error) {
    setMessage(error.message || "The action failed.", "error");
  } finally {
    openRunInFlight = false;
    elements.openBuyListButton.disabled = false;
  }
});

async function stopEverything() {
  const next = await window.cartAssist.stopAll();
  render(next, true);
}
const STOP_MESSAGE = "Stopped. Automation disarmed, queued page openings cancelled, and the schedule cleared.";
elements.disarmButton.addEventListener("click", () => runAction(stopEverything, STOP_MESSAGE));
elements.stopTestButton.addEventListener("click", () => runAction(stopEverything, STOP_MESSAGE));

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

elements.armButton.addEventListener("click", () => runAction(async () => {
  if (!currentSnapshot) throw new Error("Settings have not loaded yet.");
  if (formDirty) await saveCurrentForm();
  const saved = currentSnapshot.settings;
  const autoSubmitCount = saved.products.filter((product) => product.enabled && product.action === "checkout").length;
  if (
    autoSubmitCount > 0
    && !window.confirm(`${autoSubmitCount} enabled item${autoSubmitCount === 1 ? "" : "s"} may submit a real order. Re-arming starts a new run and can retry an item whose prior submission was uncertain. Verify retailer order history first. "Prepare checkout, I submit" is safer. Arm auto-submit anyway?`)
  ) {
    throw new Error("Automation was not armed.");
  }
  const next = await window.cartAssist.saveSettings({ ...saved, automationEnabled: true });
  render(next, true);
  return next;
}, "Armed. Open enabled items now — the companion acts as each page loads."));

elements.scheduledOpenEnabled.addEventListener("change", updateScheduleControls);
elements.scheduledRetailer.addEventListener("change", updateCountdown);
elements.scheduledOpenAt.addEventListener("input", updateCountdown);

window.cartAssist.onUpdate((snapshot) => render(snapshot));
setInterval(updateCountdown, 1000);

window.cartAssist.getSnapshot()
  .then((snapshot) => render(snapshot, true))
  .catch((error) => setMessage(error.message || "Unable to load the app.", "error"));
