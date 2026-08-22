"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
const configProfilesSource = fs.readFileSync(path.join(__dirname, "..", "lib", "config-profiles.js"), "utf8");
const itemDefaultsSource = fs.readFileSync(path.join(__dirname, "..", "lib", "item-defaults.js"), "utf8");
const itemMissionsSource = fs.readFileSync(path.join(__dirname, "..", "lib", "item-missions.js"), "utf8");
const signalsReadinessSource = fs.readFileSync(path.join(__dirname, "..", "lib", "signals-readiness.js"), "utf8");
const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");

function snapshotFixture() {
  return {
    settings: {
      products: [{
        id: "target:95298172",
        retailer: "target",
        title: "Booster Box",
        imageUrl: "https://target.scene7.com/is/image/Target/GUEST_booster",
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
      signalsEnabled: false,
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
      signalStrategies: [],
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
    trackalacker: { version: 2, activeImport: null, items: [], lastImport: null },
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
    app: {
      name: "Cart Confirm",
      version: "0.0.0-test",
      companionPort: 32191,
      extensionPath: "/tmp",
      update: { status: "idle", revision: 0 }
    }
  };
}

test("mission control boots, edits, arms, and filters like the dashboard", async () => {
  const dom = new JSDOM(html, { url: "file:///app/index.html", runScripts: "outside-only" });
  const { window } = dom;
  const localStorageValues = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => localStorageValues.has(key) ? localStorageValues.get(key) : null,
      setItem: (key, value) => localStorageValues.set(key, String(value))
    }
  });
  let pushUpdate = null;
  let pushUpdaterState = null;
  let installUpdateCalls = 0;
  let signalBridgePermissionCalls = 0;
  let signalBridgePermissionResult = { requested: true, ready: true, via: "extension-profile", status: 200 };
  let signalBridgeDeliveryTestCalls = 0;
  let connectCompanionCalls = 0;
  let openProductCalls = 0;
  let openBuyListCalls = 0;
  let openBuyListFailure = null;
  const openBuyListInputs = [];
  let testEventCalls = 0;
  const savedSettingsInputs = [];
  const bulkImportPreviewInputs = [];
  const bulkImportInputs = [];
  const catalogSearchInputs = [];
  const catalogAddInputs = [];
  const trackalackerAddInputs = [];
  const trackalackerHistoryInputs = [];
  const openedTrackalackerSources = [];
  const openedTrackalackerStores = [];
  let catalogClearCalls = 0;
  const acceptedMsrpSuggestionIds = [];
  const copiedAffiliateUrls = [];
  const copiedMissionSelections = [];
  const style = window.document.createElement("style");
  style.textContent = stylesSource;
  window.document.head.append(style);
  window.cartAssist = {
    getSnapshot: async () => snapshotFixture(),
    installUpdate: async () => {
      installUpdateCalls += 1;
      return { status: "cancelled", version: "3.6.0" };
    },
    saveSettings: async (input) => {
      savedSettingsInputs.push(input);
      const next = snapshotFixture();
      next.settings = {
        ...next.settings,
        ...input,
        monitoringPaused: input.automationEnabled || input.signalsEnabled ? false : input.monitoringPaused
      };
      return next;
    },
    previewBulkImport: async (input) => {
      bulkImportPreviewInputs.push(input);
      return {
        summary: { candidates: 2, imported: 2, ready: 0, needsPrice: 2, duplicates: 0, invalid: 0, overCapacity: 0 },
        issues: []
      };
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
    startTrackalackerImport: async () => ({ snapshot: snapshotFixture(), via: "extension-profile" }),
    cancelTrackalackerImport: async () => snapshotFixture(),
    clearTrackalackerImport: async () => snapshotFixture(),
    getTrackalackerPriceHistory: async (itemId, retailer, listingId) => {
      trackalackerHistoryInputs.push({ itemId, retailer, listingId });
      return {
        itemId,
        retailer,
        listingId: retailer === "target" ? "301" : "302",
        entries: retailer === "target" ? [
          { observedAt: "2026-08-20T19:30:00Z", price: 189.99, status: "Price Surge", classification: "surge" },
          { observedAt: "2026-08-20T19:00:00Z", price: 44.99, status: "In Stock", classification: "normal" },
          { observedAt: "2026-08-19T19:00:00Z", price: 49.99, status: "Out of Stock", classification: "normal" },
          { observedAt: "2026-08-18T19:00:00Z", price: 49.99, status: "In Stock", classification: "normal" }
        ] : []
      };
    },
    openTrackalackerSource: async (url, kind) => {
      openedTrackalackerSources.push({ url, kind });
      return { via: "chrome", url };
    },
    openTrackalackerStore: async (url, retailer, sku) => {
      openedTrackalackerStores.push({ url, retailer, sku });
      return { via: "chrome", url };
    },
    addTrackalackerMissions: async (selections, profileId) => {
      trackalackerAddInputs.push({ selections, profileId });
      const next = snapshotFixture();
      const shared = {
        itemId: "trackalacker:12345",
        title: "Pokemon Followed Box",
        imageUrl: "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg",
        quantity: 1,
        action: "watch",
        alertLevel: "standard",
        fulfillmentMode: "shipping",
        itemProfileId: profileId,
        sourceProvider: "trackalacker",
        sourceProductId: "12345",
        sourceUrl: "https://www.trackalacker.com/products/showcase/pokemon-followed-box",
        signalAutoOpen: true,
        signalEntry: "product"
      };
      next.settings.products.push(
        {
          ...shared,
          id: "target:1010892076",
          retailer: "target",
          sku: "1010892076",
          productUrl: "https://www.target.com/p/item/-/A-1010892076",
          maxPrice: 44.99,
          maxOrderTotal: 0,
          enabled: true,
          expectedPriceConfidence: "history",
          sourceListingId: "301",
          sourcePriceSummary: {
            sampleCount: 4,
            trustedSamples: 3,
            surgeSamples: 1,
            latestPrice: 129.99,
            latestClassification: "surge",
            lowestPrice: 44.99,
            highestPrice: 189.99,
            referencePrice: 44.99,
            trend: "up",
            changeAmount: 145
          }
        },
        {
          ...shared,
          id: "walmart:20754418655",
          retailer: "walmart",
          sku: "20754418655",
          productUrl: "https://www.walmart.com/ip/20754418655",
          maxPrice: 49.99,
          maxOrderTotal: 0,
          enabled: false,
          expectedPriceConfidence: "product"
        }
      );
      next.trackalacker = trackalackerPreview.trackalacker;
      return {
        snapshot: next,
        summary: { selectedItems: 1, selectedStores: 2, importedItems: 1, importedStores: 2, ready: 1, needsReview: 1, duplicates: 0, missing: 0, overCapacity: 0 }
      };
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
    connectCompanion: async () => {
      connectCompanionCalls += 1;
      return { connected: true, opened: true, productId: "target:95298172", retailer: "target", via: "chrome" };
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
    requestSignalBridgePermission: async () => {
      signalBridgePermissionCalls += 1;
      return signalBridgePermissionResult;
    },
    testSignalBridgeDelivery: async () => {
      signalBridgeDeliveryTestCalls += 1;
      return { received: true, receivedAt: "2026-08-22T01:00:00.000Z", via: "chrome-extension-web-push" };
    },
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
  window.eval(itemMissionsSource);
  window.eval(signalsReadinessSource);
  window.eval(rendererSource);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const doc = window.document;

  // Connected boot: setup card hidden, one mission view card, fully stopped.
  assert.equal(doc.getElementById("connectCard").hidden, true);
  const card = doc.querySelector(".mission-card");
  assert.ok(card, "expected a mission view card");
  assert.equal(card.querySelector(".status-title").textContent, "Booster Box");
  const imageWrap = card.querySelector("[data-view='imageWrap']");
  const thumbnail = card.querySelector("[data-view='image']");
  const storeName = card.querySelector("[data-view='store']");
  assert.equal(imageWrap.hidden, false);
  assert.equal(thumbnail.src, "https://target.scene7.com/is/image/Target/GUEST_booster");
  assert.ok(
    imageWrap.compareDocumentPosition(storeName) & window.Node.DOCUMENT_POSITION_FOLLOWING,
    "the product thumbnail precedes the store options in the item identity block"
  );
  assert.equal(thumbnail.getAttribute("referrerpolicy"), "no-referrer");
  card.dispatchEvent(new window.Event("mouseenter"));
  assert.equal(doc.getElementById("missionImagePreview").hidden, false);
  assert.equal(doc.getElementById("missionImagePreviewImage").src, thumbnail.src);
  assert.match(doc.getElementById("missionImagePreviewCaption").textContent, /Target · Booster Box/);
  card.dispatchEvent(new window.Event("mouseleave"));
  assert.equal(doc.getElementById("missionImagePreview").hidden, true);
  imageWrap.dispatchEvent(new window.Event("focus"));
  assert.equal(doc.getElementById("missionImagePreview").hidden, false, "keyboard focus also opens the image preview");
  imageWrap.dispatchEvent(new window.Event("blur"));
  assert.equal(doc.getElementById("missionImagePreview").hidden, true);
  assert.equal(card.querySelector(".action-chip").textContent, "ATC");
  assert.equal(card.querySelector(".mission-price-quantity").textContent, "$40 ×1");
  assert.match(card.querySelector(".mission-price-quantity").title, /\$40\.00/);
  assert.equal(doc.getElementById("autopilotState").textContent, "STOPPED");
  assert.match(doc.getElementById("worstCase").textContent, /\$40/);
  assert.equal(doc.getElementById("readinessState").textContent, "Ready");
  assert.equal(doc.getElementById("readinessConnection").textContent, "Chrome connected");
  assert.equal(doc.getElementById("readinessEnabled").textContent, "1 / 1");
  assert.equal(doc.getElementById("readinessExposure").textContent, "$40");
  assert.match(doc.getElementById("readinessSummary").textContent, /1 add-only/);
  assert.equal(doc.getElementById("catalogPanelBody").hidden, true, "secondary catalog setup starts collapsed");
  assert.equal(doc.getElementById("itemDefaultsPanelBody").hidden, true, "secondary defaults start collapsed");
  doc.getElementById("catalogLauncherButton").click();
  assert.equal(doc.getElementById("catalogPanelBody").hidden, false);
  assert.equal(window.localStorage.getItem("cart-confirm:panel:catalogPanelBody"), "expanded");
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
  assert.equal(doc.getElementById("testButton").textContent, "Start monitoring");
  doc.getElementById("testConnectionButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(connectCompanionCalls, 1);
  assert.match(doc.getElementById("message").textContent, /No item was enabled and no monitoring run was started/);
  // The updater control is always visible; without a pending update it
  // offers a manual check instead of hiding.
  assert.equal(doc.getElementById("updateNotice").hidden, false);
  assert.equal(doc.getElementById("updateButton").textContent, "Check for updates");
  assert.equal(doc.getElementById("updateAvailableText").textContent, "");
  pushUpdaterState({ status: "available", version: "3.6.0", revision: 2 });
  assert.equal(doc.getElementById("updateNotice").hidden, false);
  assert.equal(doc.getElementById("updateAvailableText").textContent, "v3.6.0 available");
  assert.equal(doc.getElementById("updateButton").textContent, "Update");
  const staleUpdateSnapshot = snapshotFixture();
  staleUpdateSnapshot.app.update = { status: "checking", revision: 1 };
  pushUpdate(staleUpdateSnapshot);
  assert.equal(doc.getElementById("updateButton").textContent, "Update");
  doc.getElementById("updateButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(installUpdateCalls, 1);
  assert.equal(doc.getElementById("updateButton").textContent, "Update");
  assert.equal(doc.getElementById("updateNotice").hidden, false);
  assert.match(doc.getElementById("message").textContent, /Update postponed/);
  pushUpdaterState({ status: "downloading", version: "3.4.0", percent: 42, revision: 3 });
  assert.equal(doc.getElementById("updateButton").textContent, "Downloading 42%");
  assert.equal(doc.getElementById("updateButton").disabled, true);
  pushUpdaterState({ status: "cancelled", version: "3.4.0", revision: 4 });
  assert.equal(doc.getElementById("updateButton").disabled, false);
  const updateSnapshot = snapshotFixture();
  updateSnapshot.app.update = { status: "available", version: "3.7.0", revision: 5 };
  pushUpdate(updateSnapshot);
  assert.equal(doc.getElementById("updateAvailableText").textContent, "v3.7.0 available");
  pushUpdaterState({ status: "current", currentVersion: "3.7.0", revision: 6 });
  assert.equal(doc.getElementById("updateNotice").hidden, false);
  assert.equal(doc.getElementById("updateAvailableText").textContent, "Up to date (v3.7.0)");
  assert.equal(doc.getElementById("updateButton").textContent, "Check for updates");
  assert.equal(doc.getElementById("eligibilityRefreshIntervalSeconds").value, "2");
  assert.equal(doc.getElementById("watcherIntervalSeconds").value, "60");
  assert.equal(doc.getElementById("walmartQueueCaptureReloads").value, "0");
  assert.match(card.querySelector("[data-view='sub']").textContent, /continuous watcher/);

  // Signal strategies use available mission stores, cumulative MSRP caps,
  // explicit seller policy, and first-match ordering.
  assert.equal(doc.getElementById("signalStrategyCount").textContent, "Legacy mission actions");
  assert.equal(doc.getElementById("addDefaultSignalStrategyButton").hidden, false);
  assert.match(doc.getElementById("addDefaultSignalStrategyButton").textContent, /safe Notify catchall/);
  doc.getElementById("addSignalStrategyButton").click();
  assert.equal(doc.getElementById("signalStrategyDialog").hasAttribute("open"), true);
  const targetStoreChoice = doc.querySelector("#signalStrategyStores input[data-signal-store='target']");
  assert.ok(targetStoreChoice, "Target is pulled from the configured mission stores");
  targetStoreChoice.checked = true;
  doc.getElementById("signalStrategyName").value = "Priority MSRP checkout";
  doc.getElementById("signalStrategyPriceBand").value = "msrp";
  doc.getElementById("signalStrategyAction").value = "prepare_checkout";
  doc.getElementById("signalStrategyQuantity").value = "2";
  doc.getElementById("signalStrategyAllowThirdPartySeller").checked = true;
  doc.getElementById("signalStrategyIncludeKeywords").value = "pokemon + \"booster box\"";
  doc.getElementById("signalStrategyExcludeKeywords").value = "used | refurbished";
  doc.getElementById("signalStrategyForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  let savedStrategies = savedSettingsInputs.at(-1).signalStrategies;
  assert.equal(savedStrategies.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(savedStrategies[0].stores)), ["target"]);
  assert.equal(savedStrategies[0].quantity, 2);
  assert.equal(savedStrategies[0].allowThirdPartySeller, true);
  assert.match(doc.querySelector(".signal-strategy-row").textContent, /Priority MSRP checkout/);
  assert.match(doc.querySelector(".signal-strategy-row").textContent, /At or below MSRP/);
  assert.match(doc.querySelector(".signal-strategy-row").textContent, /Third-party allowed/);
  assert.match(doc.querySelector(".signal-strategy-authorization").textContent, /capped below the requested action/);
  assert.match(doc.querySelector(".signal-strategy-authorization").textContent, /capped below the requested quantity/);
  [...doc.querySelectorAll(".signal-strategy-row button")].find((button) => button.textContent === "Edit").click();
  assert.equal(doc.getElementById("signalStrategyAllowThirdPartySeller").checked, true);
  doc.getElementById("signalStrategyName").value = "Edited MSRP checkout";
  doc.getElementById("signalStrategyForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).signalStrategies[0].name, "Edited MSRP checkout");

  doc.getElementById("addSignalStrategyButton").click();
  doc.getElementById("signalStrategyName").value = "Default notify";
  doc.getElementById("signalStrategyForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.querySelectorAll(".signal-strategy-row").length, 2);
  const secondRow = doc.querySelectorAll(".signal-strategy-row")[1];
  [...secondRow.querySelectorAll("button")].find((button) => button.textContent === "↑").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  savedStrategies = savedSettingsInputs.at(-1).signalStrategies;
  assert.equal(savedStrategies[0].name, "Default notify");
  assert.match(doc.querySelector(".signal-strategy-shadow-warning").textContent, /shadows every enabled strategy below/);
  window.confirm = () => true;
  [...doc.querySelector(".signal-strategy-row").querySelectorAll("button")]
    .find((button) => button.textContent === "Delete").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).signalStrategies.length, 1);

  // Signals review names a missing source, blocks an inert start, and exposes
  // both source configuration and the one-page Chrome repair action.
  const noSignalSource = snapshotFixture();
  noSignalSource.status.companion = "disconnected";
  noSignalSource.signalBridge = {
    enabled: false,
    extensionConnected: false,
    listenerReady: false,
    subscriptionPresent: false,
    mappingCount: 0
  };
  pushUpdate(noSignalSource);
  doc.getElementById("signalsToggle").click();
  assert.equal(doc.getElementById("runReviewSignalsButton").disabled, true);
  assert.match(doc.getElementById("runReviewIssues").textContent, /at least one ready source/);
  assert.equal(doc.getElementById("runReviewConfigureSignalsButton").hidden, false);
  assert.equal(doc.getElementById("runReviewConnectButton").hidden, false);
  doc.getElementById("runReviewCloseButton").click();

  const allOff = snapshotFixture();
  allOff.settings.products[0].enabled = false;
  pushUpdate(allOff);
  doc.getElementById("signalsToggle").click();
  assert.equal(doc.getElementById("runReviewSummary").textContent, "Nothing is ready to run yet.");
  assert.equal(doc.getElementById("runReviewItemsButton").hidden, false);
  assert.equal(doc.getElementById("runReviewItemsButton").textContent, "Choose items to turn on");
  assert.match(doc.getElementById("runReviewIssues").textContent, /Turn on at least one item/);
  doc.getElementById("runReviewCloseButton").click();
  pushUpdate(snapshotFixture());

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

  // Multiple store routes with one itemId render and edit as one item. Store
  // choices are explicit toggles, while price remains store-specific.
  const multiStore = JSON.parse(JSON.stringify(grouped));
  for (const product of multiStore.settings.products.slice(0, 2)) {
    product.itemId = "item:booster";
    product.title = "Booster Box";
    product.enabled = true;
  }
  multiStore.settings.products[1].maxPrice = 42;
  pushUpdate(multiStore);
  assert.equal(doc.querySelectorAll(".mission-card").length, 3);
  const combinedCard = doc.querySelector('[data-item-id="item:booster"]');
  assert.ok(combinedCard);
  assert.equal(combinedCard.querySelectorAll(".item-store-option.selected").length, 2);
  assert.match(combinedCard.querySelector(".mission-price-quantity").textContent, /\$40–\$42/);
  combinedCard.querySelector(".mission-edit").click();
  const multiStoreEditor = doc.querySelector(".mission-edit-card");
  assert.equal([...multiStoreEditor.querySelectorAll(".item-store-picker-option input")].filter((input) => input.checked).length, 2);
  const multiStoreTemplate = multiStoreEditor.querySelector("[data-field='itemProfileId']");
  multiStoreTemplate.value = "built-in:shipping-review";
  multiStoreTemplate.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(doc.getElementById("message").textContent, /2 store options/);
  multiStoreEditor.querySelector(".mission-done").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const savedStoreOptions = savedSettingsInputs.at(-1).products.filter((product) => product.itemId === "item:booster");
  assert.equal(savedStoreOptions.length, 2);
  assert.deepEqual(savedStoreOptions.map((product) => product.action), ["review", "review"]);
  assert.deepEqual(savedStoreOptions.map((product) => product.maxPrice), [40, 42]);
  assert.ok(savedStoreOptions.every((product) => product.maxOrderTotal > product.maxPrice));

  // A full 100-item plan renders in bounded pages instead of creating every
  // row at once. The user can reveal the next page without changing filters.
  const scalePlan = snapshotFixture();
  scalePlan.settings.products = Array.from({ length: 100 }, (_, index) => {
    const sku = String(1_010_000_000 + index);
    return {
      ...scalePlan.settings.products[0],
      itemId: `item:scale:${index}`,
      id: `target:${sku}`,
      sku,
      productUrl: `https://www.target.com/p/item/-/A-${sku}`,
      title: `Scale item ${index + 1}`,
      action: "watch",
      openAt: ""
    };
  });
  pushUpdate(scalePlan);
  assert.equal(doc.querySelectorAll(".mission-card").length, 25);
  assert.match(doc.querySelector(".mission-load-more").textContent, /25 more · 75 remaining/);
  doc.querySelector(".mission-load-more").click();
  assert.equal(doc.querySelectorAll(".mission-card").length, 50);
  assert.match(doc.querySelector(".mission-load-more").textContent, /25 more · 50 remaining/);
  pushUpdate(grouped);

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
  doc.getElementById("planEditButton").click();
  assert.equal(doc.getElementById("missionPlanTools").hidden, false);
  assert.equal(doc.getElementById("planEditButton").textContent, "Finish editing");
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
  doc.getElementById("planEditButton").click();
  assert.equal(doc.getElementById("missionPlanTools").hidden, true);

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
  assert.equal(customItemProfile.settings.action, "watch");
  assert.equal("maxOrderBuffer" in customItemProfile.settings, false);
  assert.equal(doc.getElementById("itemProfileDeleteButton").hidden, false);

  // Choosing a profile inside one mission applies it immediately; there is
  // no second Apply-profile micro-step.
  doc.querySelector(".mission-card .mission-edit").click();
  let profileEditCard = doc.querySelector(".mission-edit-card");
  profileEditCard.querySelector("[data-field='itemProfileId']").value = customItemProfile.id;
  profileEditCard.querySelector("[data-field='itemProfileId']").dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(profileEditCard.querySelector("[data-field='quantity']").value, "2");
  assert.equal(profileEditCard.querySelector("[data-field='action']").value, customItemProfile.settings.action);
  profileEditCard.querySelector(".mission-cancel").click();

  doc.getElementById("itemProfileName").value = "Two shipped updated";
  doc.getElementById("itemProfileForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).itemProfiles.length, 1);
  assert.equal(savedSettingsInputs.at(-1).itemProfiles[0].name, "Two shipped updated");

  const planBaseline = structuredClone(savedSettingsInputs.at(-1));
  doc.getElementById("planEditButton").click();
  doc.getElementById("bulkMissionSelectAllButton").click();
  doc.getElementById("copySelectedMissionListButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(copiedMissionSelections, [["target:95298172"]]);
  assert.match(doc.getElementById("message").textContent, /1 selected item \(1 store route\) copied as a consolidated list/);
  doc.getElementById("bulkItemProfile").value = customItemProfile.id;
  doc.getElementById("applyBulkItemProfileButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].quantity, 2);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxPrice, 40);
  assert.equal(savedSettingsInputs.at(-1).products[0].maxOrderTotal, 0);
  assert.equal(savedSettingsInputs.at(-1).products[0].enabled, true);

  // Updating a reusable profile can refresh every linked mission in the same
  // save after one explicit confirmation.
  doc.getElementById("itemProfileQuantity").value = "3";
  doc.getElementById("itemProfileForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].quantity, 3);
  assert.match(doc.getElementById("message").textContent, /1 linked store option was updated/);

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
  assert.match(doc.getElementById("message").textContent, /1 candidate item scheduled/);
  doc.getElementById("clearSelectedMissionSchedulesButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].openAt, "");

  // Every saved plan mutation is recoverable. Undo restores both the shared
  // schedule and the candidate traffic setup; Revert returns to the session baseline.
  assert.match(doc.getElementById("planChangeCount").textContent, /saved changes/);
  doc.getElementById("planUndoButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].openAt, new Date(candidateOpenAtValue).toISOString());
  assert.equal(savedSettingsInputs.at(-1).scheduledBlitzDurationSeconds, 900);
  doc.getElementById("planUndoButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].openAt, "");
  assert.equal(savedSettingsInputs.at(-1).watcherIntervalSeconds, planBaseline.watcherIntervalSeconds);
  doc.getElementById("bulkDisableMissionsButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].enabled, false);
  doc.getElementById("planRevertButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).products[0].enabled, planBaseline.products[0].enabled);
  assert.equal(savedSettingsInputs.at(-1).products[0].quantity, planBaseline.products[0].quantity);
  assert.equal(savedSettingsInputs.at(-1).products[0].action, planBaseline.products[0].action);
  assert.equal(doc.getElementById("planChangeCount").textContent, "No plan changes yet");
  doc.getElementById("planEditButton").click();

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

  // Extension Web Push is available without Windows package identity. Setup
  // remains explicit and uses a signed-in TrackaLacker Chrome tab.
  const disabledBridge = snapshotFixture();
  disabledBridge.signalBridge = {
    supported: true,
    extensionConnected: true,
    enabled: false,
    helperState: "disabled",
    listenerReady: false,
    subscriptionPresent: false,
    mappingCount: 0,
    pendingSignals: 0,
    latency: {}
  };
  pushUpdate(disabledBridge);
  assert.equal(doc.getElementById("signalBridgeState").textContent, "Disabled");
  assert.equal(doc.getElementById("signalBridgeEnabled").disabled, false);
  assert.equal(doc.getElementById("signalBridgePermissionButton").disabled, true);
  assert.equal(doc.getElementById("signalBridgePermissionButton").textContent, "Connect TrackaLacker push");

  const awaitingBridge = snapshotFixture();
  awaitingBridge.settings.trackalackerSignalBridgeEnabled = true;
  awaitingBridge.signalBridge = {
    supported: true,
    extensionConnected: true,
    enabled: true,
    helperState: "awaiting-page",
    listenerReady: false,
    subscriptionPresent: false,
    mappingCount: 0,
    pendingSignals: 0,
    latency: {}
  };
  pushUpdate(awaitingBridge);
  assert.equal(doc.getElementById("signalBridgeState").textContent, "Needs TrackaLacker tab");
  assert.equal(doc.getElementById("signalBridgeEnabled").disabled, false);
  assert.equal(doc.getElementById("signalBridgePermissionButton").textContent, "Connect TrackaLacker push");
  assert.equal(doc.getElementById("signalBridgePermissionButton").disabled, false);
  assert.equal(doc.getElementById("signalBridgeDeliveryTestButton").disabled, true);
  doc.getElementById("signalBridgePermissionButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(signalBridgePermissionCalls, 1);
  assert.match(doc.getElementById("message").textContent, /enrollment confirmed: HTTP 200/);
  assert.match(doc.getElementById("message").textContent, /Verify browser test/);

  awaitingBridge.signalBridge = {
    supported: true,
    extensionConnected: true,
    enabled: true,
    helperState: "registering",
    listenerReady: false,
    subscriptionPresent: true,
    mappingCount: 0,
    pendingSignals: 0,
    latency: {}
  };
  pushUpdate(awaitingBridge);
  assert.equal(doc.getElementById("signalBridgePermissionButton").textContent, "Connecting TrackaLacker push…");
  assert.equal(doc.getElementById("signalBridgePermissionButton").disabled, true);

  awaitingBridge.signalBridge = {
    ...awaitingBridge.signalBridge,
    helperState: "ready",
    listenerReady: true
  };
  pushUpdate(awaitingBridge);
  assert.equal(doc.getElementById("signalBridgeState").textContent, "Ready");
  assert.equal(doc.getElementById("signalBridgePermissionButton").textContent, "Recheck push connection");
  assert.equal(doc.getElementById("signalBridgeDeliveryTestButton").disabled, false);
  assert.match(doc.getElementById("signalBridgeHint").textContent, /without server polling/);
  doc.getElementById("signalBridgeDeliveryTestButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(signalBridgeDeliveryTestCalls, 1);
  assert.match(doc.getElementById("message").textContent, /end-to-end push delivery is working/i);
  assert.match(doc.getElementById("message").textContent, /no purchase action was allowed/i);
  pushUpdate(snapshotFixture());

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
  assert.match(doc.getElementById("message").textContent, /Monitor-only check started for 1 enabled store option/);
  assert.match(doc.getElementById("message").textContent, /Chrome companion connected automatically/);
  assert.match(doc.getElementById("message").textContent, /nothing will be added/);
  assert.equal(doc.getElementById("testButton").disabled, false);
  assert.equal(doc.getElementById("openAllButton").disabled, false);

  // Starting Autopilot always passes through one structured review, then
  // establishes Chrome automatically and leaves eligible watchers background-first.
  doc.getElementById("autopilotToggle").click();
  assert.equal(doc.getElementById("runReviewDialog").hasAttribute("open"), true);
  assert.equal(openBuyListCalls, 0, "reviewing a run does not start it");
  assert.match(doc.getElementById("runReviewSummary").textContent, /1 item will run across 1 selected store option/);
  assert.equal(doc.getElementById("runReviewMetrics").children.length, 5);
  doc.getElementById("runReviewAutopilotButton").click();
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

  // Signals is a separate event-driven mode: starting it opens no broad item
  // sweep and clearly reports that only exact matches receive authorization.
  doc.getElementById("signalsToggle").click();
  assert.equal(doc.getElementById("runReviewDialog").hasAttribute("open"), true);
  doc.getElementById("runReviewSignalsButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 1, "Signals must not start an Autopilot-style sweep");
  assert.equal(savedSettingsInputs.at(-1).automationEnabled, false);
  assert.equal(savedSettingsInputs.at(-1).signalsEnabled, true);
  assert.equal(doc.getElementById("signalsState").textContent, "ON");
  assert.equal(doc.getElementById("runStateTitle").textContent, "Signals listening");
  assert.match(doc.getElementById("message").textContent, /exact TrackaLacker, browser, or Discord signal/);
  doc.getElementById("signalsToggle").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(savedSettingsInputs.at(-1).signalsEnabled, false);

  doc.getElementById("openAllButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openBuyListCalls, 2);
  assert.equal(
    Object.keys(openBuyListInputs[1]).length,
    0,
    "manual Open all must keep opening due browser pages immediately"
  );
  doc.querySelector(".mission-card .mission-open").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openProductCalls, 1, "the explicit mission Open button uses the backend's validated destination selection");

  openBuyListFailure = new Error("Chrome companion did not connect");
  doc.getElementById("autopilotToggle").click();
  assert.equal(doc.getElementById("runReviewDialog").hasAttribute("open"), true);
  doc.getElementById("runReviewAutopilotButton").click();
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
  assert.equal(editCard.querySelector("[data-field='imageUrl']").value, "https://target.scene7.com/is/image/Target/GUEST_booster");
  assert.equal(editCard.querySelector("[data-field='howlUrl']"), null);
  assert.equal(editCard.querySelector("[data-field='affiliateUrl']"), null);
  const affiliateOpenInput = editCard.querySelector("[data-field='affiliateOpenUrl']");
  assert.ok(affiliateOpenInput, "users can edit the link used only by the explicit mission Open button");
  assert.equal(affiliateOpenInput.value, "");
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
  affiliateOpenInput.value = "https://www.target.com/p/-/A-95298172?afid=user";
  affiliateOpenInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(affiliateOpenInput.validationMessage, "");
  editCard.querySelector(".mission-done").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    savedSettingsInputs.at(-1).products[0].affiliateOpenUrl,
    "https://www.target.com/p/-/A-95298172?afid=user"
  );
  assert.equal(
    savedSettingsInputs.at(-1).products[0].imageUrl,
    "https://target.scene7.com/is/image/Target/GUEST_booster",
    "editing a mission preserves its captured thumbnail"
  );

  // Backend-provisioned campaign links expose a one-click copy action without
  // exposing their admin source URL or resolution controls in the mission UI.
  const affiliateReady = snapshotFixture();
  affiliateReady.settings.products[0].affiliateUrl = "https://www.target.com/p/booster/-/A-95298172?nrtv_cid=test&clkid=123";
  affiliateReady.settings.products[0].affiliateOpenUrl = "https://www.target.com/p/-/A-95298172?afid=user";
  pushUpdate(affiliateReady);
  const shareButton = doc.querySelector(".mission-copy-affiliate");
  assert.equal(shareButton.hidden, false);
  assert.match(doc.querySelector(".mission-sub").textContent, /Campaign share ready/);
  assert.match(doc.querySelector(".mission-sub").textContent, /Custom Open link/);
  assert.match(doc.querySelector(".mission-open").getAttribute("aria-label"), /custom affiliate product link/);
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

  // Armed snapshot: the first edit pauses once, and Done/Cancel keeps the
  // plan session open until the operator deliberately finishes it.
  const armed = snapshotFixture();
  armed.settings.automationEnabled = true;
  armed.settings.monitoringPaused = false;
  pushUpdate(armed);
  assert.equal(doc.getElementById("autopilotState").textContent, "ON");
  assert.equal(doc.querySelector(".mission-card .mission-edit").disabled, false);
  assert.equal(doc.querySelector(".mission-card [data-view='enabled']").disabled, false);
  const planSessionSaveStart = savedSettingsInputs.length;
  doc.querySelector(".mission-card .mission-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const pausedEditor = doc.querySelector(".mission-edit-card");
  assert.ok(pausedEditor, "editing while armed pauses Autopilot and opens the editor");
  pausedEditor.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.querySelector(".mission-edit-card"), null);
  assert.equal(doc.getElementById("autopilotState").textContent, "OFF");
  assert.equal(doc.getElementById("planEditButton").textContent, "Finish editing");
  assert.equal(
    savedSettingsInputs.slice(planSessionSaveStart).filter((input) => input.automationEnabled === false).length,
    1,
    "opening a plan session pauses exactly once"
  );
  assert.equal(
    savedSettingsInputs.slice(planSessionSaveStart).filter((input) => input.automationEnabled === true).length,
    0,
    "closing an individual editor does not re-arm"
  );
  doc.getElementById("planEditButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.getElementById("autopilotState").textContent, "ON");
  assert.equal(
    savedSettingsInputs.slice(planSessionSaveStart).filter((input) => input.automationEnabled === true).length,
    1,
    "finishing the plan session resumes exactly once"
  );

  const signalsArmed = snapshotFixture();
  signalsArmed.settings.signalsEnabled = true;
  signalsArmed.settings.monitoringPaused = false;
  pushUpdate(signalsArmed);
  const signalsEditStart = savedSettingsInputs.length;
  doc.querySelector(".mission-card .mission-edit").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  doc.querySelector(".mission-edit-card").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  doc.getElementById("planEditButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const signalsEditSaves = savedSettingsInputs.slice(signalsEditStart);
  assert.equal(signalsEditSaves.filter((input) => input.signalsEnabled === false).length, 1);
  assert.equal(signalsEditSaves.filter((input) => input.signalsEnabled === true).length, 1);
  assert.equal(signalsEditSaves.some((input) => input.automationEnabled === true), false);
  assert.equal(doc.getElementById("signalsState").textContent, "ON");

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

  const queued = structuredClone(eligible);
  queued.productStatuses["target:95298172"].reason = "retrying";
  queued.productStatuses["target:95298172"].lastMessage = "The eligible offer is waiting for the store lane.";
  pushUpdate(queued);
  const queuedCard = doc.querySelector(".mission-card");
  assert.equal(queuedCard.querySelector(".state-chip").textContent, "Processing");
  assert.match(queuedCard.querySelector(".state-chip").getAttribute("aria-label"), /purchase action queued/i);

  // The drop calendar stays hidden until something is scheduled, then acts
  // as a coverage board with per-chip toggling and batch enabling.
  assert.equal(doc.getElementById("schedulePanel").hidden, true);
  const scheduled = snapshotFixture();
  scheduled.settings.products[0].openAt = new Date(Date.now() + 3_600_000).toISOString();
  pushUpdate(scheduled);
  assert.equal(doc.getElementById("schedulePanel").hidden, false);
  assert.ok(doc.querySelector(".schedule-agenda-item"));
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
  assert.match(doc.querySelector(".schedule-agenda-item").className, /off/);

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
  assert.match(cta.textContent, /first item/);
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
  assert.equal(bulkImportPreviewInputs.length, 1);
  assert.equal(bulkImportInputs.length, 0, "preview does not mutate the item list");
  assert.equal(bulkDialog.hasAttribute("open"), true);
  assert.equal(doc.getElementById("bulkImportSubmitButton").textContent, "Confirm import");
  assert.match(doc.getElementById("bulkImportResult").textContent, /Nothing has been added yet/);
  doc.getElementById("bulkImportSubmitButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(bulkImportInputs.length, 1);
  assert.equal(bulkDialog.hasAttribute("open"), false);
  assert.equal(doc.querySelectorAll(".mission-card").length, 2);
  assert.equal([...doc.querySelectorAll("[data-view='enabled']")].every((input) => !input.checked), true);
  assert.match(doc.getElementById("message").textContent, /2 imported with the default template/);
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
  assert.match(doc.getElementById("message").textContent, /selected template/);
  doc.getElementById("catalogClearButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(catalogClearCalls, 1);
  assert.equal(doc.querySelectorAll(".catalog-card").length, 0);

  // TrackaLacker preview is product-first: one card owns multiple selectable
  // store toggles, source/history links, image, and price-confidence labels.
  const trackalackerPreview = snapshotFixture();
  trackalackerPreview.trackalacker = {
    version: 2,
    activeImport: {
      id: "track-import-1",
      state: "complete",
      captured: 1,
      processed: 1,
      discovered: 1,
      failed: 0,
      message: "Captured 1 followed product."
    },
    lastImport: null,
    items: [{
      id: "trackalacker:12345",
      sourceProductId: "12345",
      sourceUrl: "https://www.trackalacker.com/products/showcase/pokemon-followed-box",
      title: "Pokemon Followed Box",
      imageUrl: "https://static.trackalacker.com/cdn-cgi/image/width=300/item.jpg",
      displayPrice: 49.99,
      otherStores: [{ store: "Best Buy", listingId: "303", historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-followed-box/listings/303/pokemon-followed-box" }],
      stores: [
        {
          id: "target:1010892076",
          retailer: "target",
          sku: "1010892076",
          listingId: "301",
          productUrl: "https://www.target.com/p/item/-/A-1010892076",
          historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-followed-box/listings/301/pokemon-followed-box",
          currentPrice: 189.99,
          expectedPrice: 44.99,
          priceConfidence: "history",
          historySamples: 3,
          historyObservedAt: "2026-08-20T19:00:00Z",
          priceHistorySummary: {
            sampleCount: 4,
            trustedSamples: 3,
            surgeSamples: 1,
            aboveSamples: 0,
            latestPrice: 189.99,
            latestObservedAt: "2026-08-20T19:30:00Z",
            latestPriceChangedAt: "2026-08-20T19:29:00Z",
            latestClassification: "surge",
            lowestPrice: 44.99,
            highestPrice: 189.99,
            normalLowPrice: 44.99,
            normalHighPrice: 49.99,
            referencePrice: 44.99,
            referenceObservedAt: "2026-08-20T19:00:00Z",
            previousPrice: 44.99,
            changeAmount: 145,
            trend: "up"
          },
          alternateCount: 1
        },
        {
          id: "walmart:20754418655",
          retailer: "walmart",
          sku: "20754418655",
          listingId: "302",
          productUrl: "https://www.walmart.com/ip/20754418655",
          historyUrl: "https://www.trackalacker.com/products/showcase/pokemon-followed-box/listings/302/pokemon-followed-box",
          expectedPrice: 49.99,
          priceConfidence: "product",
          historySamples: 0,
          priceHistorySummary: {
            sampleCount: 1,
            trustedSamples: 0,
            surgeSamples: 1,
            aboveSamples: 0,
            latestPrice: 189.99,
            latestObservedAt: "2026-08-20T19:45:00Z",
            latestClassification: "surge",
            lowestPrice: 189.99,
            highestPrice: 189.99,
            referencePrice: null,
            trend: "unknown",
            changeAmount: null
          },
          alternateCount: 0
        }
      ]
    }]
  };
  pushUpdate(trackalackerPreview);
  assert.equal(doc.querySelectorAll(".trackalacker-card").length, 1);
  assert.equal(doc.querySelectorAll(".trackalacker-store-option").length, 2);
  assert.equal([...doc.querySelectorAll(".trackalacker-store-option input")].every((input) => input.checked), true);
  assert.match(doc.querySelector(".trackalacker-card").textContent, /Best Buy/);
  assert.match(doc.querySelector(".trackalacker-card").textContent, /Latest\$189\.99Low\$44\.99High\$189\.99/);
  assert.match(doc.querySelector(".trackalacker-card").textContent, /Surge/);
  const targetHistory = doc.querySelector(".trackalacker-store-option[data-retailer='target'] .trackalacker-price-history");
  targetHistory.open = true;
  targetHistory.dispatchEvent(new window.Event("toggle"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(trackalackerHistoryInputs, [{ itemId: "trackalacker:12345", retailer: "target", listingId: "301" }]);
  assert.equal(targetHistory.querySelectorAll(".trackalacker-history-row").length, 4);
  assert.equal(targetHistory.querySelectorAll(".trackalacker-sparkline").length, 1);
  pushUpdate(trackalackerPreview);
  assert.equal(doc.contains(targetHistory), true, "an unrelated identical update preserves the expanded lazy history");
  assert.equal(targetHistory.open, true);
  doc.querySelector(".trackalacker-title-row .trackalacker-link-button").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(openedTrackalackerSources[0].kind, "product");
  doc.querySelector(".trackalacker-store-links .trackalacker-link-button").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(openedTrackalackerStores[0], {
    url: "https://www.target.com/p/item/-/A-1010892076",
    retailer: "target",
    sku: "1010892076"
  });
  doc.getElementById("trackalackerAddButton").click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(JSON.parse(JSON.stringify(trackalackerAddInputs[0].selections)), [{
    productId: "trackalacker:12345",
    retailers: ["target", "walmart"]
  }]);
  const importedItem = [...doc.querySelectorAll(".mission-card")].find((card) => /Pokemon Followed Box/.test(card.textContent));
  assert.ok(importedItem, "TrackaLacker stores render as one grouped item");
  assert.equal(importedItem.querySelectorAll(".item-store-option.selected").length, 2);
  assert.equal(importedItem.querySelector(".mission-source").hidden, false);
  assert.match(importedItem.textContent, /\$189\.99 latest surge/);

  window.close();
});
