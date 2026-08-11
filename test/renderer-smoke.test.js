"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const configProfilesSource = fs.readFileSync(path.join(__dirname, "..", "lib", "config-profiles.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

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
        executionMode: "watcher",
        enabled: true
      }],
      automationEnabled: false,
      monitoringPaused: true,
      automationRunId: "",
      fastMode: true,
      retryIntervalSeconds: 15,
      eligibilityRefreshIntervalSeconds: 2,
      storeNavigationIntervalSeconds: 20,
      overloadCooldownSeconds: 300,
      watcherIntervalSeconds: 60,
      blitzRetryDelayMs: 750,
      blitzWindowSeconds: 20,
      scheduledOpenEnabled: false,
      scheduledOpenAt: "",
      scheduledRetailer: "target",
      discordEnabled: false,
      discordChannelId: "",
      discordAutoOpen: true,
      configurationProfiles: [],
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
  let openProductCalls = 0;
  let openBuyListCalls = 0;
  const openBuyListInputs = [];
  let testEventCalls = 0;
  const savedSettingsInputs = [];
  const bulkImportInputs = [];
  const copiedAffiliateUrls = [];
  const style = window.document.createElement("style");
  style.textContent = stylesSource;
  window.document.head.append(style);
  window.cartAssist = {
    getSnapshot: async () => snapshotFixture(),
    saveSettings: async (input) => {
      savedSettingsInputs.push(input);
      const next = snapshotFixture();
      next.settings = {
        ...next.settings,
        ...input,
        monitoringPaused: input.automationEnabled ? false : input.monitoringPaused
      };
      return next;
    },
    bulkImportMissions: async (input) => {
      bulkImportInputs.push(input);
      const next = snapshotFixture();
      next.settings.products = [
        {
          ...next.settings.products[0],
          action: "watch",
          enabled: false,
          maxPrice: 0,
          title: "Imported Target Item"
        },
        {
          ...next.settings.products[0],
          id: "walmart:95163305",
          retailer: "walmart",
          productUrl: "https://www.walmart.com/ip/95163305",
          sku: "95163305",
          action: "watch",
          enabled: false,
          maxPrice: 0,
          title: "Imported Walmart Item"
        }
      ];
      return {
        snapshot: next,
        summary: { candidates: 2, imported: 2, duplicates: 0, invalid: 0, overCapacity: 0 },
        issues: []
      };
    },
    openProduct: async () => {
      openProductCalls += 1;
      return { productId: "target:95298172", via: "companion-tab" };
    },
    openBuyList: async (options = {}) => {
      openBuyListCalls += 1;
      openBuyListInputs.push(options);
      return options.backgroundFirst
        ? { count: 0, background: 1, reused: 0, deduped: 0, scheduled: 0, armed: true }
        : { count: 1, background: 0, reused: 1, deduped: 0, scheduled: 0, armed: false };
    },
    openCart: async () => "",
    openOrders: async () => "",
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
    testEvent: async () => {
      testEventCalls += 1;
      return { count: 1, reused: 1, deduped: 0, armed: false };
    },
    onUpdate: (callback) => {
      pushUpdate = callback;
      return () => {};
    }
  };

  window.eval(configProfilesSource);
  window.eval(rendererSource);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const doc = window.document;

  // Connected boot: setup card hidden, one mission view card, fully stopped.
  assert.equal(doc.getElementById("connectCard").hidden, true);
  const card = doc.querySelector(".mission-card");
  assert.ok(card, "expected a mission view card");
  assert.equal(card.querySelector(".status-title").textContent, "Booster Box");
  assert.equal(card.querySelector(".action-chip").textContent, "Add only");
  assert.match(card.querySelector(".mission-sub").textContent, /\$40\.00 cap/);
  assert.equal(doc.getElementById("autopilotState").textContent, "STOPPED");
  assert.match(doc.getElementById("worstCase").textContent, /\$40/);
  assert.equal(doc.getElementById("alarmBar").hidden, true);
  assert.equal(window.getComputedStyle(doc.getElementById("alarmBar")).display, "none");
  for (const element of [
    doc.querySelector(".missions-column"),
    doc.querySelector(".monitor-column"),
    doc.getElementById("missionsPanel"),
    card
  ]) {
    assert.equal(window.getComputedStyle(element).minWidth, "0", "dashboard cards must shrink inside their grid track");
  }
  assert.equal(window.getComputedStyle(card).maxWidth, "100%");
  assert.ok(
    doc.getElementById("testButton").closest(".topbar-controls"),
    "Test lives in the header next to Autopilot"
  );
  assert.match(doc.getElementById("testButton").textContent, /Test all/);
  assert.equal(doc.getElementById("eligibilityRefreshIntervalSeconds").value, "2");
  assert.equal(doc.getElementById("watcherIntervalSeconds").value, "60");
  assert.match(card.querySelector("[data-view='sub']").textContent, /continuous watcher/);

  doc.getElementById("watcherIntervalSeconds").value = "90";
  doc.getElementById("watcherIntervalSeconds").dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(savedSettingsInputs.at(-1).watcherIntervalSeconds, 90);

  // Ready-made setups explain and apply only global timing/media settings.
  const profileSelect = doc.getElementById("configurationProfileSelect");
  assert.deepEqual([...profileSelect.options].map((option) => option.textContent), [
    "Recommended",
    "Low traffic",
    "Scheduled drop"
  ]);
  assert.match(doc.querySelector(".settings-explainer").textContent, /never change products, price caps, quantities, or purchase actions/i);
  profileSelect.value = "built-in:low-traffic";
  profileSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  doc.getElementById("applyConfigurationProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).watcherIntervalSeconds, 300);
  assert.equal(savedSettingsInputs.at(-1).storeNavigationIntervalSeconds, 60);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxPrice, 40);

  // A named custom setup persists its allowlisted numbers, can be applied,
  // and can be deleted without changing the currently applied values.
  doc.getElementById("watcherIntervalSeconds").value = "90";
  doc.getElementById("configurationProfileName").value = "Friday night drop";
  doc.getElementById("saveConfigurationProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const savedProfile = savedSettingsInputs.at(-1).configurationProfiles[0];
  assert.equal(savedProfile.name, "Friday night drop");
  assert.equal(savedProfile.configuration.watcherIntervalSeconds, 90);
  assert.equal("products" in savedProfile.configuration, false);
  assert.equal(profileSelect.value, savedProfile.id);
  assert.equal(doc.getElementById("deleteConfigurationProfileButton").hidden, false);

  doc.getElementById("watcherIntervalSeconds").value = "120";
  doc.getElementById("applyConfigurationProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).watcherIntervalSeconds, 90);

  window.confirm = () => true;
  doc.getElementById("deleteConfigurationProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).configurationProfiles.length, 0);
  assert.equal(profileSelect.options.length, 3);
  assert.equal(doc.getElementById("deleteConfigurationProfileButton").hidden, true);

  // Discord stays out of the dashboard until requested, then opens as the
  // bottom card and shares the Missions/Activity minimize behavior.
  const signalPanel = doc.getElementById("signalPanel");
  const showDiscordButton = doc.getElementById("showDiscordButton");
  assert.equal(signalPanel.hidden, true);
  assert.equal(showDiscordButton.getAttribute("aria-expanded"), "false");
  assert.equal(signalPanel.closest(".monitor-column").lastElementChild, signalPanel);
  showDiscordButton.click();
  assert.equal(doc.getElementById("discordLauncher").hidden, true);
  assert.equal(signalPanel.hidden, false);
  assert.equal(showDiscordButton.getAttribute("aria-expanded"), "true");

  const discordPanelToggle = signalPanel.querySelector(".panel-toggle");
  discordPanelToggle.click();
  assert.equal(signalPanel.classList.contains("is-collapsed"), true);
  assert.equal(discordPanelToggle.getAttribute("aria-expanded"), "false");
  assert.equal(doc.getElementById("signalPanelBody").hidden, true);
  assert.equal(discordPanelToggle.textContent, "Expand");
  discordPanelToggle.click();
  assert.equal(signalPanel.classList.contains("is-collapsed"), false);
  assert.equal(doc.getElementById("signalPanelBody").hidden, false);

  for (const panelId of ["missionsPanel", "activityPanel"]) {
    const panel = doc.getElementById(panelId);
    const toggle = panel.querySelector(".panel-toggle");
    toggle.click();
    assert.equal(panel.classList.contains("is-collapsed"), true);
    toggle.click();
    assert.equal(panel.classList.contains("is-collapsed"), false);
  }

  doc.getElementById("testButton").click();
  doc.getElementById("testButton").click();
  assert.equal(doc.getElementById("testButton").disabled, true);
  assert.equal(doc.getElementById("openAllButton").disabled, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(testEventCalls, 1, "an overlapping Test all click must not enqueue another sweep");
  assert.equal(openProductCalls, 0, "the backend owns the paced all-mission Test run as one atomic action");
  assert.match(doc.getElementById("message").textContent, /Test started for 1 enabled mission/);
  assert.match(doc.getElementById("message").textContent, /nothing will be added/);
  assert.equal(doc.getElementById("testButton").disabled, false);
  assert.equal(doc.getElementById("openAllButton").disabled, false);

  // Arming starts Target/Walmart background-first. It does not need a separate
  // Open all click or keep a product tab open while waiting for likely stock.
  doc.getElementById("autopilotToggle").click();
  assert.equal(doc.getElementById("autopilotToggle").disabled, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 1);
  assert.equal(openBuyListInputs[0]?.backgroundFirst, true);
  assert.equal(savedSettingsInputs.at(-1).automationEnabled, true);
  assert.match(doc.getElementById("message").textContent, /Autopilot ON/);
  assert.match(doc.getElementById("message").textContent, /1 Target\/Walmart watcher armed background-first/);
  assert.match(doc.getElementById("message").textContent, /likely stock signal opens Chrome/);
  assert.equal(doc.getElementById("autopilotToggle").disabled, false);
  doc.getElementById("autopilotToggle").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 1, "turning Autopilot off must not launch another sweep");

  doc.getElementById("openAllButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 2);
  assert.equal(
    Object.keys(openBuyListInputs[1]).length,
    0,
    "manual Open all must keep opening due browser pages immediately"
  );

  // Edit flow: inline editor with values, cancel restores the view card.
  card.querySelector(".mission-edit").click();
  let editCard = doc.querySelector(".mission-edit-card");
  assert.ok(editCard, "expected the inline mission editor");
  assert.equal(editCard.querySelector("[data-field='title']").value, "Booster Box");
  assert.equal(editCard.querySelector("[data-field='howlUrl']"), null);
  assert.equal(editCard.querySelector("[data-field='affiliateUrl']"), null);
  assert.equal(editCard.querySelector(".howl-resolve"), null);
  assert.equal(typeof window.cartAssist.resolveHowlLink, "undefined");
  const settingsBeforeUnsafeCheckout = savedSettingsInputs.length;
  const actionSelect = editCard.querySelector("[data-field='action']");
  const fulfillmentSelect = editCard.querySelector("[data-field='fulfillmentMode']");
  actionSelect.value = "checkout";
  actionSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(editCard.querySelector(".advanced-fields").open, true);
  assert.match(fulfillmentSelect.validationMessage, /Choose Shipping/);
  editCard.querySelector(".mission-done").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.length, settingsBeforeUnsafeCheckout, "unsafe auto-buy fulfillment must fail in the editor");
  assert.ok(doc.querySelector(".mission-edit-card"));
  actionSelect.value = "cart";
  actionSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(fulfillmentSelect.validationMessage, "");
  editCard.querySelector(".mission-cancel").click();

  // Backend-provisioned campaign links expose a one-click copy action without
  // exposing their admin source URL or resolution controls in the mission UI.
  const affiliateReady = snapshotFixture();
  affiliateReady.settings.products[0].affiliateUrl = "https://www.target.com/p/booster/-/A-95298172?nrtv_cid=test&clkid=123";
  pushUpdate(affiliateReady);
  const shareButton = doc.querySelector(".mission-copy-affiliate");
  assert.equal(shareButton.hidden, false);
  assert.match(doc.querySelector(".mission-sub").textContent, /Campaign share ready/);
  shareButton.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(copiedAffiliateUrls.length, 1);

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
  assert.equal(copiedAffiliateUrls.length, 2);

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
  armed.settings.monitoringPaused = false;
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

  // A hard Stop during an armed edit cancels the editor's deferred re-arm.
  pushUpdate(armed);
  const stopDuringEditStart = savedSettingsInputs.length;
  doc.querySelector(".mission-card .mission-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  doc.getElementById("disarmButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  doc.querySelector(".mission-edit-card").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    savedSettingsInputs.slice(stopDuringEditStart).some((input) => input?.automationEnabled === true),
    false,
    "finishing an interrupted edit must not undo Stop"
  );

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
  assert.match(doc.querySelector("[data-view='sub']").textContent, /calendar-gated → blitz/);

  const firedBlitz = snapshotFixture();
  firedBlitz.settings.products[0].executionMode = "blitz";
  pushUpdate(firedBlitz);
  assert.match(doc.querySelector("[data-view='sub']").textContent, /calendar blitz/);

  const uncovered = snapshotFixture();
  uncovered.settings.products[0].openAt = new Date(Date.now() + 3_600_000).toISOString();
  uncovered.settings.products[0].enabled = false;
  pushUpdate(uncovered);
  assert.equal(doc.getElementById("scheduleCoverage").textContent, "0/1 enabled");
  assert.equal(doc.getElementById("enableScheduledButton").hidden, false);
  assert.match(doc.querySelector(".schedule-chip").className, /off/);

  // Persisted eligible events do not replay as alarms. A genuinely new event
  // does, and Silence/Dismiss hide their bars at the CSS rendering layer.
  const historicalAlarm = snapshotFixture();
  historicalAlarm.settings.monitoringPaused = false;
  historicalAlarm.settings.products[0].alertLevel = "alarm";
  historicalAlarm.events = [{
    eventType: "offer-observed",
    productId: "target:95298172",
    retailer: "target",
    sku: "95298172",
    eligible: true,
    firstParty: true,
    price: 31.99,
    timestamp: "2020-01-01T00:00:00.000Z",
    message: "Historical offer"
  }];
  pushUpdate(historicalAlarm);
  assert.equal(doc.getElementById("alarmBar").hidden, true);

  const freshAlarm = structuredClone(historicalAlarm);
  freshAlarm.events[0].timestamp = new Date(Date.now() + 1_000).toISOString();
  freshAlarm.events[0].message = "Fresh offer";
  pushUpdate(freshAlarm);
  assert.equal(doc.getElementById("alarmBar").hidden, false);
  doc.getElementById("silenceAlarmButton").click();
  assert.equal(doc.getElementById("alarmBar").hidden, true);
  assert.equal(window.getComputedStyle(doc.getElementById("alarmBar")).display, "none");

  // The digest bar exists and stays hidden until a real away period ends.
  assert.equal(doc.getElementById("digestBar").hidden, true);
  assert.equal(window.getComputedStyle(doc.getElementById("digestBar")).display, "none");

  // Stop hides either bar immediately and renders the hard-paused state.
  doc.getElementById("alarmBar").hidden = false;
  doc.getElementById("digestBar").hidden = false;
  doc.getElementById("disarmButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.getElementById("alarmBar").hidden, true);
  assert.equal(doc.getElementById("digestBar").hidden, true);
  assert.equal(doc.getElementById("autopilotState").textContent, "STOPPED");

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

  // Bulk import accepts mixed retailer URLs and renders the backend's safe,
  // disabled watch missions without silently enabling a $0 cap.
  doc.getElementById("bulkImportButton").click();
  const bulkDialog = doc.getElementById("bulkImportDialog");
  assert.equal(bulkDialog.hasAttribute("open"), true);
  doc.getElementById("bulkImportText").value = [
    "https://www.target.com/p/item/-/A-1011209279",
    "https://www.walmart.com/ip/item/95163305"
  ].join("\n");
  doc.getElementById("bulkImportSubmitButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(bulkImportInputs.length, 1);
  assert.equal(bulkDialog.hasAttribute("open"), false);
  assert.equal(doc.querySelectorAll(".mission-card").length, 2);
  assert.equal([...doc.querySelectorAll("[data-view='enabled']")].every((input) => !input.checked), true);
  assert.match(doc.getElementById("message").textContent, /2 imported Off for review/);

  window.close();
});
