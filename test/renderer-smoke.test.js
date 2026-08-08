"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");

function snapshotFixture() {
  return {
    settings: {
      products: [{
        id: "target:95298172",
        retailer: "target",
        title: "Booster Box",
        openAt: "",
        productUrl: "https://www.target.com/p/restocks/A-95298172",
        sku: "95298172",
        maxPrice: 40,
        maxOrderTotal: 0,
        quantity: 1,
        action: "cart",
        alertLevel: "standard",
        fulfillmentMode: "manual",
        signalAutoOpen: true,
        signalEntry: "product",
        enabled: true
      }],
      automationEnabled: false,
      automationRunId: "",
      fastMode: true,
      retryIntervalSeconds: 15,
      storeNavigationIntervalSeconds: 20,
      overloadCooldownSeconds: 300,
      scheduledOpenEnabled: false,
      scheduledOpenAt: "",
      scheduledRetailer: "target",
      discordEnabled: false,
      discordChannelId: "",
      discordAutoOpen: true,
      firstPartyOnly: true
    },
    status: {
      companion: "connected",
      lastHeartbeatAt: "",
      lastEventAt: "",
      lastPage: "",
      lastMessage: "Browser companion connected."
    },
    productStatuses: {},
    events: [],
    signals: [],
    discord: {
      enabled: false,
      configured: false,
      connected: false,
      channelId: "",
      channelName: "",
      lastPollAt: "",
      lastSignalAt: "",
      lastError: ""
    },
    retailers: {},
    app: { name: "Cart Confirm", version: "0.0.0-test", companionPort: 32191, extensionPath: "/tmp" }
  };
}

test("mission control boots, edits, arms, and filters like the dashboard", async () => {
  const dom = new JSDOM(html, { url: "file:///app/index.html", runScripts: "outside-only" });
  const { window } = dom;
  let pushUpdate = null;
  const copiedAffiliateUrls = [];
  window.cartAssist = {
    getSnapshot: async () => snapshotFixture(),
    saveSettings: async () => snapshotFixture(),
    openProduct: async () => ({ productId: "target:95298172", via: "companion-tab" }),
    openBuyList: async () => ({ count: 1, reused: 1, deduped: 0, armed: false }),
    openCart: async () => "",
    openOrders: async () => "",
    resolveHowlLink: async (input) => ({
      howlUrl: input.howlUrl,
      affiliateUrl: "https://www.target.com/p/booster/-/A-95298172?nrtv_cid=test&clkid=123",
      retailer: input.retailer,
      sku: input.sku,
      redirectCount: 2,
      resolvedAt: "2026-08-08T18:00:00.000Z"
    }),
    copyAffiliateLink: async (input) => {
      copiedAffiliateUrls.push(input.affiliateUrl);
      return input;
    },
    connectDiscord: async () => snapshotFixture(),
    disconnectDiscord: async () => snapshotFixture(),
    forgetDiscord: async () => snapshotFixture(),
    clearSignals: async () => snapshotFixture(),
    openSignal: async () => ({ productId: "", via: "companion-tab" }),
    showExtension: async () => "",
    copyExtensionPath: async () => "",
    clearEvents: async () => snapshotFixture(),
    stopAll: async () => snapshotFixture(),
    testEvent: async () => ({ ok: true }),
    onUpdate: (callback) => {
      pushUpdate = callback;
      return () => {};
    }
  };

  window.eval(rendererSource);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const doc = window.document;

  // Connected boot: setup card hidden, one mission view card, autopilot OFF.
  assert.equal(doc.getElementById("connectCard").hidden, true);
  const card = doc.querySelector(".mission-card");
  assert.ok(card, "expected a mission view card");
  assert.equal(card.querySelector(".status-title").textContent, "Booster Box");
  assert.equal(card.querySelector(".action-chip").textContent, "Add only");
  assert.match(card.querySelector(".mission-sub").textContent, /\$40\.00 cap/);
  assert.equal(doc.getElementById("autopilotState").textContent, "OFF");
  assert.match(doc.getElementById("worstCase").textContent, /\$40/);
  assert.equal(doc.getElementById("alarmBar").hidden, true);
  assert.ok(
    doc.getElementById("testButton").closest(".topbar-controls"),
    "Test lives in the header next to Autopilot"
  );

  // Edit flow: inline editor with values, cancel restores the view card.
  card.querySelector(".mission-edit").click();
  let editCard = doc.querySelector(".mission-edit-card");
  assert.ok(editCard, "expected the inline mission editor");
  assert.equal(editCard.querySelector("[data-field='title']").value, "Booster Box");
  const howlInput = editCard.querySelector("[data-field='howlUrl']");
  howlInput.value = "https://howl.me/campaign123";
  howlInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  editCard.querySelector(".howl-resolve").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(editCard.querySelector("[data-field='affiliateUrl']").value, /^https:\/\/www\.target\.com\//);
  assert.equal(editCard.querySelector(".howl-resolve").textContent, "Resolve again");
  assert.equal(editCard.querySelector(".howl-copy").disabled, false);
  editCard.querySelector(".howl-copy").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(copiedAffiliateUrls.length, 1);
  editCard.querySelector(".mission-cancel").click();

  // Saved campaign links expose a one-click copy action on the mission card.
  const affiliateReady = snapshotFixture();
  affiliateReady.settings.products[0].howlUrl = "https://howl.me/campaign123";
  affiliateReady.settings.products[0].affiliateUrl = "https://www.target.com/p/booster/-/A-95298172?nrtv_cid=test&clkid=123";
  affiliateReady.settings.products[0].affiliateResolvedFrom = "https://howl.me/campaign123";
  affiliateReady.settings.products[0].affiliateResolvedAt = "2026-08-08T18:00:00.000Z";
  pushUpdate(affiliateReady);
  const shareButton = doc.querySelector(".mission-copy-affiliate");
  assert.equal(shareButton.hidden, false);
  assert.match(doc.querySelector(".mission-sub").textContent, /Howl share ready/);
  shareButton.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(copiedAffiliateUrls.length, 2);

  const affiliateSignal = structuredClone(affiliateReady);
  affiliateSignal.signals = [{
    id: "discord:affiliate-ready",
    productId: "target:95298172",
    retailer: "target",
    sku: "95298172",
    title: "Booster Box",
    productUrl: "https://www.target.com/p/-/A-95298172",
    price: 31.99,
    observedAt: new Date().toISOString(),
    autoOpenState: "historical",
    note: "Signal recorded",
    desired: true
  }];
  pushUpdate(affiliateSignal);
  const signalShareButton = [...doc.querySelectorAll(".signal-card button")]
    .find((button) => button.textContent === "Copy campaign link");
  assert.ok(signalShareButton, "matching Discord signals expose the saved retailer-domain campaign link");
  signalShareButton.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(copiedAffiliateUrls.length, 3);

  // A Discord inbox signal is identified as new and prefills a safe watch mission.
  const signaled = snapshotFixture();
  signaled.signals = [{
    id: "discord:123",
    productId: "walmart:19952559023",
    retailer: "walmart",
    sku: "19952559023",
    title: "Pitch Black booster bundle",
    productUrl: "https://www.walmart.com/ip/19952559023",
    price: 31.97,
    stock: 10,
    orderLimit: 2,
    observedAt: new Date().toISOString(),
    autoOpenState: "new-product",
    note: "New product",
    desired: false
  }];
  pushUpdate(signaled);
  assert.equal(doc.querySelector(".signal-match").textContent, "New");
  doc.querySelector(".signal-card .button.primary").click();
  editCard = doc.querySelector(".mission-edit-card");
  assert.equal(editCard.querySelector("[data-field='retailer']").value, "walmart");
  assert.equal(editCard.querySelector("[data-field='maxPrice']").value, "31.97");
  assert.equal(editCard.querySelector("[data-field='action']").value, "watch");
  editCard.querySelector(".mission-cancel").click();
  assert.equal(doc.querySelector(".mission-edit-card"), null);
  assert.ok(doc.querySelector(".mission-card"));

  // New mission defaults to watch and derives a title from the pasted link.
  doc.getElementById("newMissionButton").click();
  editCard = doc.querySelector(".mission-edit-card");
  assert.equal(editCard.querySelector("[data-field='action']").value, "watch");
  const urlInput = editCard.querySelector("[data-field='productUrl']");
  urlInput.value = "https://www.target.com/p/pokemon-scarlet-violet-booster-box/-/A-95298172";
  urlInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(editCard.querySelector("[data-field='sku']").value, "95298172");
  assert.match(editCard.querySelector("[data-field='title']").value, /Pokemon Scarlet Violet Booster Box/);
  editCard.querySelector(".mission-cancel").click();

  // Clicking the mission body filters the feed; show-all clears it.
  doc.querySelector(".mission-card .mission-main").click();
  assert.equal(doc.getElementById("eventFilterButton").hidden, false);
  doc.getElementById("eventFilterButton").click();
  assert.equal(doc.getElementById("eventFilterButton").hidden, true);

  // Armed snapshot: autopilot ON, and editing pauses instead of locking.
  const armed = snapshotFixture();
  armed.settings.automationEnabled = true;
  pushUpdate(armed);
  assert.equal(doc.getElementById("autopilotState").textContent, "ON");
  assert.equal(doc.querySelector(".mission-card .mission-edit").disabled, false);
  assert.equal(doc.querySelector(".mission-card [data-view='enabled']").disabled, false);
  doc.querySelector(".mission-card .mission-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const pausedEditor = doc.querySelector(".mission-edit-card");
  assert.ok(pausedEditor, "editing while armed pauses Autopilot and opens the editor");
  pausedEditor.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.querySelector(".mission-edit-card"), null);

  // Disconnected snapshot: the setup card returns with a diagnosis label.
  const waiting = snapshotFixture();
  waiting.status.companion = "waiting";
  pushUpdate(waiting);
  assert.equal(doc.getElementById("connectCard").hidden, false);
  assert.equal(doc.getElementById("connectState").textContent, "Waiting for Chrome");

  const mismatch = snapshotFixture();
  mismatch.status.companion = "waiting";
  mismatch.companionHello = { version: "2.2.0", reason: "version-mismatch", seenAt: "2026-01-01T00:00:00.000Z" };
  pushUpdate(mismatch);
  assert.equal(doc.getElementById("connectState").textContent, "Reload the extension");

  // Mission rows carry live state: status chip and ticking age.
  const eligible = snapshotFixture();
  eligible.productStatuses = {
    "target:95298172": {
      eligible: true,
      reason: "eligible",
      cart: "not-confirmed",
      checkout: "not-started",
      order: "not-confirmed",
      lastEventAt: new Date(Date.now() - 5_000).toISOString(),
      lastMessage: "Target has an eligible first-party offer at $31.99."
    }
  };
  pushUpdate(eligible);
  const liveCard = doc.querySelector(".mission-card");
  assert.equal(liveCard.querySelector(".state-chip").textContent, "Eligible offer");
  assert.match(liveCard.querySelector(".status-age").textContent, /^\d+s ago$/);

  // The drop calendar stays hidden until something is scheduled, then acts
  // as a coverage board with per-chip toggling and batch enabling.
  assert.equal(doc.getElementById("schedulePanel").hidden, true);
  const scheduled = snapshotFixture();
  scheduled.settings.products[0].openAt = new Date(Date.now() + 3_600_000).toISOString();
  pushUpdate(scheduled);
  assert.equal(doc.getElementById("schedulePanel").hidden, false);
  assert.ok(doc.querySelector(".schedule-chip"));
  assert.match(doc.getElementById("scheduleNext").textContent, /Next: Booster Box in/);
  assert.equal(doc.getElementById("scheduleCoverage").textContent, "1/1 enabled");
  assert.equal(doc.getElementById("enableScheduledButton").hidden, true);

  const uncovered = snapshotFixture();
  uncovered.settings.products[0].openAt = new Date(Date.now() + 3_600_000).toISOString();
  uncovered.settings.products[0].enabled = false;
  pushUpdate(uncovered);
  assert.equal(doc.getElementById("scheduleCoverage").textContent, "0/1 enabled");
  assert.equal(doc.getElementById("enableScheduledButton").hidden, false);
  assert.match(doc.querySelector(".schedule-chip").className, /off/);

  // The digest bar exists and stays hidden until a real away period ends.
  assert.equal(doc.getElementById("digestBar").hidden, true);

  // An empty mission list shows a create CTA, and Escape closes the editor.
  const emptySnapshot = snapshotFixture();
  emptySnapshot.settings.products = [];
  pushUpdate(emptySnapshot);
  assert.equal(doc.getElementById("worstCase").textContent, "");
  const cta = doc.querySelector(".mission-empty .button");
  assert.match(cta.textContent, /first mission/);
  cta.click();
  const newEditor = doc.querySelector(".mission-edit-card");
  assert.ok(newEditor, "CTA opens the mission editor");
  newEditor.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(doc.querySelector(".mission-edit-card"), null);
  assert.ok(doc.querySelector(".mission-empty"), "empty CTA returns after cancel");

  window.close();
});
