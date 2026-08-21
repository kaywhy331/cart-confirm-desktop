"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
const pushHelper = fs.readFileSync(path.join(root, "extension", "trackalacker-push.js"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "scripts", "build-windows.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const packageJson = require("../package.json");
const manifest = require("../extension/manifest.json");

test("TrackaLacker capture is extension-only and Windows packaging has no native listener", () => {
  assert.equal(packageJson.build.appx, undefined);
  assert.equal(fs.existsSync(path.join(root, "build", "appxmanifest.xml")), false);
  assert.equal(fs.existsSync(path.join(root, "native", "CartCollect.SignalBridge", "Program.cs")), false);
  assert.doesNotMatch(buildScript, /dotnet|SignalBridge|appx/i);
  assert.match(buildScript, /"nsis"/);
  assert.match(buildScript, /"portable"/);
  assert.doesNotMatch(main, /UserNotificationListener|installSignedSignalBridgePackage|downloadSignedAppx/);
  assert.doesNotMatch(renderer, /AppX|signed listener|Windows notification access/i);
});

test("the Chrome extension declares and installs the Web Push runtime", () => {
  assert.equal(manifest.minimum_chrome_version, "121");
  assert.equal(manifest.permissions.includes("notifications"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
  assert.match(background, /importScripts\([\s\S]*?"trackalacker-push\.js"/);
  assert.match(background, /self\.addEventListener\("push"/);
  assert.match(background, /self\.addEventListener\("pushsubscriptionchange"/);
  assert.match(background, /userVisibleOnly: false/);
  assert.doesNotMatch(`${background}\n${pushHelper}`, /\.unsubscribe\s*\(/);
});

test("device enrollment uses only the confirmed same-origin contract and runtime subscription keys", () => {
  assert.match(pushHelper, /subscription\.getKey\("p256dh"\)/);
  assert.match(pushHelper, /subscription\.getKey\("auth"\)/);
  assert.match(pushHelper, /device:\s*\{[\s\S]*?platform: PLATFORM,[\s\S]*?endpoint,[\s\S]*?p256dh,[\s\S]*?auth,[\s\S]*?nickname/);
  assert.match(pushHelper, /https:\/\/www\.trackalacker\.com\/api\/v1\/users\/devices/);
  assert.match(pushHelper, /credentials: "include"/);
  assert.match(pushHelper, /meta\[name="csrf-token"\]/);
  assert.doesNotMatch(pushHelper, /console\.(?:log|debug|info|warn|error)/);
});

test("extension push delivery is pinned to the extension-authenticated local route", () => {
  assert.match(background, /\/trackalacker\/push\/signal/);
  assert.match(background, /"Idempotency-Key": envelope\.signalId/);
  assert.match(background, /"X-Cart-Assist-Token": activeConfig\.token/);
  assert.match(main, /requestUrl\.pathname === "\/trackalacker\/push\/signal"/);
  assert.match(main, /allowedTransports: \["chrome_extension_web_push"\]/);
  assert.ok(main.indexOf("if (!hasAllowedLocalOrigin(req))") < main.indexOf('requestUrl.pathname === "/trackalacker/push/signal"'));
  assert.match(main, /req\.headers\["x-cart-assist-token"\] !== settings\.companionToken/);
});

test("a failed durable receipt remains retryable instead of becoming an in-memory duplicate", () => {
  assert.match(main, /const previousJournal = signalJournal;[\s\S]*?persistSignalJournal\(\);[\s\S]*?signalJournal = previousJournal;[\s\S]*?error\.statusCode = 503/);
  assert.match(main, /\[400, 409, 422, 500, 503\]\.includes\(requestedStatus\)/);
});

test("the renderer offers Chrome push setup without package installation", () => {
  assert.match(renderer, /Connect TrackaLacker push/);
  assert.match(renderer, /Recheck push connection/);
  assert.match(renderer, /without server polling/);
  assert.match(renderer, /elements\.signalBridgeEnabled\.disabled = false/);
});
