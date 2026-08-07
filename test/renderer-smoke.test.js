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
        productUrl: "https://www.target.com/p/restocks/A-95298172",
        sku: "95298172",
        maxPrice: 40,
        maxOrderTotal: 0,
        quantity: 1,
        action: "cart",
        fulfillmentMode: "manual",
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
    retailers: {},
    app: { name: "Cart Confirm", version: "0.0.0-test", companionPort: 32191, extensionPath: "/tmp" }
  };
}

test("the renderer boots the guided-step UI and tracks step state", async () => {
  const dom = new JSDOM(html, { url: "file:///app/index.html", runScripts: "outside-only" });
  const { window } = dom;
  let pushUpdate = null;
  window.cartAssist = {
    getSnapshot: async () => snapshotFixture(),
    saveSettings: async () => snapshotFixture(),
    openProduct: async () => ({ productId: "target:95298172", via: "companion-tab" }),
    openBuyList: async () => ({ count: 1, reused: 1, deduped: 0, armed: false }),
    openCart: async () => "",
    openOrders: async () => "",
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
  assert.equal(doc.querySelectorAll(".product-row").length, 1);
  assert.equal(doc.querySelector("[data-field='title']").value, "Booster Box");
  assert.equal(doc.getElementById("stepConnectState").textContent, "Connected ✓");
  assert.equal(doc.getElementById("stepProductsState").textContent, "Ready ✓");
  assert.equal(doc.getElementById("stepVerifyState").textContent, "Saved — now test");
  assert.equal(doc.getElementById("stepRunState").textContent, "Disarmed");
  assert.match(doc.getElementById("stepConnect").className, /done/);

  // Accordion: connected + saved but untested boots with step 3 expanded and
  // the completed steps collapsed; clicking a header switches cards.
  assert.match(doc.getElementById("stepConnect").className, /collapsed/);
  assert.match(doc.getElementById("stepProducts").className, /collapsed/);
  assert.doesNotMatch(doc.getElementById("stepVerify").className, /collapsed/);
  doc.getElementById("stepProducts").querySelector(".step-header").click();
  assert.doesNotMatch(doc.getElementById("stepProducts").className, /collapsed/);
  assert.match(doc.getElementById("stepVerify").className, /collapsed/);

  doc.getElementById("addProductButton").click();
  assert.equal(doc.querySelectorAll(".product-row").length, 2);
  assert.equal(doc.getElementById("stepVerifyState").textContent, "Save needed");
  assert.match(doc.getElementById("stepVerify").className, /attention/);

  // Companion diagnostics: no hello yet → waiting; stale extension → reload;
  // hello without store-tab heartbeats → open a store tab.
  const waiting = snapshotFixture();
  waiting.status.companion = "waiting";
  pushUpdate(waiting);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Waiting for Chrome");
  assert.equal(doc.getElementById("stepConnectHint").hidden, false);

  const mismatch = snapshotFixture();
  mismatch.status.companion = "waiting";
  mismatch.companionHello = { version: "2.2.0", reason: "version-mismatch", seenAt: "2026-01-01T00:00:00.000Z" };
  pushUpdate(mismatch);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Reload the extension");
  assert.match(doc.getElementById("stepConnectHint").textContent, /v2\.2\.0/);

  const noTab = snapshotFixture();
  noTab.status.companion = "waiting";
  noTab.companionHello = { version: "0.0.0-test", reason: "", seenAt: "2026-01-01T00:00:00.000Z" };
  pushUpdate(noTab);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Open a store tab");

  const noServer = snapshotFixture();
  noServer.status.companion = "waiting";
  noServer.app.companionPort = 0;
  pushUpdate(noServer);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Local server error");
  assert.match(doc.getElementById("stepConnectHint").textContent, /32191/);

  const rejected = snapshotFixture();
  rejected.status.companion = "waiting";
  rejected.serverDiagnostics = {
    lastContactAt: "2026-01-01T00:00:00.000Z",
    rejectedOrigin: "chrome-extension://unexpectedidunexpectedidunexpect",
    rejectedAt: "2026-01-01T00:00:00.000Z",
    configServedAt: ""
  };
  pushUpdate(rejected);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Extension rejected");
  assert.match(doc.getElementById("stepConnectHint").textContent, /unexpectedid/);

  const reportMissing = snapshotFixture();
  reportMissing.status.companion = "waiting";
  reportMissing.serverDiagnostics = {
    lastContactAt: "2026-01-01T00:00:05.000Z",
    rejectedOrigin: "",
    rejectedAt: "",
    configServedAt: "2026-01-01T00:00:05.000Z"
  };
  pushUpdate(reportMissing);
  assert.equal(doc.getElementById("stepConnectState").textContent, "Report missing");

  // An eligible offer while disarmed points at the arming step, and an unread
  // price renders as "Not observed", never "$0.00".
  const eligible = snapshotFixture();
  eligible.productStatuses = {
    "target:95298172": {
      availability: "available",
      eligible: true,
      reason: "eligible",
      observedPrice: 31.99,
      observedOrderTotal: null,
      seller: "",
      firstParty: true,
      cart: "not-confirmed",
      checkout: "not-started",
      order: "not-confirmed",
      attempts: 0,
      lastMessage: "Target has an eligible first-party offer at $31.99."
    }
  };
  pushUpdate(eligible);
  assert.match(doc.querySelector(".product-status-card p").textContent, /arm it in step 4/);

  const unread = snapshotFixture();
  pushUpdate(unread);
  assert.match(doc.querySelector(".status-metric strong").textContent, /Not observed/);

  // A confirmed cart never carries the "nothing was added" hint.
  const confirmed = snapshotFixture();
  confirmed.productStatuses = {
    "target:95298172": {
      ...eligible.productStatuses["target:95298172"],
      cart: "confirmed",
      lastMessage: "The exact Target product was confirmed in the cart."
    }
  };
  pushUpdate(confirmed);
  assert.doesNotMatch(doc.querySelector(".product-status-card p").textContent, /nothing was added/);

  // Arming is a one-click action, not a form field needing a resave.
  assert.equal(doc.getElementById("armButton").disabled, false);
  assert.equal(doc.getElementById("armButton").textContent, "Arm automation");
  const armed = snapshotFixture();
  armed.settings.automationEnabled = true;
  pushUpdate(armed);
  assert.equal(doc.getElementById("armButton").disabled, true);
  assert.equal(doc.getElementById("stepRunState").textContent, "Armed — live");

  // A saved per-product schedule renders as a chip in the week strip with a
  // live countdown to the next opening.
  const scheduled = snapshotFixture();
  scheduled.settings.products[0].openAt = new Date(Date.now() + 3_600_000).toISOString();
  pushUpdate(scheduled);
  const chip = doc.querySelector(".schedule-chip");
  assert.ok(chip, "expected a schedule chip in the week strip");
  assert.match(chip.textContent, /Booster Box/);
  assert.match(doc.getElementById("scheduleNext").textContent, /Next: Booster Box in/);

  window.close();
});
