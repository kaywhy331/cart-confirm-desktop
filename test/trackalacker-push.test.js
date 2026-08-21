"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEVICE_REGISTRATION_URL,
  applicationServerKeyMatches,
  deviceRegistrationPayload,
  inspectPagePushSubscription,
  registerDeviceInPage,
  registrationOutcome,
  safeRegistrationDiagnostic,
  signalEnvelopeFromPush,
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
  const result = deviceRegistrationPayload(fakeSubscription(), "CartCollect Chrome extension v3.8.2");
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    device: {
      platform: "web",
      endpoint: "https://push.example.invalid/subscriptions/fake-device",
      p256dh: "AQIDBA==",
      auth: "BQYHCA==",
      nickname: "CartCollect Chrome extension v3.8.2"
    }
  });
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
    data: { url: "/products/showcase/example" },
    ignored: { account: "not-forwarded" }
  }, "push:trackalacker:12345678", "2026-08-21T12:00:00.000Z", "extension-id");

  assert.equal(envelope.source.transport, "chrome_extension_web_push");
  assert.equal(envelope.source.domain, "trackalacker.com");
  assert.equal(envelope.notification.title, "IN STOCK at Walmart!");
  assert.equal(envelope.notification.body.includes("Example product"), true);
  assert.equal(JSON.stringify(envelope).includes("not-forwarded"), false);
});
