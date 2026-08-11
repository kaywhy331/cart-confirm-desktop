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
  assert.match(source, /quietCheck\(mission, stopEpoch\)/);
  assert.match(source, /actionKind:\s*"background-stock-open"[\s\S]*?resumeMonitoring:\s*false[\s\S]*?stopEpoch:\s*taskEpoch/);
  assert.match(source, /reason:\s*"monitoring-paused"/);
  assert.match(source, /quietMonitorTick\(\);[\s\S]*?if \(settings\.monitoringPaused\) return;[\s\S]*?evaluateProductSchedules/);
  assert.match(contentSource, /if \(!await automationStillActive\(product\)\) return false;[\s\S]*?element\.click\(\)/);
  assert.match(backgroundSource, /function automationActive\(config\)[\s\S]*?config\.monitoringPaused !== true/);
});

test("Test all opens every enabled mission while remaining disarmed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.match(source, /cart-assist:test-event[\s\S]*?if \(settings\.automationEnabled\)[\s\S]*?return openBuyList\(\);/);
  assert.match(source, /async function openBuyList[\s\S]*?planImmediateProductOpenings\(settings, retailer\)[\s\S]*?Promise\.all\(plan\.ready\.map/);
});

test("arming Autopilot launches the due mission sweep automatically", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  assert.match(source, /autopilotToggle[\s\S]*?saveSettings\(\{ \.\.\.saved, automationEnabled: true \}\)[\s\S]*?openBuyList\(\)/);
  assert.match(source, /waiting for[\s\S]*?calendar time/);
});
