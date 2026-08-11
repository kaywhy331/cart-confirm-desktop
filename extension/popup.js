"use strict";

const STORE_LABELS = Object.freeze({ target: "Target", walmart: "Walmart", amazon: "Amazon" });
const QuickAdd = globalThis.CartConfirmQuickAdd;
const elements = {
  addButton: document.getElementById("addButton"),
  availability: document.getElementById("availability"),
  preview: document.getElementById("preview"),
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
  currentProduct = null;
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
  const inspected = await tabMessage(tab.id, { type: "CART_CONFIRM_QUICK_ADD_INSPECT" });
  if (!inspected.ok || !inspected.product) {
    setStatus("Open a Target, Walmart, or Amazon product page, then click Refresh.", "error");
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
    setStatus("Ready to add a watch mission using the current retailer price.");
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
      result.duplicate ? "This item is already in Missions; its existing cap was left unchanged." : "Watch mission added to Cart Confirm.",
      "success"
    );
    elements.addButton.textContent = result.duplicate ? "Already in Missions" : "Added";
    return;
  }
  setStatus(result.error || "Quick add could not create the mission.", "error");
  elements.addButton.disabled = false;
});

elements.refreshButton.addEventListener("click", () => void loadPreview());
void loadPreview();
