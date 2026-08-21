"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  companionEventAllowed,
  createAbortRegistry,
  monitoringOperationActive
} = require("../lib/monitoring-control");

test("a Stop epoch invalidates active work and aborts every registered request", () => {
  const running = { automationEnabled: true, monitoringPaused: false };
  assert.equal(monitoringOperationActive(running, 4, 4), true);
  assert.equal(monitoringOperationActive(running, 4, 5), false);
  assert.equal(monitoringOperationActive({ ...running, monitoringPaused: true }, 4, 4), false);
  assert.equal(monitoringOperationActive({ ...running, automationEnabled: false }, 4, 4), false);

  const registry = createAbortRegistry();
  const first = registry.create();
  const second = registry.create();
  assert.equal(registry.size(), 2);
  registry.abortAll();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(registry.size(), 0);
});

test("paused monitoring drops stale tab events but retains connection heartbeats", () => {
  const stopped = { monitoringPaused: true };
  assert.equal(companionEventAllowed(stopped, "heartbeat"), true);
  assert.equal(companionEventAllowed(stopped, "page-observed"), false);
  assert.equal(companionEventAllowed(stopped, "offer-observed"), false);
  assert.equal(companionEventAllowed({ monitoringPaused: false }, "offer-observed"), true);
});

test("the desktop Stop path aborts quiet checks and internal stock opens cannot resume it", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const contentSource = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(source, /quietAbortRegistry\.abortAll\(\)/);
  assert.match(source, /quietCheck\(product, stopEpoch, started\.startToken\)/);
  assert.match(source, /actionKind:\s*"background-stock-open"[\s\S]*?resumeMonitoring:\s*false[\s\S]*?stopEpoch:\s*taskEpoch/);
  assert.match(source, /reason:\s*"monitoring-paused"/);
  assert.match(source, /function startQuietMonitorDispatcher[\s\S]*?setInterval\(quietMonitorTick, QUIET_DISPATCH_TICK_MS\)/);
  assert.match(source, /cart-assist:stop-all[\s\S]*?quietAbortRegistry\.abortAll\(\)[\s\S]*?resetQuietMonitorSchedule/);
  assert.match(contentSource, /if \(!await automationStillActive\(product\)\) return false;[\s\S]*?element\.click\(\)/);
  assert.match(backgroundSource, /function automationActive\(config\)[\s\S]*?config\.monitoringPaused !== true/);
  assert.match(backgroundSource, /resolveProductKnownNoOrder[\s\S]*?if \(config\.automationEnabled \|\| config\.signalsEnabled\) return \{ ok: false, reason: "automation-armed"/);
});

test("quiet public reads cannot consume the browser, cart, or checkout action ledger", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  const reserveQuietRead = source.slice(
    source.indexOf("function reserveQuietRead"),
    source.indexOf("function quietMonitorTick")
  );
  const quietTick = source.slice(
    source.indexOf("function quietMonitorTick"),
    source.indexOf("function startQuietMonitorDispatcher")
  );
  assert.match(reserveQuietRead, /consumeQuietRead/);
  assert.match(reserveQuietRead, /quietReadHistory/);
  assert.doesNotMatch(reserveQuietRead, /reserveStoreAction|storeActionHistory/);
  assert.doesNotMatch(quietTick, /reserveStoreAction/);
  assert.match(source, /actionKind:\s*"background-stock-open"/);
  assert.match(source, /function noteQuietProductFailure[\s\S]*?actionKind:\s*"quiet-unreadable-fallback"[\s\S]*?background:\s*true[\s\S]*?resumeMonitoring:\s*false[\s\S]*?stopEpoch:\s*taskEpoch/);
  assert.match(source, /function noteQuietProductFailure[\s\S]*?lastAutoOpenAt[\s\S]*?QUIET_AUTO_OPEN_COOLDOWN_MS/);
  assert.match(source, /recordQuietEvent\([\s\S]*?activity:\s*previous !== outcome\.availability/);
  assert.match(quietTick, /eventType:\s*"watch-started"/);
  assert.match(source, /function noteQuietProductFailure[\s\S]*?reason:\s*"retrying"[\s\S]*?browser watcher can continue/);
  assert.match(source, /function noteQuietProductFailure[\s\S]*?structural \? 1 : QUIET_PRODUCT_FAILURE_LIMIT/);
  assert.match(source, /noteQuietProductFailure\(currentProduct, taskEpoch, \{ structural: error\?\.code === "unreadable-product" \}\)/);
  assert.match(source, /loaded without readable stock data/);
  assert.match(source, /function noteQuietStoreFailure[\s\S]*?\{ shared: false \}/);
  assert.match(source, /function pauseQuietStore[\s\S]*?options\.shared !== false[\s\S]*?storeOverloadUntil\.set/);
  assert.match(backgroundSource, /const active = OpenRequestTabs\.shouldActivateTab\(request\)[\s\S]*?chrome\.tabs\.update\(tab\.id, \{ url, active \}\)[\s\S]*?if \(active\) await chrome\.windows\.update/);
});

test("Test all opens every enabled mission while remaining disarmed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.match(source, /cart-assist:test-event[\s\S]*?if \(purchaseModeEnabled\(settings\)\)[\s\S]*?return openBuyList\("", \{ ensureCompanion: true \}\);/);
  assert.match(source, /async function openBuyList[\s\S]*?browserProducts = plan\.ready\.filter[\s\S]*?Promise\.all\(productsToOpen\.map/);
});

test("arming Autopilot starts Target and Walmart background-first without changing manual opens", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const rendererSource = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  const openBuyList = mainSource.slice(
    mainSource.indexOf("async function openBuyList"),
    mainSource.indexOf("async function openStorePage")
  );
  assert.match(rendererSource, /autopilotToggle[\s\S]*?saveSettings\(\{ \.\.\.saved, automationEnabled: true, signalsEnabled: false \}\)[\s\S]*?openBuyList\(\{ backgroundFirst: true \}\)/);
  assert.match(mainSource, /cart-assist:open-buy-list[\s\S]*?ensureCompanion: true/);
  assert.match(openBuyList, /ensureCompanion[\s\S]*?ensureCompanionConnection\(plan, prepCandidates\)/);
  assert.match(rendererSource, /waiting for[\s\S]*?calendar time/);
  assert.match(rendererSource, /openAllButton[\s\S]*?openBuyList\(\)/);
  assert.match(openBuyList, /backgroundFirst[\s\S]*?QUIET_STORES\.includes\(product\.retailer\)[\s\S]*?productExecutionMode[\s\S]*?=== "watcher"/);
  assert.match(openBuyList, /backgroundFirst[\s\S]*?recordWatchStarts\(plan\.ready\)/);
  assert.match(openBuyList, /backgroundIds[\s\S]*?browserProducts/);
  assert.match(openBuyList, /background: backgroundProducts\.length/);
  assert.match(rendererSource, /Autopilot could not start and was switched back off/);
});

test("a newly opened retailer tab sends its first companion heartbeat immediately", () => {
  const contentSource = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(contentSource, /await refreshConfig\(true\);[\s\S]*?send\("heartbeat", product[\s\S]*?heartbeat:startup/);
});

test("calendar-owned missions stay out of quiet checks and missed schedules stay locked", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  const scheduleHandler = source.slice(
    source.indexOf("function handleProductSchedule"),
    source.indexOf("function startScheduler")
  );
  assert.match(source, /function extensionConfig[\s\S]*?calendarOwned: productCalendarOwned\(settings, product\)/);
  assert.match(source, /function quietProductEligible[\s\S]*?productCalendarOwned\(settings, product\)/);
  assert.match(source, /function quietProductEligible[\s\S]*?itemHasProtectedProgress\(settings\.products, productStatuses, product\.itemId\)/);
  assert.match(scheduleHandler, /if \(decision\.action === "missed"\)[\s\S]*?return;[\s\S]*?clearProductOpenAt\(decision\.productId\)/);
  assert.match(backgroundSource, /function configuredProduct[\s\S]*?!ScheduleGate\.calendarOwned\(candidate\)/);
});
