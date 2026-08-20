"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");

test("Walmart prep polling is conditional, budgeted, stoppable, and materializes a calendar mission", () => {
  assert.match(main, /reserveStoreAction\("walmart", "background-prep-check"\)/);
  assert.match(main, /conditionalHeaders\(previous\)/);
  assert.match(main, /monitoringOperationActive\(settings, taskEpoch, stopEpoch\)/);
  assert.match(main, /products: \[\.\.\.settings\.products, current\]/);
  assert.match(main, /walmartPrepCandidates: settings\.walmartPrepCandidates\.filter/);
  assert.match(main, /walmartPrepMonitorTick\(\)/);
  const stop = main.slice(main.indexOf('ipcMain.handle("cart-assist:stop-all"'));
  const stopBody = stop.slice(0, stop.indexOf("\n  });") + 6);
  assert.doesNotMatch(stopBody, /walmartPrepCandidates:/, "Stop must preserve the configured prep plan");
  assert.match(main, /runtimeState\.walmartPrepObservations = \{\}/, "Stop must clear prep observations");
});

test("the operator must choose exact catalog items, an item profile, and a drop time", () => {
  assert.match(renderer, /catalogSelectedIds[\s\S]*?startsWith\("walmart:"\)/);
  assert.match(renderer, /catalogItemProfile\.value/);
  assert.match(renderer, /catalogWalmartPrepOpenAt\.value/);
  assert.match(renderer, /walmartPrepCandidates/);
});
