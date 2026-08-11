"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("passive stock refreshes do not consume purchase attempts", () => {
  const retry = section("async function scheduleRetry", "async function clickAction");
  assert.match(retry, /const attempt = currentAttempt\(product\) \+ 1/);
  assert.doesNotMatch(retry, /const attempt\s*=.*requireAttempt/);
  assert.match(retry, /location\.reload\(\)/, "an allowed retry must visibly refresh the retailer page");
});

test("out-of-stock product pages use the normal monitoring retry path", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  assert.match(productPage, /if \(error && error !== "out-of-stock"\)/);
  assert.match(productPage, /scheduleRetry\([\s\S]*?"eligibility"[\s\S]*?\);/);
  assert.match(productPage, /refreshing one waiting mission every/);
});

test("only pre-eligibility retries request the rapid navigation cadence", () => {
  const retry = section("async function scheduleRetry", "async function clickAction");
  assert.match(retry, /cadence === "eligibility"/);
  assert.match(retry, /cadence: eligibilityCadence \? "eligibility" : "normal"/);
  assert.match(retry, /eligibilityRefreshIntervalSeconds/);
  assert.match(retry, /retryIntervalSeconds/);
});

test("unchanged config polling does not rescan and duplicate the same observation", () => {
  const refresh = section("async function refreshConfig", "document.addEventListener");
  assert.match(refresh, /const contextChanged =/);
  assert.match(refresh, /if \(changed \|\| contextChanged\) scheduleScan\(0\)/);
  assert.match(source, /OBSERVATION_DEDUPE_MS = Number\.MAX_SAFE_INTEGER/);
});

test("blocked and retrying workflows release only their pre-submit mission locks", () => {
  const sendEvent = section("async function send", "async function requestConfig");
  assert.match(sendEvent, /LOCK_RELEASING_EVENTS\.has\(eventType\)/);
  assert.match(sendEvent, /CART_CONFIRM_RELEASE_PRODUCT/);
  assert.match(source, /kind === "auth"[\s\S]*?store lane was released/);
});
