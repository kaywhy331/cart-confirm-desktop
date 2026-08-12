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
  assert.match(productPage, /checking this \$\{isBlitz\(product\) \? "blitz" : "watcher"\} mission every/);
});

test("only pre-eligibility retries request the rapid navigation cadence", () => {
  const retry = section("async function scheduleRetry", "async function clickAction");
  assert.match(retry, /const watcherMode = !isBlitz\(product\)/);
  assert.match(retry, /watcherIntervalSeconds\(\)/);
  assert.match(retry, /cadence === "eligibility"/);
  assert.match(retry, /cadence: eligibilityCadence \? "eligibility" : "normal"/);
  assert.match(retry, /eligibilityRefreshIntervalSeconds/);
  assert.match(retry, /retryIntervalSeconds/);
});

test("continuous watchers requeue after rolling-budget or overload gates", () => {
  const retry = section("async function scheduleRetry", "async function clickAction");
  assert.match(retry, /\["traffic-budget-exhausted", "traffic-overload"\]\.includes\(traffic\.reason\)/);
  assert.match(retry, /if \(watcherMode\)[\s\S]*?retryAt[\s\S]*?void scheduleRetry/);
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

test("calendar ownership blocks scans, retry scheduling, and final retry navigation", () => {
  const retry = section("async function scheduleRetry", "async function clickAction");
  const scan = section("async function scan", "function scheduleScan");
  assert.match(retry, /ScheduleGate\.calendarOwned\(product\)[\s\S]*?clearRetry\(\)/);
  assert.match(retry, /ScheduleGate\.calendarOwned\(nextProduct\)/);
  assert.match(scan, /ScheduleGate\.calendarOwned\(product\)[\s\S]*?calendar-wait/);
});

test("only calendar-fired Target blitz mode uses configurable bounded persistence", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  const cartPage = section("async function handleCartPage", "async function readCheckoutReview");
  assert.match(productPage, /addAction\?\.phase[\s\S]*?Add to cart is already in flight/);
  assert.match(productPage, /recoverTargetAddError\(product, state, error\)/);
  assert.match(productPage, /reserveTargetPersistence\(product, "add"\)[\s\S]*?clickAction\(offer\.addButton, product\)[\s\S]*?markAddAction\(product, "clicked"\)/);
  assert.match(productPage, /scheduleTargetPersistenceNavigation\([\s\S]*?verifying the exact TCIN in the cart[\s\S]*?"cart"/);
  assert.match(cartPage, /TARGET_CART_LINE_CONFIRMATION_WAIT_MS/);
  assert.match(cartPage, /markAddAction\(product, "failed"\)[\s\S]*?scheduleTargetPersistenceNavigation/);
  assert.match(cartPage, /markAddAction\(product, "confirmed"\)/);
  assert.match(source, /product\?\.executionMode === "blitz"/);
  assert.match(source, /config\?\.blitzRetryDelayMs/);
  assert.match(source, /product\.retailer !== "target" \|\| !isBlitz\(product\)/);
});

test("Target retries final submission only after explicit not-placed proof", () => {
  const checkoutPage = section("async function handleCheckoutPage", "async function scan");
  assert.match(checkoutPage, /retryingExplicitSubmissionFailure/);
  assert.match(checkoutPage, /if \(!adapter\.submissionFailure\(document\)\)[\s\S]*?Submission remains locked for manual review/);
  assert.match(checkoutPage, /reserveTargetPersistence\(product, "submit"\)/);
  assert.match(checkoutPage, /explicitly proved that the order was not placed/);
});

test("review and successful checkout missions remain on their authoritative Target result pages", () => {
  const confirmation = section("async function handleConfirmation", "async function handleProductPage");
  const checkoutPage = section("async function handleCheckoutPage", "async function scan");
  const reviewBranch = checkoutPage.slice(
    checkoutPage.indexOf('if (product.action === "review")'),
    checkoutPage.indexOf("const submitButton")
  );
  assert.match(reviewBranch, /send\("review-ready"/);
  assert.match(reviewBranch, /completeProduct\(product\)/);
  assert.doesNotMatch(reviewBranch, /location\.(?:assign|replace|reload)/);
  assert.match(confirmation, /adapter\.orderConfirmed\(document\)/);
  assert.match(confirmation, /send\("order-confirmed"/);
  assert.doesNotMatch(confirmation, /location\.(?:assign|replace|reload)/);
});
