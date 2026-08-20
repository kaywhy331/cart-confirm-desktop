"use strict";

const STORE_LABELS = Object.freeze({ target: "Target", walmart: "Walmart", amazon: "Amazon" });
const QuickAdd = globalThis.CartConfirmQuickAdd;
const elements = {
  addButton: document.getElementById("addButton"),
  availability: document.getElementById("availability"),
  cancelButton: document.getElementById("cancelButton"),
  closeButton: document.getElementById("closeButton"),
  preview: document.getElementById("preview"),
  preflight: document.getElementById("preflight"),
  preflightButton: document.getElementById("preflightButton"),
  preflightDetail: document.getElementById("preflightDetail"),
  preflightStore: document.getElementById("preflightStore"),
  resolution: document.getElementById("resolution"),
  resolutionButton: document.getElementById("resolutionButton"),
  resolutionDetail: document.getElementById("resolutionDetail"),
  resolutionStore: document.getElementById("resolutionStore"),
  price: document.getElementById("price"),
  refreshButton: document.getElementById("refreshButton"),
  seller: document.getElementById("seller"),
  sku: document.getElementById("sku"),
  status: document.getElementById("status"),
  store: document.getElementById("store"),
  title: document.getElementById("title")
};

let currentProduct = null;
let desktopConfig = null;
let currentPreflight = null;
let currentResolution = null;

function runtimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, reason: "extension-error" });
      else resolve(response || { ok: false });
    });
  });
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null));
  });
}

function tabMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) resolve({ ok: false, reason: "unsupported-page" });
      else resolve(response || { ok: false });
    });
  });
}

function setStatus(text, kind = "") {
  elements.status.textContent = text;
  elements.status.className = `status ${kind}`.trim();
}

function renderPreview(product) {
  currentProduct = product;
  elements.preview.hidden = false;
  elements.store.textContent = STORE_LABELS[product.retailer] || product.retailer;
  elements.title.textContent = product.title || `${elements.store.textContent} ${product.sku}`;
  elements.sku.textContent = product.sku;
  elements.price.textContent = QuickAdd.hasUsablePrice(product.price) ? `$${Number(product.price).toFixed(2)}` : "Not readable";
  elements.availability.textContent = product.available ? "Add control available" : "Not currently actionable";
  elements.seller.textContent = product.seller
    ? `${product.seller}${product.firstParty ? " · first-party match" : " · seller will be checked again"}`
    : "Seller text is not visible; the mission will still require first-party verification.";
  elements.addButton.disabled = !desktopConfig || desktopConfig.automationEnabled || !QuickAdd.hasUsablePrice(product.price);
}

async function loadPreview() {
  elements.refreshButton.disabled = true;
  elements.addButton.disabled = true;
  elements.preview.hidden = true;
  elements.preflight.hidden = true;
  elements.resolution.hidden = true;
  elements.preflightButton.disabled = true;
  currentProduct = null;
  currentPreflight = null;
  currentResolution = null;
  setStatus("Reading this product page…");

  const [connection, tab] = await Promise.all([
    runtimeMessage({ type: "CART_CONFIRM_GET_CONFIG", force: true }),
    activeTab()
  ]);
  desktopConfig = connection.ok ? connection.config : null;
  if (!tab?.id) {
    setStatus("No active Chrome tab was found.", "error");
    elements.refreshButton.disabled = false;
    return;
  }
  const [inspected, preflight] = await Promise.all([
    tabMessage(tab.id, { type: "CART_CONFIRM_QUICK_ADD_INSPECT" }),
    tabMessage(tab.id, { type: "CART_CONFIRM_CHECKOUT_PREFLIGHT_INSPECT" })
  ]);
  const tabContext = await runtimeMessage({
    type: "CART_CONFIRM_INSPECT_OPERATOR_RESOLUTION",
    tabId: tab.id
  });
  if (
    tabContext.ok
    && tabContext.productId
    && tabContext.resolutionRequired
    && desktopConfig
    && !desktopConfig.automationEnabled
  ) {
    currentResolution = tabContext;
    elements.resolution.hidden = false;
    elements.resolutionStore.textContent = STORE_LABELS[tabContext.retailer] || tabContext.retailer;
    elements.resolutionDetail.textContent = `Mission ${tabContext.sku} is holding this store lane after a possible cart or order action.`;
    elements.resolutionButton.disabled = false;
  }
  if (preflight.ok && preflight.productId) {
    currentPreflight = preflight;
    elements.preflight.hidden = false;
    elements.preflightStore.textContent = STORE_LABELS[preflight.retailer] || preflight.retailer;
    elements.preflightDetail.textContent = `Mission ${preflight.sku} is on a fully verified final review page.`;
    elements.preflightButton.disabled = !desktopConfig || desktopConfig.automationEnabled;
    setStatus(
      desktopConfig?.automationEnabled
        ? "Checkout found. Switch Autopilot off before locking its optional preflight."
        : "Checkout found. You may optionally lock its destination and payment evidence."
    );
    elements.refreshButton.disabled = false;
    return;
  }
  if (!inspected.ok || !inspected.product) {
    setStatus(preflight.error || "Open a supported product page or an enabled auto-submit mission's final checkout review, then click Refresh.", "error");
    elements.refreshButton.disabled = false;
    return;
  }
  renderPreview(inspected.product);
  if (!desktopConfig) {
    setStatus("Product found, but the Cart Confirm desktop app is not reachable.", "error");
  } else if (desktopConfig.automationEnabled) {
    setStatus("Product found. Switch Autopilot off before adding a mission.", "error");
  } else if (!QuickAdd.hasUsablePrice(inspected.product.price)) {
    setStatus("The exact item was found, but its current retailer price is not readable yet.", "error");
  } else {
    setStatus("Ready to add this item using the desktop default profile and current retailer price.");
  }
  elements.refreshButton.disabled = false;
}

elements.addButton.addEventListener("click", async () => {
  if (!currentProduct) return;
  elements.addButton.disabled = true;
  setStatus("Adding the mission…");
  const result = await runtimeMessage({
    type: "CART_CONFIRM_QUICK_ADD_MISSION",
    product: currentProduct
  });
  if (result.ok) {
    setStatus(
      result.duplicate
        ? (result.affiliateUpdated
          ? `This item is already in Missions; the affiliate link${result.imageUpdated ? " and product thumbnail were" : " was"} attached to it.`
          : result.imageUpdated
            ? "This item is already in Missions; its product thumbnail was captured from this page."
            : "This item is already in Missions; its existing settings were left unchanged.")
        : result.product?.action === "checkout"
          ? "Auto-submit mission added. Live final-review verification is required; one locked preflight per store approves its checkout profile."
          : `Mission added with the desktop default profile (${result.product?.action || "configured"}).`,
      "success"
    );
    elements.addButton.textContent = result.duplicate
      ? (result.affiliateUpdated
        ? (result.imageUpdated ? "Link + Thumbnail Attached" : "Affiliate Link Attached")
        : result.imageUpdated ? "Thumbnail Captured" : "Already in Missions")
      : "Added";
    return;
  }
  setStatus(result.error || "Quick add could not create the mission.", "error");
  elements.addButton.disabled = false;
});

elements.preflightButton.addEventListener("click", async () => {
  if (!currentPreflight) return;
  elements.preflightButton.disabled = true;
  setStatus("Locking the hashed checkout evidence…");
  const result = await runtimeMessage({
    type: "CART_CONFIRM_APPROVE_CHECKOUT_PREFLIGHT",
    productId: currentPreflight.productId,
    evidence: currentPreflight.evidence
  });
  if (result.ok) {
    setStatus("Optional checkout preflight locked. Auto-submit will require an exact match.", "success");
    elements.preflightButton.textContent = "Locked";
    return;
  }
  setStatus(result.error || "Checkout preflight could not be approved.", "error");
  elements.preflightButton.disabled = false;
});

elements.resolutionButton.addEventListener("click", async () => {
  if (!currentResolution) return;
  const confirmed = window.confirm(
    "Release this store lane only if you checked the retailer cart and order history and know no order was placed. This cannot undo a real order. Continue?"
  );
  if (!confirmed) return;
  elements.resolutionButton.disabled = true;
  setStatus("Recording the operator-confirmed no-order outcome…");
  const result = await runtimeMessage({
    type: "CART_CONFIRM_RESOLVE_OPERATOR_UNCERTAINTY",
    tabId: currentResolution.tabId,
    productId: currentResolution.productId,
    checkedOrderHistory: true,
    abandonMission: true
  });
  if (result.ok) {
    setStatus("Known no order recorded. The held store lane is released.", "success");
    elements.resolutionButton.textContent = "Released";
    return;
  }
  setStatus(result.error || `The held mission could not be released (${result.reason || "unknown error"}).`, "error");
  elements.resolutionButton.disabled = false;
});

elements.refreshButton.addEventListener("click", () => void loadPreview());
elements.closeButton.addEventListener("click", () => window.close());
elements.cancelButton.addEventListener("click", () => window.close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});
// Chrome normally dismisses an extension popup when focus moves elsewhere;
// this makes the intended outside-click behavior explicit as well.
window.addEventListener("blur", () => window.close());
void loadPreview();
