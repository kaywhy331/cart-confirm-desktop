"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const helper = fs.readFileSync(path.join(root, "native", "CartCollect.SignalBridge", "Program.cs"), "utf8");
const project = fs.readFileSync(path.join(root, "native", "CartCollect.SignalBridge", "CartCollect.SignalBridge.csproj"), "utf8");
const manifest = fs.readFileSync(path.join(root, "build", "appxmanifest.xml"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "scripts", "build-windows.js"), "utf8");
const packageJson = require("../package.json");

test("the signed AppX declares native notification access and opt-in startup", () => {
  assert.match(manifest, /xmlns:uap3="http:\/\/schemas\.microsoft\.com\/appx\/manifest\/uap\/windows10\/3"/);
  assert.match(manifest, /<uap3:Capability Name="userNotificationListener"/);
  assert.match(manifest, /<rescap:Capability Name="runFullTrust"/);
  assert.match(manifest, /Category="windows\.startupTask"/);
  assert.match(manifest, /Executable="app\\resources\\signal-bridge\\CartCollect\.SignalBridge\.exe"/);
  assert.match(manifest, /Enabled="false"/);
  assert.equal(packageJson.build.appx.customManifestPath, "appxmanifest.xml");
  assert.ok(packageJson.build.extraResources.some((resource) => resource.to === "signal-bridge"));
});

test("the Windows helper uses UserNotificationListener and a durable local queue without inventory polling", () => {
  assert.match(project, /net8\.0-windows10\.0\.19041\.0/);
  assert.match(project, /<PublishSingleFile>true<\/PublishSingleFile>/);
  assert.match(helper, /UserNotificationListener\.Current/);
  assert.match(helper, /StartupTask\.GetAsync\("CartCollectSignalBridgeStartup"\)/);
  assert.match(helper, /RequestEnableAsync\(\)/);
  assert.match(helper, /LaunchCartCollectAtLogin/);
  assert.match(helper, /ProcessStartInfo\(executable, "--background"\)/);
  assert.match(helper, /NotificationChanged \+= NotificationChanged/);
  assert.match(helper, /GetNotificationsAsync\(NotificationKinds\.Toast\)/);
  assert.match(helper, /IsGoogleChromeApplication/);
  assert.doesNotMatch(helper, /applicationId\.Contains\("Chrome"/);
  assert.match(helper, /normalized == "trackalacker\.com"/);
  assert.match(helper, /PersistEnvelopeAsync\(envelope\)/);
  assert.match(helper, /\/api\/v1\/signals/);
  assert.match(helper, /Idempotency-Key/);
  assert.match(helper, /ReadAsStringAsync\(\)/);
  assert.match(helper, /\[0, 250, 500, 1_000, 2_000, 5_000\]/);
  assert.match(helper, /OrderBy\(File\.GetCreationTimeUtc\)/);
  assert.doesNotMatch(helper, /walmart\.com|amazon\.com|target\.com/i);
});

test("disabling the bridge waits for the helper mutex before reconciling login startup", () => {
  assert.match(main, /signalBridgeIntentionalStops = new WeakSet/);
  assert.match(main, /stopSignalBridgeProcess\(\{[\s\S]*?afterExit:[\s\S]*?configureSignalBridgeLoginLaunch/);
  assert.match(main, /if \(intentionallyStopped\) \{[\s\S]*?startSignalBridgeProcess\(\)/);
});

test("a failed durable receipt remains retryable instead of becoming an in-memory duplicate", () => {
  assert.match(main, /const previousJournal = signalJournal;[\s\S]*?persistSignalJournal\(\);[\s\S]*?signalJournal = previousJournal;[\s\S]*?error\.statusCode = 503/);
  assert.match(main, /\[400, 409, 422, 500, 503\]\.includes\(requestedStatus\)/);
});

test("native capture activates only for the signed package and the local API bypasses extension-origin checks only after bearer auth", () => {
  assert.match(main, /process\.windowsStore === true/);
  assert.match(main, /Authorization|authorization/);
  assert.match(main, /crypto\.timingSafeEqual/);
  assert.match(main, /"\/api\/v1\/health", "\/api\/v1\/signals"/);
  assert.ok(main.indexOf('["/api/v1/health", "/api/v1/signals"]') < main.indexOf("if (!hasAllowedLocalOrigin(req))"));
  assert.doesNotMatch(main.slice(main.indexOf("function publicSettings"), main.indexOf("function readSignalBridgeStatus")), /signalBridgeToken/);
});

test("Windows builds compile the helper and publish AppX only when signing credentials are present", () => {
  assert.match(buildScript, /dotnet/);
  assert.match(buildScript, /CartCollect\.SignalBridge\.csproj/);
  assert.match(buildScript, /Boolean\(process\.env\.CSC_LINK \|\| process\.env\.WIN_CSC_LINK\)/);
  assert.match(buildScript, /Cart-Confirm-Signals-\$\{version\}-\$\{arch\}\.\$\{ext\}/);
});
