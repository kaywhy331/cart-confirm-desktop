"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("Signals projects purchase authority onto exact activated products only", () => {
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  assert.match(main, /const signalPurchaseActive = settings\.signalsEnabled[\s\S]*?Object\.keys\(liveSignalActivations\)\.length > 0/);
  assert.match(main, /enabled: product\.enabled && \(!settings\.signalsEnabled \|\| Boolean\(signalActivation\)\)/);
  assert.match(main, /action: signalActivation\?\.action \|\| automationProduct\.action/);
  assert.match(main, /quantity: strategyQuantity/);
  assert.match(main, /acceptPartial: signalActivation\?\.acceptPartial === true/);
  assert.match(main, /checkoutEvidence: strategyQuantity === automationProduct\.quantity[\s\S]*?automationProduct\.checkoutEvidence[\s\S]*?: null/);
  assert.match(main, /automationEnabled: effectiveAutomationEnabled,[\s\S]*?signalsEnabled: settings\.signalsEnabled/);
  assert.match(background, /function configuredProduct[\s\S]*?candidate\.enabled/);
  assert.match(background, /function automationActive\(config\)[\s\S]*?config\?\.automationEnabled[\s\S]*?config\.monitoringPaused !== true/);
});

test("browser and Discord signals share exact route validation while broad work stays dormant", () => {
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  assert.match(main, /function handleBrowserSignalEvent[\s\S]*?event\.eventType !== "offer-observed"[\s\S]*?event\.eligible !== true/);
  assert.match(main, /handleBrowserSignalEvent[\s\S]*?planSignalRoute[\s\S]*?activateMatchedSignal/);
  assert.match(main, /suppressEligibleOffer: browserSignalDecision\?\.route\?\.reason === "no-strategy"/);
  assert.match(main, /function handleDiscordSignal[\s\S]*?planSignalRoute[\s\S]*?activateMatchedSignal\(signal, route\.product/);
  assert.match(main, /if \(route\.reason === "no-strategy"\) return;/);
  assert.match(main, /if \(settings\.signalsEnabled\) return;[\s\S]*?evaluateProductSchedules/);
  const signalsHandler = renderer.slice(
    renderer.indexOf('elements.signalsToggle.addEventListener'),
    renderer.indexOf('elements.disarmButton.addEventListener')
  );
  assert.match(signalsHandler, /signalsEnabled: true/);
  assert.doesNotMatch(signalsHandler, /openBuyList/);
  assert.match(content, /config\.signalsEnabled && !config\.automationEnabled && result\.eligible[\s\S]*?await offerReport;[\s\S]*?await refreshConfig\(true\);[\s\S]*?scheduleScan\(0\)/);
});
