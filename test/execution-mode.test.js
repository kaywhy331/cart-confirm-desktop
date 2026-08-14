"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("per-product calendar firing persists blitz context before clearing its gate", () => {
  const handler = section(mainSource, "function handleProductSchedule", "function startScheduler");
  assert.ok(handler.indexOf("activateBlitzExecution(") < handler.indexOf("clearProductOpenAt(decision.productId)"));
  assert.match(handler, /runtimeState\.productScheduleReceipts\[decision\.key\]/);
  assert.match(handler, /parallel: product\.retailer === "walmart"/);
  assert.match(handler, /dedicatedTab: true/);
});

test("legacy store schedule assigns every released product to blitz before disabling the schedule", () => {
  const scheduler = section(mainSource, "function startScheduler", "const gotLock");
  const activation = scheduler.lastIndexOf("activateBlitzExecution(");
  const release = scheduler.indexOf("settings = { ...settings, scheduledOpenEnabled: false }", activation);
  assert.notEqual(activation, -1);
  assert.ok(activation < release);
  assert.match(scheduler, /parallel: scheduledRetailer === "walmart"/);
  assert.match(scheduler, /dedicatedTab: true/);
});

test("desktop and extension configs carry execution mode and timing policy", () => {
  const config = section(mainSource, "function extensionConfig", "function startServerOnPort");
  assert.match(config, /executionMode: context \? "blitz" : "watcher"/);
  assert.match(config, /executionExpiresAt/);
  assert.match(config, /executionCohortId/);
  assert.match(config, /watcherIntervalSeconds/);
  assert.match(config, /blitzRetryDelayMs/);
  assert.match(config, /blitzWindowSeconds/);
  assert.match(config, /scheduledBlitzDurationSeconds/);

  const reservation = section(
    backgroundSource,
    "async function reserveProductTargetPersistence",
    "async function markProductAddAction"
  );
  assert.match(reservation, /windowMs: Number\(config\.blitzWindowSeconds/);
});
