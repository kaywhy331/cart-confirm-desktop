"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const configProfilesSource = fs.readFileSync(path.join(__dirname, "..", "lib", "config-profiles.js"), "utf8");
const itemDefaultsSource = fs.readFileSync(path.join(__dirname, "..", "lib", "item-defaults.js"), "utf8");
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
        groupId: "",
        signalAutoOpen: true,
        signalEntry: "product",
        executionMode: "watcher",
        enabled: true
      }],
      missionGroups: [],
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
      scheduledBlitzDurationSeconds: 120,
      walmartQueueCaptureReloads: 0,
      scheduledOpenEnabled: false,
      scheduledOpenAt: "",
      scheduledRetailer: "target",
      discordEnabled: false,
      discordChannelId: "",
      discordAutoOpen: true,
      configurationProfiles: [],
      msrpCatalog: [],
      itemProfiles: [],
      defaultItemProfileId: "built-in:shipping-watch",
      orderTaxPercent: 12,
      storeOrderAllowances: { target: 30, walmart: 30, amazon: 30 },
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
    catalog: { version: 1, activeSearch: null, items: [] },
    msrpResearch: {
      configured: false,
      credentialUsable: false,
      enabled: false,
      due: true,
      inFlight: false,
      lastRunAt: "",
      lastError: "",
      suggestions: []
    },
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
  let pushUpdaterState = null;
  let checkForUpdatesCalls = 0;
  let openProductCalls = 0;
  let openBuyListCalls = 0;
  let openBuyListFailure = null;
  const openBuyListInputs = [];
  let testEventCalls = 0;
  const savedSettingsInputs = [];
  const bulkImportInputs = [];
  const catalogSearchInputs = [];
  const catalogAddInputs = [];
  let catalogClearCalls = 0;
  const acceptedMsrpSuggestionIds = [];
  const copiedAffiliateUrls = [];
  const copiedMissionSelections = [];
  const style = window.document.createElement("style");
  style.textContent = stylesSource;
  window.document.head.append(style);
  window.cartAssist = {
    getSnapshot: async () => snapshotFixture(),
    checkForUpdates: async () => {
      checkForUpdatesCalls += 1;
      return { status: "current", currentVersion: "0.0.0-test" };
    },
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
        summary: { candidates: 2, imported: 2, ready: 0, needsPrice: 2, duplicates: 0, invalid: 0, overCapacity: 0 },
        issues: []
      };
    },
    searchCatalog: async (input) => {
      catalogSearchInputs.push(input);
      const next = snapshotFixture();
      next.catalog = {
        version: 1,
        activeSearch: {
          id: "catalog-search-1",
          query: input.query,
          retailers: input.retailers,
          filters: { includeWords: [], excludeWords: [], maxPrice: null },
          startedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          status: { amazon: { state: "captured", count: 1, updatedAt: new Date().toISOString() } }
        },
        items: [{
          id: "amazon:B0CAT12345",
          retailer: "amazon",
          sku: "B0CAT12345",
          title: "Pokémon Catalog Box",
          productUrl: "https://www.amazon.com/dp/B0CAT12345",
          price: 44.99,
          observedAt: new Date().toISOString(),
          searchId: "catalog-search-1",
          query: input.query
        }]
      };
      return { snapshot: next, openings: [{ retailer: "amazon", via: "chrome" }] };
    },
    addCatalogMissions: async (selectedIds) => {
      catalogAddInputs.push(selectedIds);
      const next = snapshotFixture();
      next.settings.products.push({
        ...next.settings.products[0],
        id: "amazon:B0CAT12345",
        retailer: "amazon",
        sku: "B0CAT12345",
        title: "Pokémon Catalog Box",
        productUrl: "https://www.amazon.com/dp/B0CAT12345",
        action: "watch",
        maxPrice: 0,
        maxOrderTotal: 0,
        enabled: false
      });
      next.catalog = {
        version: 1,
        activeSearch: null,
        items: [{
          id: "amazon:B0CAT12345",
          retailer: "amazon",
          sku: "B0CAT12345",
          title: "Pokémon Catalog Box",
          productUrl: "https://www.amazon.com/dp/B0CAT12345",
          price: 44.99,
          observedAt: new Date().toISOString(),
          searchId: "catalog-search-1",
          query: "pokemon"
        }]
      };
      return { snapshot: next, summary: { selected: 1, imported: 1, ready: 0, needsPrice: 1, duplicates: 0, missing: 0, overCapacity: 0 } };
    },
    clearCatalog: async () => {
      catalogClearCalls += 1;
      return snapshotFixture();
    },
    acceptMsrpSuggestion: async (suggestionId) => {
      acceptedMsrpSuggestionIds.push(suggestionId);
      const next = snapshotFixture();
      next.settings.msrpCatalog = [window.CartConfirmItemDefaults.normalizeMsrpRecord({
        id: "msrp:pokemon-etb",
        productLine: "Pokémon",
        productType: "Elite Trainer Box",
        matchTerms: ["elite trainer box", "etb"],
        prices: { target: 49.99 },
        sources: {
          target: {
            label: "Target official listing",
            url: "https://www.target.com/p/example",
            verifiedAt: "2026-08-12T12:00:00Z"
          }
        }
      })];
      return next;
    },
    dismissMsrpSuggestion: async () => snapshotFixture(),
    researchMsrp: async () => snapshotFixture(),
    saveMsrpResearchKey: async () => snapshotFixture(),
    removeMsrpResearchKey: async () => snapshotFixture(),
    openResearchSource: async () => "",
    openProduct: async () => {
      openProductCalls += 1;
      return { productId: "target:95298172", via: "companion-tab" };
    },
    openBuyList: async (options = {}) => {
      openBuyListCalls += 1;
      openBuyListInputs.push(options);
      if (openBuyListFailure) throw openBuyListFailure;
      return options.backgroundFirst
        ? { count: 0, background: 0, reused: 0, deduped: 0, scheduled: 0, armed: true, connectionOpened: true, connectionProductId: "target:95298172" }
        : { count: 1, background: 0, reused: 1, deduped: 0, scheduled: 0, armed: false };
    },
    openCart: async () => "",
    openOrders: async () => "",
    copyAffiliateLink: async (input) => {
      copiedAffiliateUrls.push(input.affiliateUrl);
      return input;
    },
    copyMissionList: async (selectedIds) => {
      copiedMissionSelections.push([...selectedIds]);
      return { count: selectedIds.length, text: "copied" };
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
      return { count: 1, reused: 1, deduped: 0, armed: false, connectionOpened: true };
    },
    onUpdate: (callback) => {
      pushUpdate = callback;
      return () => {};
    },
    onUpdaterState: (callback) => {
      pushUpdaterState = callback;
      return () => {};
    }
  };

  window.eval(configProfilesSource);
  window.eval(itemDefaultsSource);
  window.eval(rendererSource);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const doc = window.document;

  // Connected boot: setup card hidden, one mission view card, fully stopped.
  assert.equal(doc.getElementById("connectCard").hidden, true);
  const card = doc.querySelector(".mission-card");
  assert.ok(card, "expected a mission view card");
  assert.equal(card.querySelector(".status-title").textContent, "Booster Box");
  assert.equal(card.querySelector(".action-chip").textContent, "ATC");
  assert.equal(card.querySelector(".mission-price-quantity").textContent, "$40 ×1");
  assert.match(card.querySelector(".mission-price-quantity").title, /\$40\.00/);
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
  doc.getElementById("updateButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(checkForUpdatesCalls, 1);
  assert.equal(doc.getElementById("updateButton").textContent, "Check for updates");
  assert.match(doc.getElementById("message").textContent, /already the newest published version/);
  pushUpdaterState({ status: "downloading", version: "3.4.0", percent: 42 });
  assert.equal(doc.getElementById("updateButton").textContent, "Downloading 42%");
  assert.equal(doc.getElementById("updateButton").disabled, true);
  pushUpdaterState({ status: "cancelled", version: "3.4.0" });
  assert.equal(doc.getElementById("updateButton").disabled, false);
  assert.equal(doc.getElementById("eligibilityRefreshIntervalSeconds").value, "2");
  assert.equal(doc.getElementById("watcherIntervalSeconds").value, "60");
  assert.equal(doc.getElementById("walmartQueueCaptureReloads").value, "0");
  assert.match(card.querySelector("[data-view='sub']").textContent, /continuous watcher/);

  // Dense rows round only their display value; exact caps remain available
  // to assistive technology/tooltips and in the saved mission contract.
  const compactPrice = snapshotFixture();
  compactPrice.settings.products[0].maxPrice = 12.99;
  compactPrice.settings.products[0].quantity = 2;
  pushUpdate(compactPrice);
  assert.equal(doc.querySelector(".mission-price-quantity").textContent, "$13 ×2");
  assert.match(doc.querySelector(".mission-price-quantity").getAttribute("aria-label"), /\$12\.99; quantity 2/);
  for (const button of doc.querySelectorAll(".mission-card button")) {
    assert.ok(button.title, "icon-only mission controls need a tooltip");
    assert.ok(button.getAttribute("aria-label"), "icon-only mission controls need an accessible label");
  }

  // Search, group, retailer, and active/inactive filters compose without
  // mutating the mission list or its purchase settings.
  const grouped = snapshotFixture();
  grouped.settings.missionGroups = [
    { id: "group:launch", name: "Launch night", collapsed: false },
    { id: "group:later", name: "Later", collapsed: false }
  ];
  grouped.settings.products = [
    { ...grouped.settings.products[0], groupId: "group:launch" },
    {
      ...grouped.settings.products[0],
      id: "walmart:123456789",
      retailer: "walmart",
      title: "Walmart Booster",
      productUrl: "https://www.walmart.com/ip/123456789",
      sku: "123456789",
      groupId: "group:launch",
      enabled: false
    },
    {
      ...grouped.settings.products[0],
      id: "amazon:B0ABC12345",
      retailer: "amazon",
      title: "Amazon Booster",
      productUrl: "https://www.amazon.com/dp/B0ABC12345",
      sku: "B0ABC12345",
      groupId: "group:later"
    },
    {
      ...grouped.settings.products[0],
      id: "target:1010892069",
      title: "Target Restock",
      productUrl: "https://www.target.com/p/restocks/A-1010892069",
      sku: "1010892069",
      groupId: "",
      enabled: false
    }
  ];
  pushUpdate(grouped);
  assert.equal(doc.querySelectorAll(".mission-card").length, 4);
  const groupFilter = doc.getElementById("missionGroupFilter");
  const retailerFilter = doc.getElementById("missionRetailerFilter");
  const activeFilter = doc.getElementById("missionActiveFilter");
  groupFilter.value = "group:launch";
  groupFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(doc.querySelectorAll(".mission-card").length, 2);
  retailerFilter.value = "walmart";
  retailerFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  activeFilter.value = "inactive";
  activeFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(doc.querySelectorAll(".mission-card").length, 1);
  assert.equal(doc.querySelector(".mission-card").dataset.productId, "walmart:123456789");
  doc.getElementById("missionSearch").value = "not present";
  doc.getElementById("missionSearch").dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.ok(doc.querySelector(".mission-filter-empty"));
  doc.querySelector(".mission-filter-empty button").click();
  assert.equal(doc.querySelectorAll(".mission-card").length, 4);
  retailerFilter.value = "amazon";
  retailerFilter.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(doc.querySelectorAll(".mission-card").length, 1);
  assert.equal(doc.querySelector(".mission-card").dataset.productId, "amazon:B0ABC12345");
  retailerFilter.value = "all";
  retailerFilter.dispatchEvent(new window.Event("change", { bubbles: true }));

  // Accessible arrows reorder inside the visible group and persist the same
  // underlying array used by drag-and-drop.
  const walmartCard = doc.querySelector('[data-product-id="walmart:123456789"]');
  walmartCard.querySelector(".mission-move-up").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(Array.from(savedSettingsInputs.at(-1).products.slice(0, 2), (product) => product.id), [
    "walmart:123456789",
    "target:95298172"
  ]);

  // Groups can be created, assigned in bulk, collapsed, renamed, and toggled
  // as one unit. Grouping metadata does not alter the mission cap.
  pushUpdate(snapshotFixture());
  window.prompt = () => "Drop night";
  doc.getElementById("newMissionGroupButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const createdGroup = savedSettingsInputs.at(-1).missionGroups[0];
  assert.equal(createdGroup.name, "Drop night");
  doc.getElementById("bulkMissionSelectAllButton").click();
  doc.getElementById("bulkMissionGroup").value = createdGroup.id;
  doc.getElementById("applyBulkMissionGroupButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].groupId, createdGroup.id);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxPrice, 40);
  let groupSection = doc.querySelector(`[data-group-id="${createdGroup.id}"]`);
  assert.equal(groupSection.querySelectorAll(".mission-card").length, 1);
  groupSection.querySelector(".mission-group-collapse").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).missionGroups[0].collapsed, true);
  groupSection = doc.querySelector(`[data-group-id="${createdGroup.id}"]`);
  assert.equal(groupSection.querySelector(".mission-group-body").hidden, true);
  window.prompt = () => "Target launch";
  groupSection.querySelector('.mission-group-actions [aria-label^="Rename"]').click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).missionGroups[0].name, "Target launch");
  groupSection = doc.querySelector(`[data-group-id="${createdGroup.id}"]`);
  groupSection.querySelector(".mission-group-enabled input").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].enabled, false);

  pushUpdate(snapshotFixture());

  doc.getElementById("watcherIntervalSeconds").value = "90";
  doc.getElementById("watcherIntervalSeconds").dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(savedSettingsInputs.at(-1).watcherIntervalSeconds, 90);

  // Ready-made setups explain and apply only global timing/media settings.
  const profileSelect = doc.getElementById("configurationProfileSelect");
  assert.deepEqual([...profileSelect.options].map((option) => option.textContent), [
    "Recommended",
    "Low traffic",
    "Scheduled drop",
    "Midnight candidates"
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
  assert.equal(profileSelect.options.length, 4);
  assert.equal(doc.getElementById("deleteConfigurationProfileButton").hidden, true);

  // Item profiles support create/update/delete and bulk application without
  // changing unselected missions or enabling an unknown zero-dollar cap.
  doc.getElementById("orderTaxPercent").value = "10.25";
  doc.getElementById("targetOrderAllowance").value = "12";
  doc.getElementById("storeAllowanceForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).orderTaxPercent, 10.25);
  assert.equal(savedSettingsInputs.at(-1).storeOrderAllowances.target, 12);
  assert.equal(savedSettingsInputs.at(-1).storeOrderAllowances.walmart, 30);
  assert.equal(savedSettingsInputs.at(-1).storeOrderAllowances.amazon, 30);
  assert.match(doc.getElementById("message").textContent, /final-order caps recalculated/);
  doc.getElementById("itemProfileName").value = "Two shipped";
  doc.getElementById("itemProfileQuantity").value = "2";
  doc.getElementById("itemProfileForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const customItemProfile = savedSettingsInputs.at(-1).itemProfiles[0];
  assert.equal(customItemProfile.name, "Two shipped");
  assert.equal(customItemProfile.settings.quantity, 2);
  assert.equal("maxOrderBuffer" in customItemProfile.settings, false);
  assert.equal(doc.getElementById("itemProfileDeleteButton").hidden, false);

  doc.getElementById("itemProfileName").value = "Two shipped updated";
  doc.getElementById("itemProfileForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).itemProfiles.length, 1);
  assert.equal(savedSettingsInputs.at(-1).itemProfiles[0].name, "Two shipped updated");

  doc.getElementById("bulkMissionSelectAllButton").click();
  doc.getElementById("copySelectedMissionListButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(copiedMissionSelections, [["target:95298172"]]);
  assert.match(doc.getElementById("message").textContent, /1 selected mission copied as a consolidated list/);
  doc.getElementById("bulkItemProfile").value = customItemProfile.id;
  doc.getElementById("applyBulkItemProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].quantity, 2);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxPrice, 40);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxOrderTotal, 100.2);
  assert.equal(savedSettingsInputs.at(-1).products[0].enabled, true);

  // A pre-known candidate set gets one shared calendar gate and a sustained,
  // bounded setup without altering product price, quantity, or action fields.
  const beforeCandidateSchedule = structuredClone(savedSettingsInputs.at(-1).products[0]);
  const candidateOpenAtValue = "2099-01-01T00:00";
  doc.getElementById("bulkMissionOpenAt").value = candidateOpenAtValue;
  doc.getElementById("scheduleCandidateMissionsButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const candidateSchedule = savedSettingsInputs.at(-1);
  assert.equal(candidateSchedule.products[0].openAt, new Date(candidateOpenAtValue).toISOString());
  assert.equal(candidateSchedule.products[0].maxPrice, beforeCandidateSchedule.maxPrice);
  assert.equal(candidateSchedule.products[0].quantity, beforeCandidateSchedule.quantity);
  assert.equal(candidateSchedule.products[0].action, beforeCandidateSchedule.action);
  assert.equal(candidateSchedule.scheduledBlitzDurationSeconds, 900);
  assert.equal(candidateSchedule.eligibilityRefreshIntervalSeconds, 10);
  assert.equal(candidateSchedule.storeNavigationIntervalSeconds, 10);
  assert.equal(profileSelect.value, "built-in:candidate-drop");
  assert.match(doc.getElementById("message").textContent, /1 candidate mission scheduled/);
  doc.getElementById("clearSelectedMissionSchedulesButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].openAt, "");

  doc.getElementById("itemProfileDeleteButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).itemProfiles.length, 0);
  assert.equal(doc.getElementById("itemProfileDeleteButton").hidden, true);

  // Citation acceptance goes through the explicit review control and does
  // not modify the current mission list in the renderer payload.
  const suggested = snapshotFixture();
  suggested.settings.msrpCatalog = [window.CartConfirmItemDefaults.normalizeMsrpRecord({
    id: "msrp:pokemon-etb",
    productLine: "Pokémon",
    productType: "Elite Trainer Box",
    matchTerms: ["elite trainer box", "etb"],
    prices: {}
  })];
  suggested.msrpResearch.suggestions = [{
    id: "suggestion-1",
    recordId: "msrp:pokemon-etb",
    retailer: "target",
    price: 49.99,
    sourceUrl: "https://www.target.com/p/example",
    sourceTitle: "Target official listing",
    rationale: "Current first-party listing",
    researchedAt: "2026-08-12T12:00:00Z",
    model: "gpt-5.6"
  }];
  pushUpdate(suggested);
  const acceptMsrpButton = [...doc.querySelectorAll(".msrp-suggestion button")]
    .find((button) => button.textContent === "Accept MSRP");
  assert.ok(acceptMsrpButton);
  acceptMsrpButton.click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(acceptedMsrpSuggestionIds, ["suggestion-1"]);
  assert.match(doc.querySelector(".mission-card [data-view='priceQuantity']").title, /\$40\.00/);

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
  assert.match(doc.getElementById("message").textContent, /Chrome companion connected automatically/);
  assert.match(doc.getElementById("message").textContent, /nothing will be added/);
  assert.equal(doc.getElementById("testButton").disabled, false);
  assert.equal(doc.getElementById("openAllButton").disabled, false);

  // Arming establishes Chrome automatically, then leaves the remaining
  // Target/Walmart missions background-first without a separate Open all click.
  doc.getElementById("autopilotToggle").click();
  assert.equal(doc.getElementById("autopilotToggle").disabled, true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 1);
  assert.equal(openBuyListInputs[0]?.backgroundFirst, true);
  assert.equal(savedSettingsInputs.at(-1).automationEnabled, true);
  assert.match(doc.getElementById("message").textContent, /Autopilot ON/);
  assert.match(doc.getElementById("message").textContent, /Chrome companion connected automatically/);
  assert.match(doc.getElementById("message").textContent, /authoritative browser validation/);
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

  openBuyListFailure = new Error("Chrome companion did not connect");
  doc.getElementById("autopilotToggle").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 3);
  assert.equal(savedSettingsInputs.at(-1).automationEnabled, false, "a failed automatic connection must disarm Autopilot again");
  assert.match(doc.getElementById("message").textContent, /could not start and was switched back off/);
  openBuyListFailure = null;

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
  const calculatedTotal = editCard.querySelector("[data-field='maxOrderTotal']");
  assert.equal(calculatedTotal.readOnly, true);
  actionSelect.value = "checkout";
  actionSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(calculatedTotal.value, "74.8");
  editCard.querySelector("[data-field='quantity']").value = "2";
  editCard.querySelector("[data-field='quantity']").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(calculatedTotal.value, "119.6");
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

  // A Discord inbox signal is identified as new and prefills the new-install
  // shipping watch-only profile while remaining Off for deliberate review.
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
  assert.equal(editCard.querySelector("[data-field='fulfillmentMode']").value, "shipping");
  assert.equal(editCard.querySelector("[data-field='enabled']").checked, false);
  editCard.querySelector(".mission-cancel").click();
  assert.equal(doc.querySelector(".mission-edit-card"), null);
  assert.ok(doc.querySelector(".mission-card"));

  // New mission defaults to the shipping watch-only profile and stays
  // Off until an approved MSRP or manual cap is applied.
  doc.getElementById("newMissionButton").click();
  editCard = doc.querySelector(".mission-edit-card");
  assert.equal(editCard.querySelector("[data-field='action']").value, "watch");
  assert.equal(editCard.querySelector("[data-field='fulfillmentMode']").value, "shipping");
  assert.equal(editCard.querySelector("[data-field='enabled']").checked, false);
  editCard.querySelector("[data-field='maxPrice']").value = "39.99";
  editCard.querySelector("[data-field='maxPrice']").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(editCard.querySelector("[data-field='maxOrderTotal']").value, "0");
  assert.equal(editCard.querySelector("[data-field='enabled']").checked, true);
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
  assert.equal(liveCard.querySelector(".state-chip").textContent, "Ready");
  assert.match(liveCard.querySelector(".state-chip").getAttribute("aria-label"), /Eligible offer/);
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
  // default-profile missions without silently enabling a $0 cap.
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
  assert.match(doc.getElementById("message").textContent, /2 imported with the default profile/);
  assert.match(doc.getElementById("message").textContent, /2 left Off pending price approval/);

  // A keyword search opens only selected official retailer searches, renders
  // captured listing data, and imports selections with the chosen profile.
  doc.getElementById("catalogQuery").value = "pokemon";
  doc.getElementById("catalogTarget").checked = false;
  doc.getElementById("catalogWalmart").checked = false;
  doc.getElementById("catalogAmazon").checked = true;
  doc.getElementById("catalogSearchForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(Array.from(catalogSearchInputs[0].retailers), ["amazon"]);
  assert.equal(doc.querySelectorAll(".catalog-card").length, 1);
  assert.match(doc.querySelector(".catalog-card").textContent, /Pokémon Catalog Box/);
  assert.match(doc.querySelector(".catalog-card").textContent, /\$44\.99/);
  assert.equal(doc.querySelector(".catalog-card input").checked, true);
  doc.getElementById("catalogAddButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(Array.from(catalogAddInputs[0]), ["amazon:B0CAT12345"]);
  assert.equal(doc.querySelectorAll(".mission-card").length, 2);
  assert.equal([...doc.querySelectorAll(".mission-card")].at(-1).querySelector("[data-view='enabled']").checked, false);
  assert.match(doc.getElementById("message").textContent, /selected profile/);
  doc.getElementById("catalogClearButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(catalogClearCalls, 1);
  assert.equal(doc.querySelectorAll(".catalog-card").length, 0);

  window.close();
});
