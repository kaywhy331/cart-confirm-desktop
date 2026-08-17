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

test("a qualified purchase cancels stale refresh traffic and retries a busy claim in place", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  assert.match(productPage, /clearNavigationRetry\(\)[\s\S]*?prepareAddAction\(product, offer\)/);
  assert.match(productPage, /\["store-busy", "product-busy"\][\s\S]*?scheduleClaimRetry/);
  assert.doesNotMatch(
    productPage.match(/\["store-busy", "product-busy"\][\s\S]*?return;/)?.[0] || "",
    /scheduleRetry\(/
  );
  assert.match(source, /CART_CONFIRM_CANCEL_NAVIGATION/);
});

test("qualified Add preparation is atomic and held post-mutation blockers are surfaced", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  const background = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(productPage, /void send\("automation-status"[\s\S]*?qualified this exact item[\s\S]*?prepareAddAction\(product, offer\)/);
  assert.match(productPage, /prepared\.held[\s\S]*?releaseLane: false[\s\S]*?will not preempt it/);
  assert.match(productPage, /authorizeAddClick\(product\)[\s\S]*?finalAutomationCheck: false/);
  assert.match(background, /async function prepareProductAddAction[\s\S]*?AutomationState\.claim[\s\S]*?AutomationState\.saveProof[\s\S]*?AutomationState\.beginAddAction[\s\S]*?writeAutomationState\(state\)/);
  assert.match(background, /case "CART_CONFIRM_PREPARE_ADD_ACTION"/);
  assert.match(background, /async function authorizeProductAddClick[\s\S]*?discoverConfig\(true\)[\s\S]*?AutomationState\.authorizeAddClick/);
  assert.match(background, /case "CART_CONFIRM_AUTHORIZE_ADD_CLICK"/);
});

test("unchanged config polling does not rescan and duplicate the same observation", () => {
  const refresh = section("async function refreshConfig", "document.addEventListener");
  assert.match(refresh, /const contextChanged =/);
  assert.match(refresh, /if \(changed \|\| contextChanged\) scheduleScan\(0\)/);
  assert.match(source, /OBSERVATION_DEDUPE_MS = Number\.MAX_SAFE_INTEGER/);
});

test("inactive-tab mutation scans cannot be postponed forever", () => {
  const scheduler = section("function scheduleScan", "async function refreshConfig");
  const observer = section("const observer = new MutationObserver", "observer.observe");
  assert.match(scheduler, /\{ replace = true \} = \{\}/);
  assert.match(scheduler, /if \(scanTimer && !replace\) return/);
  assert.match(scheduler, /scanTimer = null;[\s\S]*?void scan\(\)/);
  assert.match(observer, /scheduleScan\(150, \{ replace: false \}\)/);
  assert.match(
    source,
    /document\.addEventListener\("visibilitychange"[\s\S]*?document\.visibilityState === "visible"[\s\S]*?scheduleScan\(0\)/
  );
});

test("a qualified purchase pulls its exact tab forward through checkout", () => {
  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  const activation = section("function requestPurchaseTabActivation", "function runtimeMessage");
  assert.match(activation, /\["cart", "review", "checkout"\]\.includes\(product\.action\)/);
  assert.match(activation, /lastTabActivationRequestAt < 10_000/);
  assert.match(activation, /CART_CONFIRM_ACTIVATE_TAB/);
  const qualified = section("qualified this exact item", "const prepared = await prepareAddAction");
  assert.match(qualified, /requestPurchaseTabActivation\(product\)/);
  const cartPage = section("async function handleCartPage", "async function handleCheckoutPage");
  assert.match(cartPage, /requestPurchaseTabActivation\(product\)/);
  const checkoutPage = section("async function handleCheckoutPage", "async function scan");
  assert.match(checkoutPage, /requestPurchaseTabActivation\(product\)/);
  assert.match(backgroundSource, /async function activatePurchaseTab[\s\S]*?config\?\.automationEnabled[\s\S]*?chrome\.tabs\.update\(tabId, \{ active: true \}\)[\s\S]*?chrome\.windows\.update\(tab\.windowId, \{ drawAttention: true \}\)/);
  assert.match(backgroundSource, /case "CART_CONFIRM_ACTIVATE_TAB":[\s\S]*?activatePurchaseTab\(sender, String\(message\.productId \|\| ""\)\)/);
});

test("blocked and retrying workflows release only their pre-submit mission locks", () => {
  const sendEvent = section("async function send", "async function requestConfig");
  assert.match(sendEvent, /\["automation-blocked", "store-error", "retry-scheduled"\]\.includes\(eventType\)/);
  assert.match(sendEvent, /CART_CONFIRM_RELEASE_PRODUCT/);
  assert.match(sendEvent, /details\.releaseLane !== false/);
  assert.match(source, /kind === "auth"[\s\S]*?postMutation[\s\S]*?keeps the store lane/);
  assert.match(source, /\["auth", "mfa", "location", "membership"\]\.includes\(interactiveState\)/);
});

test("manual cart holds emit a Notified safety milestone without releasing uncertain state", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  const cartPage = section("async function handleCartPage", "async function readCheckoutReview");
  assert.match(productPage, /add-receipt-uncertain[\s\S]*?return;/);
  assert.match(productPage, /send\("automation-blocked"[\s\S]*?releaseLane: false[\s\S]*?add-receipt-uncertain/);
  assert.match(cartPage, /send\("automation-blocked"[\s\S]*?releaseLane: false[\s\S]*?missing-cart-line-unverifiable/);
  assert.match(cartPage, /send\("automation-blocked"[\s\S]*?releaseLane: false[\s\S]*?cart-add-reservation-pending/);
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
  assert.match(productPage, /reserveTargetPersistence\(product, "add"\)[\s\S]*?clickAction\(offer\.addButton, product,[\s\S]*?markAddAction\(product, "clicked"\)/);
  assert.match(productPage, /scheduleTargetPersistenceNavigation\([\s\S]*?verifying the exact TCIN in the cart[\s\S]*?"cart"/);
  assert.match(cartPage, /TARGET_CART_LINE_CONFIRMATION_WAIT_MS/);
  assert.match(cartPage, /markAddAction\(product, "failed"\)[\s\S]*?scheduleTargetPersistenceNavigation/);
  assert.match(cartPage, /markAddAction\(product, "confirmed"\)/);
  assert.ok(
    cartPage.indexOf("const quantity = await ensureQuantity(product, line)")
      < cartPage.indexOf('markAddAction(product, "confirmed")'),
    "durable cart confirmation must follow readable quantity verification"
  );
  assert.match(source, /product\?\.executionMode === "blitz"/);
  assert.match(source, /config\?\.blitzRetryDelayMs/);
  assert.match(source, /product\.retailer !== "target" \|\| !isBlitz\(product\)/);
});

test("Target waits for Add settlement, reacts to a visible cart-count increase, and accepts explicit zero-cart proof", () => {
  const productPage = section("async function handleProductPage", "async function handleCartPage");
  const cartPage = section("async function handleCartPage", "async function readCheckoutReview");
  assert.match(source, /TARGET_ADD_CONFIRMATION_WAIT_MS = 3_000/);
  assert.match(productPage, /targetCartCountBeforeAdd[\s\S]*?clickAction\(offer\.addButton, product,[\s\S]*?markAddAction\(product, "clicked"\)[\s\S]*?waitForTargetCartCountIncrease/);
  assert.match(productPage, /cart-count-increased[\s\S]*?scheduleTargetPersistenceNavigation\([\s\S]*?"cart"[\s\S]*?0/);
  assert.match(cartPage, /visibleCartCount === 0[\s\S]*?markAddAction\(product, "failed"\)/);
});

test("Target retries final submission only after explicit not-placed proof", () => {
  const checkoutPage = section("async function handleCheckoutPage", "async function scan");
  assert.match(checkoutPage, /retryingExplicitSubmissionFailure/);
  assert.match(checkoutPage, /if \(!adapter\.submissionFailure\(document\)\)[\s\S]*?Submission remains locked for manual review/);
  assert.match(checkoutPage, /reserveTargetPersistence\(product, "submit"\)/);
  assert.match(checkoutPage, /explicitly proved that the order was not placed/);
});

test("review waits durably for trusted manual intent and checkout remains on confirmation", () => {
  const confirmation = section("async function handleConfirmation", "async function handleProductPage");
  const checkoutPage = section("async function handleCheckoutPage", "async function scan");
  const reviewBranch = checkoutPage.slice(
    checkoutPage.indexOf('if (product.action === "review")'),
    checkoutPage.indexOf("const submitButton")
  );
  assert.match(reviewBranch, /send\("review-ready"/);
  assert.match(reviewBranch, /beginManualReview\(product, evidenceHash\)/);
  assert.doesNotMatch(reviewBranch, /completeProduct\(product\)/);
  assert.doesNotMatch(reviewBranch, /location\.(?:assign|replace|reload)/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /markManualSubmit\(product, evidenceHash\)/);
  assert.match(confirmation, /adapter\.orderConfirmed\(document\)/);
  assert.match(confirmation, /send\("order-confirmed"/);
  assert.doesNotMatch(confirmation, /location\.(?:assign|replace|reload)/);
});

test("Walmart queue recognition precedes bounded loser retries through the traffic governor", () => {
  const scan = section("async function scan", "function scheduleScan");
  const retry = section("async function finishQueueCaptureNavigation", "async function handleConfirmation");
  assert.ok(scan.indexOf("handleRetailerQueue(product)") < scan.indexOf("handleQueueCaptureRetry(product)"));
  assert.match(retry, /capture\.winnerProductId === product\.id/);
  assert.match(retry, /QueueCapture\.maxReloads\(config\)/);
  assert.match(retry, /CART_CONFIRM_RESERVE_NAVIGATION/);
  assert.match(retry, /CART_CONFIRM_REVALIDATE_NAVIGATION/);
  assert.match(retry, /CART_CONFIRM_RESERVE_QUEUE_CAPTURE_ATTEMPT[\s\S]*?location\.reload\(\)/);
  assert.doesNotMatch(retry, /sessionStorage/);
  assert.match(retry, /QueueCapture\.PAGE_SETTLE_MS/);
});

test("unknown high-demand pages freeze without refresh or queue-token handling", () => {
  const scan = section("async function scan", "function scheduleScan");
  assert.match(scan, /const highDemandUnknown = Retailers\.unrecognizedHighDemand\(document\)/);
  assert.doesNotMatch(scan, /highDemandUnknown = kind === "other"/);
  assert.match(scan, /unrecognized high-demand or waiting-room page/);
  assert.match(scan, /will not refresh, replay, or manipulate a queue token/);
  assert.doesNotMatch(scan.match(/if \(highDemandUnknown\)[\s\S]*?\} else if \(kind === "product"\)/)?.[0] || "", /location\.(?:assign|replace|reload)/);
});

test("hidden tabs get an alarm-driven heartbeat that beats Chrome timer throttling", () => {
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension", "manifest.json"), "utf8"));

  // The service worker owns the cadence: alarms fire regardless of tab
  // visibility and ping every store tab twice a minute.
  assert.ok(manifest.permissions.includes("alarms"), "manifest must grant the alarms permission");
  assert.match(background, /chrome\.alarms\.create\(BACKGROUND_TICK_ALARM, \{ periodInMinutes: 0\.5 \}\)/);
  assert.match(background, /chrome\.tabs\.sendMessage\(tab\.id, \{ type: "CART_CONFIRM_BACKGROUND_TICK" \}\)/);

  // Every navigation retry is armed through the tracked helper so the
  // heartbeat can fire it once overdue; no site may bypass the bookkeeping.
  assert.doesNotMatch(source.replace(/function armNavigationRetry[\s\S]*?\n  \}/, ""), /retryTimer = setTimeout/);
  assert.match(source, /function armNavigationRetry\(run, delayMs\)/);
  assert.match(source, /function fireOverdueNavigationRetry\(graceMs = 1_000\)/);
  const cleared = section("function clearNavigationRetry", "function clearClaimRetry");
  assert.match(cleared, /retryDue = null;/);

  // The tick only intervenes in hidden tabs: overdue navigation first,
  // otherwise an immediate scan; visible tabs are already unthrottled.
  const tick = section('if (message?.type === "CART_CONFIRM_BACKGROUND_TICK")', 'if (message?.type === "CART_CONFIRM_QUEUE_CAPTURE_CHANGED")');
  assert.match(tick, /document\.visibilityState !== "visible"/);
  assert.match(tick, /const navigated = fireOverdueNavigationRetry\(\);/);
  assert.match(tick, /if \(!navigated && !claimed\) scheduleScan\(0\);/);
});

test("foreground checks stay on the rotated tab and never take OS focus", () => {
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

  // A completed load in a hidden mission tab queues a rotation; unrelated
  // tabs, purchase-stage pages, and paused monitoring never qualify.
  assert.match(background, /changeInfo\.status === "complete"\) void queueForegroundCheck\(tab\)/);
  assert.match(background, /if \(!retailer \|\| OpenRequestTabs\.purchaseStageTab\(retailer, url\)\) return;/);
  assert.match(background, /candidate\?\.enabled && candidate\.retailer === retailer && candidate\.sku === sku/);
  assert.match(background, /if \(!config \|\| config\.monitoringPaused\) return;/);

  // Rotations are serialized and spaced, skip minimized windows, stand down
  // around purchase activations, and never switch away from a cart/checkout
  // page — but once activated, the tab stays (no restore step).
  assert.match(background, /FOREGROUND_CHECK_SPACING_MS = 4_000/);
  assert.match(background, /tabWindow\.state === "minimized"\) return;/);
  assert.match(background, /lastPurchaseActivationAt < 20_000\) return;/);
  assert.match(background, /purchaseStageTab\(Retailers\.detectRetailer\(previousUrl\), previousUrl\)\) return;/);
  const rotation = background.slice(background.indexOf("async function runForegroundCheck"));
  const rotationBody = rotation.slice(0, rotation.indexOf("\n}"));
  assert.doesNotMatch(rotationBody, /chrome\.windows\.update\(/, "rotation must never change window focus or stacking");
  assert.doesNotMatch(rotationBody, /FOREGROUND_CHECK_DWELL_MS|previous\.id, \{ active: true \}/, "no dwell/restore step");

  // The purchase flow activates its tab and asks for taskbar attention, but
  // never steals OS focus from whatever the user is working in.
  assert.match(background, /chrome\.windows\.update\(tab\.windowId, \{ drawAttention: true \}\)/);
  assert.doesNotMatch(background, /focused: true/);

  // The purchase-flow activation stamps the shared stand-down clock.
  assert.match(background, /foregroundCheckState\.lastPurchaseActivationAt = Date\.now\(\);\s*\n\s*return \{ ok: true, activated: !tab\.active \};/);

  // Hidden tabs also hold a shared web lock to escape intensive throttling.
  assert.match(source, /navigator\.locks\.request\("cart-confirm-keepalive", \{ mode: "shared" \}/);
});

test("the service worker survives a stale-manifest restart mid-update", () => {
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

  // Every capitalized helper namespace dereferenced in the worker must be
  // bound from globalThis — an unbound one (like the 3.6.4 Retailers bug)
  // throws at first use and silently disables its feature.
  const builtIns = new Set([
    "Array", "Boolean", "Date", "Error", "JSON", "Math", "Number", "Object",
    "Promise", "RegExp", "Set", "Map", "String", "URL", "URLSearchParams", "Infinity", "NaN"
  ]);
  const used = new Set([...background.matchAll(/\b([A-Z][A-Za-z]+)\.[a-zA-Z_$]/g)].map((match) => match[1]));
  for (const name of used) {
    if (builtIns.has(name)) continue;
    assert.match(
      background,
      new RegExp(`const ${name} = globalThis\\.CartConfirm`),
      `${name} is dereferenced in background.js but never bound from globalThis`
    );
  }

  // A restarting worker can run this file under the previous cached manifest
  // (no alarms permission) while a desktop update swaps the unpacked files.
  // The alarm heartbeat must degrade gracefully instead of throwing at the
  // top level and killing every listener registered after it.
  assert.match(background, /if \(chrome\.alarms\?\.create && chrome\.alarms\?\.onAlarm\) \{/);
  assert.doesNotMatch(background, /^chrome\.alarms\.create/m);
});

test("Stop everything and re-arming clear quiet-lane residue and held lanes retry", () => {
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");

  // Stale lastAutoOpenAt / quarantines otherwise suppress the Chrome fallback
  // for minutes after Stop → re-arm, which reads as missions refusing to open.
  assert.match(main, /function resetQuietProductState\(\) \{[\s\S]*?lastAvailability\.clear\(\);[\s\S]*?productFailures\.clear\(\);[\s\S]*?productQuarantineUntil\.clear\(\);[\s\S]*?storeFailureProducts\.clear\(\);[\s\S]*?lastAutoOpenAt\.clear\(\);[\s\S]*?\}/);
  const stopAll = main.slice(main.indexOf('ipcMain.handle("cart-assist:stop-all"'));
  assert.match(stopAll.slice(0, 800), /resetQuietProductState\(\);/);
  const armBranch = main.slice(main.indexOf("if (normalized.automationEnabled && !wasArmed) {"));
  assert.match(armBranch.slice(0, 400), /resetQuietProductState\(\);/);

  // A verified offer facing a held purchase lane keeps re-checking instead of
  // standing down forever, and the heartbeat fires overdue claim retries in
  // hidden tabs so back-to-back ready products recover automatically.
  const heldBranch = section('&& prepared.held) {', '} else if (["store-busy", "product-busy"].includes(prepared.reason)) {');
  assert.match(heldBranch, /scheduleClaimRetry\(product, /);
  assert.match(source, /function fireOverdueClaimRetry\(graceMs = 1_000\)/);
  const tick = section('if (message?.type === "CART_CONFIRM_BACKGROUND_TICK")', 'if (message?.type === "CART_CONFIRM_QUEUE_CAPTURE_CHANGED")');
  assert.match(tick, /fireOverdueClaimRetry\(\)/);
  const clearClaim = section("function clearClaimRetry", "function fireOverdueClaimRetry");
  assert.match(clearClaim, /claimRetryDue = null;/);
});

test("both claim paths heal a stranded confirmed cart hold before giving up", () => {
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

  const heal = background.slice(
    background.indexOf("function healStrandedCartHold"),
    background.indexOf("async function claimProduct")
  );
  // Only a held store/product lane whose blocker sits at the cart-confirmed
  // phase qualifies, and a configured blocker must be a cart-action mission —
  // review/checkout holds are never finalized from here.
  assert.match(heal, /claimResult\.held !== true/);
  assert.match(heal, /claimResult\.blockingPhase !== "cart-confirmed"/);
  assert.match(heal, /if \(blocker && blocker\.action !== "cart"\) return false;/);
  assert.match(heal, /AutomationState\.complete\(state, blocker \|\| \{ id: blockerId, action: "cart" \}, now\)/);

  // Both the claim wrapper and the add-preparation wrapper retry once after
  // healing, inside the same state lock and durable write.
  assert.equal((background.match(/if \(healStrandedCartHold\(state, config, /g) || []).length, 2);
  assert.equal((background.match(/= AutomationState\.claim\(state, product, ownerId, now\);/g) || []).length, 4);
});

test("a completed mission's cart tab goes quiet instead of alarming and re-activating", () => {
  const root = path.join(__dirname, "..");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");

  // The cart handler checks completion BEFORE any activation or cart-reached
  // alarm, so a finished mission parked on its cart page stops harassing the
  // operator and stops pinning the rotation stand-down clock.
  const cartPage = section("async function handleCartPage", "const inventory = adapter.cartInventory(document);");
  const completedGate = cartPage.indexOf("if (addState.ok && addState.completed) return;");
  const activation = cartPage.indexOf("requestPurchaseTabActivation(product);");
  const cartReached = cartPage.indexOf('send("cart-reached"');
  assert.ok(completedGate > 0, "cart handler must gate on completion");
  assert.ok(completedGate < activation, "completion gate must precede tab activation");
  assert.ok(completedGate < cartReached, "completion gate must precede the cart alarm");

  // Activation requests carry the product id, and the worker refuses them
  // for completed missions even if a stale content script still asks.
  assert.match(source, /CART_CONFIRM_ACTIVATE_TAB", productId: product\.id/);
  assert.match(background, /return activatePurchaseTab\(sender, String\(message\.productId \|\| ""\)\);/);
  assert.match(background, /if \(state\.completed\?\.\[productId\]\) return \{ ok: false, reason: "completed" \};/);
});

