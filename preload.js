"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cartAssist", {
  getSnapshot: () => ipcRenderer.invoke("cart-assist:snapshot"),
  saveSettings: (settings) => ipcRenderer.invoke("cart-assist:save-settings", settings),
  openProduct: (productId) => ipcRenderer.invoke("cart-assist:open-product", productId),
  stopAll: () => ipcRenderer.invoke("cart-assist:stop-all"),
  openBuyList: () => ipcRenderer.invoke("cart-assist:open-buy-list"),
  openCart: (retailer) => ipcRenderer.invoke("cart-assist:open-cart", retailer),
  openOrders: (retailer) => ipcRenderer.invoke("cart-assist:open-orders", retailer),
  connectDiscord: (credentials) => ipcRenderer.invoke("cart-assist:discord-connect", credentials),
  disconnectDiscord: () => ipcRenderer.invoke("cart-assist:discord-disconnect"),
  forgetDiscord: () => ipcRenderer.invoke("cart-assist:discord-forget"),
  clearSignals: () => ipcRenderer.invoke("cart-assist:discord-clear-signals"),
  openSignal: (signalId, entry) => ipcRenderer.invoke("cart-assist:open-signal", signalId, entry),
  showExtension: () => ipcRenderer.invoke("cart-assist:show-extension"),
  copyExtensionPath: () => ipcRenderer.invoke("cart-assist:copy-extension-path"),
  clearEvents: () => ipcRenderer.invoke("cart-assist:clear-events"),
  testEvent: () => ipcRenderer.invoke("cart-assist:test-event"),
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("cart-assist:update", listener);
    return () => ipcRenderer.removeListener("cart-assist:update", listener);
  }
});
