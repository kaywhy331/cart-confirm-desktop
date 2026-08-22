"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEVICE_REGISTRATION_URL,
  DEVICE_TOKEN_UPDATE_URL,
  applicationServerKeyMatches,
  deviceRegistrationPayload,
  deviceTokenUpdatePayload,
  ensureSilentPushSubscription,
  inspectPagePushSubscription,
  notificationPresentation,
  notificationUrl,
  pushRequiresVisibleNotification,
  registerDeviceInPage,
  registrationOutcome,
  retailerSignalIdentity,
  safeRegistrationDiagnostic,
  signalEnvelopeFromPush,
  trackalackerSignalIdentity,
  updateDeviceTokenInPage,
  vapidApplicationServerKey
} = require("../extension/trackalacker-push");

function fakeSubscription(overrides = {}) {
  const keys = {
    p256dh: Uint8Array.from([1, 2, 3, 4]).buffer,
    auth: Uint8Array.from([5, 6, 7, 8]).buffer
  };
  return {
    endpoint: "https://push.example.invalid/subscriptions/fake-device",
    options: { applicationServerKey: vapidApplicationServerKey() },
    getKey: (name) => keys[name] || null,
    ...overrides
  };
}

test("a real PushSubscription maps to the confirmed nested TrackaLacker device payload", () => {
  const result = deviceRegistrationPayload(fakeSubscription(), "Desktop - Windows - Chrome");
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    device: {
      platform: "web",
      endpoint: "https://push.example.invalid/subscriptions/fake-device",
      p256dh: "AQIDBA==",
      auth: "BQYHCA==",
      nickname: "Desktop - Windows - Chrome"
    }
  });
});

test("a visible extension subscription migrates to silent push and updates only its runtime token", async () => {
  let unsubscribed = false;
  let subscribeOptions = null;
  let current = fakeSubscription({
    endpoint: "https://push.example.invalid/subscriptions/old-device",
    options: { applicationServerKey: vapidApplicationServerKey(), userVisibleOnly: true },
    unsubscribe: async () => {
      unsubscribed = true;
      current = null;
      return true;
    }
  });
  const replacement = fakeSubscription({
    endpoint: "https://push.example.invalid/subscriptions/new-device",
    options: { applicationServerKey: vapidApplicationServerKey(), userVisibleOnly: false }
  });
  const migrated = await ensureSilentPushSubscription({
    getSubscription: async () => current,
    subscribe: async (options) => {
      subscribeOptions = options;
      current = replacement;
      return replacement;
    }
  }, vapidApplicationServerKey());

  assert.equal(unsubscribed, true);
  assert.equal(subscribeOptions.userVisibleOnly, false);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.silent, true);
  assert.equal(migrated.subscription, replacement);
  assert.equal(migrated.previousEndpoint, "https://push.example.invalid/subscriptions/old-device");

  const update = deviceTokenUpdatePayload(migrated.previousEndpoint, migrated.subscription);
  assert.equal(update.ok, true);
  assert.deepEqual(update.payload, {
    device: {
      platform: "web",
      old_endpoint: "https://push.example.invalid/subscriptions/old-device",
      endpoint: "https://push.example.invalid/subscriptions/new-device",
      p256dh: "AQIDBA==",
      auth: "BQYHCA=="
    }
  });

  let request = null;
  const result = await updateDeviceTokenInPage(update.payload, {
    document: { querySelector: () => ({ getAttribute: () => "runtime-csrf-value" }) },
    navigator: { serviceWorker: { getRegistration: async () => null } },
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, redirected: false };
    }
  });
  assert.equal(request.url, DEVICE_TOKEN_UPDATE_URL);
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.headers["X-CSRF-Token"], "runtime-csrf-value");
  assert.deepEqual(JSON.parse(request.options.body), update.payload);
  assert.deepEqual(result, {
    ok: true,
    duplicate: false,
    status: 200,
    code: "updated",
    pageSubscriptionPresent: false
  });
});

test("an existing silent extension subscription is reused without rotation", async () => {
  let subscribed = false;
  const subscription = fakeSubscription({
    options: { applicationServerKey: vapidApplicationServerKey(), userVisibleOnly: false }
  });
  const result = await ensureSilentPushSubscription({
    getSubscription: async () => subscription,
    subscribe: async () => {
      subscribed = true;
      return null;
    }
  }, vapidApplicationServerKey());
  assert.equal(result.ok, true);
  assert.equal(result.silent, true);
  assert.equal(result.subscription, subscription);
  assert.equal(result.previousEndpoint, "");
  assert.equal(subscribed, false);
  assert.equal(pushRequiresVisibleNotification(subscription), false);
  assert.equal(pushRequiresVisibleNotification(fakeSubscription({
    options: { applicationServerKey: vapidApplicationServerKey(), userVisibleOnly: true }
  })), true);
  assert.equal(pushRequiresVisibleNotification(null), true);
});

test("legacy visible-only push retains a safe fallback notification", () => {
  const presentation = notificationPresentation({
    title: "IN STOCK at Walmart!",
    body: "Example product\nin stock for $19.99 (~ MSRP)",
    url: "https://www.walmart.com/ip/12345#offer"
  }, "push:trackalacker:12345678");

  assert.equal(presentation.title, "IN STOCK at Walmart!");
  assert.equal(presentation.options.body.includes("Example product"), true);
  assert.equal(presentation.options.icon, "https://www.trackalacker.com/images/logo.webp");
  assert.equal(presentation.options.tag, "tl-push:trackalacker:12345678");
  assert.equal(presentation.options.requireInteraction, true);
  assert.equal(presentation.options.silent, false);
  assert.equal(presentation.options.data.cartConfirmTrackalacker, true);
  assert.equal(presentation.options.data.url, "https://www.walmart.com/ip/12345");
  assert.equal(notificationUrl("javascript:alert(1)"), "");
  assert.equal(notificationUrl("http://www.trackalacker.com/unsafe"), "");
});

test("missing and incomplete subscriptions fail before registration", () => {
  assert.deepEqual(deviceRegistrationPayload(null, "CartCollect Chrome"), {
    ok: false,
    reason: "missing-subscription"
  });
  assert.deepEqual(deviceRegistrationPayload(fakeSubscription({ getKey: () => null }), "CartCollect Chrome"), {
    ok: false,
    reason: "incomplete-subscription"
  });
});

test("the bundled VAPID key matches the subscription key without replacing it", () => {
  assert.equal(applicationServerKeyMatches(fakeSubscription()), true);
  assert.equal(applicationServerKeyMatches(fakeSubscription({
    options: { applicationServerKey: Uint8Array.from([4, 1, 2, 3]).buffer }
  })), false);
});

test("page subscription discovery exports only its public application-server key", async () => {
  const subscription = fakeSubscription({ endpoint: "PAGE_ENDPOINT_MUST_NOT_ESCAPE" });
  const result = await inspectPagePushSubscription({
    navigator: {
      serviceWorker: {
        getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } })
      }
    },
    btoa
  });
  assert.equal(result.subscriptionPresent, true);
  assert.match(result.applicationServerKey, /^[A-Za-z0-9_-]{80,100}$/);
  assert.equal(JSON.stringify(result).includes("PAGE_ENDPOINT_MUST_NOT_ESCAPE"), false);
  assert.equal(JSON.stringify(result).includes("p256dh"), false);
  assert.equal(JSON.stringify(result).includes("auth"), false);
});

test("HTTP 200 and the confirmed enrollment message are successful", () => {
  assert.deepEqual(registrationOutcome(200, { message: "anything" }), {
    ok: true,
    duplicate: false,
    status: 200,
    code: "enrolled"
  });
  assert.deepEqual(registrationOutcome(201, { message: " Device enrolled successfully! " }), {
    ok: true,
    duplicate: false,
    status: 201,
    code: "enrolled"
  });
});

test("already-enrolled responses are non-fatal while unrelated failures remain failures", () => {
  assert.deepEqual(registrationOutcome(422, { errors: { endpoint: ["has already been taken"] } }), {
    ok: true,
    duplicate: true,
    status: 422,
    code: "already-registered"
  });
  assert.deepEqual(registrationOutcome(401, { error: "sign in required" }), {
    ok: false,
    duplicate: false,
    status: 401,
    code: "http-error"
  });
});

test("the MAIN-world bridge uses the signed-in page state and returns only safe status", async () => {
  let request = null;
  const payload = deviceRegistrationPayload(fakeSubscription(), "CartCollect Chrome").payload;
  const result = await registerDeviceInPage(payload, {
    document: {
      querySelector: () => ({ getAttribute: () => "runtime-csrf-value" })
    },
    navigator: {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: { getSubscription: async () => ({ endpoint: "page-owned-value-never-exported" }) }
        })
      }
    },
    fetch: async (url, options) => {
      request = { url, options };
      return {
        status: 200,
        json: async () => ({ message: "Device enrolled successfully", user: { devices: [] } })
      };
    }
  });

  assert.equal(request.url, DEVICE_REGISTRATION_URL);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.headers["X-CSRF-Token"], "runtime-csrf-value");
  assert.deepEqual(JSON.parse(request.options.body), payload);
  assert.deepEqual(result, {
    ok: true,
    duplicate: false,
    status: 200,
    code: "enrolled",
    pageSubscriptionPresent: true
  });
  assert.equal(JSON.stringify(result).includes("runtime-csrf-value"), false);
  assert.equal(JSON.stringify(result).includes(payload.device.endpoint), false);
  assert.equal(JSON.stringify(result).includes("page-owned-value-never-exported"), false);
});

test("the MAIN-world bridge classifies duplicate enrollment and HTTP failure without response leakage", async () => {
  const payload = deviceRegistrationPayload(fakeSubscription(), "CartCollect Chrome").payload;
  const runtime = (status, responseBody) => ({
    document: { querySelector: () => null },
    navigator: { serviceWorker: { getRegistration: async () => null } },
    fetch: async () => ({ status, json: async () => responseBody })
  });
  assert.deepEqual(
    await registerDeviceInPage(payload, runtime(422, { errors: { endpoint: ["has already been taken"] } })),
    { ok: true, duplicate: true, status: 422, code: "already-registered", pageSubscriptionPresent: false }
  );
  const failure = await registerDeviceInPage(payload, runtime(401, {
    error: "sign in required",
    reflected_endpoint: "MUST_NOT_ESCAPE"
  }));
  assert.deepEqual(failure, {
    ok: false,
    duplicate: false,
    status: 401,
    code: "http-error",
    pageSubscriptionPresent: false
  });
  assert.equal(JSON.stringify(failure).includes("MUST_NOT_ESCAPE"), false);

  const redirected = await registerDeviceInPage(payload, {
    ...runtime(200, { message: "Device enrolled successfully" }),
    fetch: async () => ({
      status: 200,
      redirected: true,
      json: async () => ({ message: "Device enrolled successfully" })
    })
  });
  assert.deepEqual(redirected, {
    ok: false,
    duplicate: false,
    status: 0,
    code: "network-error",
    pageSubscriptionPresent: false
  });
});

test("safe registration diagnostics never echo subscription or authentication material", () => {
  const diagnostic = safeRegistrationDiagnostic({
    ok: false,
    status: 403,
    code: "http-error",
    endpoint: "DO_NOT_LOG_ENDPOINT",
    p256dh: "DO_NOT_LOG_P256DH",
    auth: "DO_NOT_LOG_AUTH",
    message: "DO_NOT_LOG_SESSION"
  });
  assert.equal(diagnostic, "Device registration failed: HTTP 403");
  assert.doesNotMatch(diagnostic, /DO_NOT_LOG/);
});

test("a Web Push payload is reduced to the existing TrackaLacker signal contract", () => {
  const envelope = signalEnvelopeFromPush({
    title: "IN STOCK at Walmart!",
    body: "Example product\nin stock for $19.99 (~ MSRP)\nwww.trackalacker.com",
    data: {
      url: "/products/showcase/example/listings/287632/item?notification_id=DO_NOT_FORWARD&utm_term=12345"
    },
    ignored: { account: "not-forwarded" }
  }, "push:trackalacker:12345678", "2026-08-21T12:00:00.000Z", "extension-id");

  assert.equal(envelope.source.transport, "chrome_extension_web_push");
  assert.equal(envelope.source.domain, "trackalacker.com");
  assert.equal(envelope.notification.title, "IN STOCK at Walmart!");
  assert.equal(envelope.notification.body.includes("Example product"), true);
  assert.equal(envelope.notification.sourceProductId, "12345");
  assert.equal(envelope.notification.sourceListingId, "287632");
  assert.equal(envelope.notification.sourceProductSlug, "example");
  assert.equal(envelope.notification.sourceRetailer, "");
  assert.equal(envelope.notification.sourceRetailerSku, "");
  assert.equal(JSON.stringify(envelope).includes("not-forwarded"), false);
  assert.equal(JSON.stringify(envelope).includes("DO_NOT_FORWARD"), false);
  assert.equal(JSON.stringify(envelope).includes("notification_id"), false);
  assert.equal(JSON.stringify(envelope).includes("utm_term"), false);
  assert.equal(JSON.stringify(envelope).includes("https://"), false);
});

test("signal identity keeps only numeric IDs from a validated TrackaLacker URL", () => {
  assert.deepEqual(trackalackerSignalIdentity(
    "https://www.trackalacker.com/products/showcase/example/listings/287632/item?notification_id=PRIVATE_VALUE&utm_term=12345"
  ), {
    sourceProductId: "12345",
    listingId: "287632",
    productSlug: "example"
  });
  assert.deepEqual(trackalackerSignalIdentity(
    "https://example.com/products/showcase/12345/listings/287632/item?utm_term=12345"
  ), {
    sourceProductId: "",
    listingId: "",
    productSlug: ""
  });
  assert.equal(JSON.stringify(trackalackerSignalIdentity(
    "https://www.trackalacker.com/products/showcase/example?notification_id=PRIVATE_VALUE&utm_term=not-numeric"
  )).includes("PRIVATE_VALUE"), false);
  assert.deepEqual(trackalackerSignalIdentity(
    "https://www.trackalacker.com:444/products/showcase/example?utm_term=12345"
  ), {
    sourceProductId: "",
    listingId: "",
    productSlug: ""
  });
});

test("generic live pushes retain only an exact public product slug or retailer SKU", () => {
  const slugEnvelope = signalEnvelopeFromPush({
    title: "IN STOCK at Target!",
    body: "in stock for $29.99 (At MSRP)",
    url: "https://www.trackalacker.com/products/showcase/pokemon-30th-celebration-elite-trainer-box?notification_id=RUNTIME_ONLY"
  }, "push:trackalacker:slug-identity", "2026-08-21T12:00:00.000Z", "extension-id");
  assert.equal(slugEnvelope.notification.sourceProductSlug, "pokemon-30th-celebration-elite-trainer-box");
  assert.equal(slugEnvelope.notification.sourceProductId, "");
  assert.equal(JSON.stringify(slugEnvelope).includes("RUNTIME_ONLY"), false);
  assert.equal(JSON.stringify(slugEnvelope).includes("notification_id"), false);
  assert.equal(JSON.stringify(slugEnvelope).includes("https://"), false);

  const retailerEnvelope = signalEnvelopeFromPush({
    title: "IN STOCK at Target!",
    body: "in stock for $29.99 (At MSRP)",
    data: {
      url: "https://www.target.com/p/pokemon-box/-/A-1010892076?preselect=1010892076#tracking"
    }
  }, "push:trackalacker:sku-identity", "2026-08-21T12:00:00.000Z", "extension-id");
  assert.equal(retailerEnvelope.notification.sourceRetailer, "target");
  assert.equal(retailerEnvelope.notification.sourceRetailerSku, "1010892076");
  assert.equal(JSON.stringify(retailerEnvelope).includes("target.com"), false);
  assert.deepEqual(retailerSignalIdentity("https://www.walmart.com/ip/item/20754418655?athbdg=tracking"), {
    retailer: "walmart",
    sku: "20754418655"
  });
  assert.deepEqual(retailerSignalIdentity("https://example.com/p/-/A-1010892076"), {
    retailer: "",
    sku: ""
  });
});
