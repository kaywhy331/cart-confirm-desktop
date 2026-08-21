"use strict";

(function exposeTrackalackerPush(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CartConfirmTrackalackerPush = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEVICE_REGISTRATION_URL = "https://www.trackalacker.com/api/v1/users/devices";
  // TrackaLacker publishes this non-secret application-server key in its own
  // service worker. Enrollment prefers the live page subscription's current
  // key; this is the compatible fallback when the page has no subscription.
  const VAPID_PUBLIC_KEY = "BPUDGH3jRyYkLhTOkC4L_qLreblXGxBEq2amt8cFTqlfp3IduF8wIkAc9VbKlSyW_UCuPKt6DTOq64uMS_m6vIg";
  const PLATFORM = "web";
  const MAX_PUSH_TITLE_LENGTH = 500;
  const MAX_PUSH_BODY_LENGTH = 4_000;

  function cleanText(value, maximum) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximum);
  }

  function cleanBody(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_PUSH_BODY_LENGTH);
  }

  function bytesFrom(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function base64Encode(value, encoder = globalThis.btoa) {
    const bytes = bytesFrom(value);
    if (!bytes?.length || typeof encoder !== "function") return "";
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return encoder(binary);
  }

  function applicationServerKeyFromBase64Url(value, decoder = globalThis.atob) {
    if (typeof decoder !== "function") throw new Error("Base64 decoding is unavailable.");
    const encoded = String(value || "").trim();
    const padded = `${encoded.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - encoded.length % 4) % 4)}`;
    const binary = decoder(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("TrackaLacker's Web Push key is invalid.");
    return bytes;
  }

  function vapidApplicationServerKey(decoder = globalThis.atob) {
    return applicationServerKeyFromBase64Url(VAPID_PUBLIC_KEY, decoder);
  }

  function applicationServerKeyMatches(subscription, expected = vapidApplicationServerKey()) {
    const actual = bytesFrom(subscription?.options?.applicationServerKey);
    // Chrome exposes the applicationServerKey on current subscriptions. An
    // older implementation may omit it; this extension has no other push
    // purpose, so an otherwise valid existing subscription remains usable.
    if (!actual) return true;
    if (actual.length !== expected.length) return false;
    return actual.every((byte, index) => byte === expected[index]);
  }

  function deviceRegistrationPayload(subscription, nickname, encoder = globalThis.btoa) {
    if (!subscription || typeof subscription.getKey !== "function") {
      return { ok: false, reason: "missing-subscription" };
    }
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = base64Encode(subscription.getKey("p256dh"), encoder);
    const auth = base64Encode(subscription.getKey("auth"), encoder);
    const safeNickname = cleanText(nickname, 80);
    if (!endpoint || !p256dh || !auth || !safeNickname) {
      return { ok: false, reason: "incomplete-subscription" };
    }
    return {
      ok: true,
      payload: {
        device: {
          platform: PLATFORM,
          endpoint,
          p256dh,
          auth,
          nickname: safeNickname
        }
      }
    };
  }

  function collectResponseStrings(value, output = [], depth = 0) {
    if (depth > 4 || output.length >= 40) return output;
    if (typeof value === "string") {
      output.push(value.slice(0, 500));
      return output;
    }
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 20)) collectResponseStrings(entry, output, depth + 1);
      return output;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value).slice(0, 20)) collectResponseStrings(entry, output, depth + 1);
    }
    return output;
  }

  function normalizedMessage(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function registrationOutcome(status, responseBody) {
    const httpStatus = Number.isInteger(Number(status)) ? Math.max(0, Math.min(599, Number(status))) : 0;
    const messages = collectResponseStrings([
      responseBody?.message,
      responseBody?.error,
      responseBody?.errors
    ]).map(normalizedMessage);
    const enrolled = messages.some((message) => message === "device enrolled successfully");
    const duplicate = messages.some((message) => (
      /\b(?:already registered|already enrolled|device already exists|endpoint already exists)\b/.test(message)
      || /\bendpoint has already been taken\b/.test(message)
      || message === "has already been taken"
    ));
    if (httpStatus === 200 || enrolled) {
      return { ok: true, duplicate, status: httpStatus, code: duplicate ? "already-registered" : "enrolled" };
    }
    if ([409, 422].includes(httpStatus) && duplicate) {
      return { ok: true, duplicate: true, status: httpStatus, code: "already-registered" };
    }
    return { ok: false, duplicate: false, status: httpStatus, code: httpStatus ? "http-error" : "network-error" };
  }

  // The VAPID application-server key is public and is the only page-owned
  // subscription field allowed to cross this boundary. The subscription's
  // endpoint, p256dh, and auth values are deliberately never read here.
  async function inspectPagePushSubscription(runtime) {
    const pageNavigator = runtime?.navigator || (typeof navigator !== "undefined" ? navigator : null);
    try {
      const pageRegistration = await pageNavigator?.serviceWorker?.getRegistration?.();
      const subscription = await pageRegistration?.pushManager?.getSubscription?.();
      if (!subscription) return { subscriptionPresent: false, applicationServerKey: "" };
      const key = subscription?.options?.applicationServerKey;
      let bytes;
      if (key instanceof Uint8Array) bytes = key;
      else if (key instanceof ArrayBuffer) bytes = new Uint8Array(key);
      else if (ArrayBuffer.isView(key)) bytes = new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
      if (!bytes || bytes.length !== 65 || bytes[0] !== 4) {
        return { subscriptionPresent: true, applicationServerKey: "" };
      }
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const encoded = (runtime?.btoa || btoa)(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      return { subscriptionPresent: true, applicationServerKey: encoded };
    } catch {
      return { subscriptionPresent: false, applicationServerKey: "" };
    }
  }

  // This function is deliberately self-contained because Chrome serializes it
  // into the TrackaLacker tab's MAIN world. Subscription material is used only
  // as the body of this same-origin request and is never returned to the
  // extension. Only a bounded status classification crosses back.
  async function registerDeviceInPage(payload, runtime) {
    const pageDocument = runtime?.document || document;
    const pageFetch = runtime?.fetch || fetch;
    const pageNavigator = runtime?.navigator || (typeof navigator !== "undefined" ? navigator : null);
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    const csrf = pageDocument?.querySelector?.('meta[name="csrf-token"]')?.getAttribute?.("content") || "";
    if (csrf) headers["X-CSRF-Token"] = csrf;
    let pageSubscriptionPresent = false;
    try {
      const pageRegistration = await pageNavigator?.serviceWorker?.getRegistration?.();
      pageSubscriptionPresent = Boolean(await pageRegistration?.pushManager?.getSubscription?.());
    } catch {
      // Page-owned notifications stay untouched. Their presence is diagnostic
      // only; their endpoint and keys never cross into the extension.
    }
    try {
      const response = await pageFetch("https://www.trackalacker.com/api/v1/users/devices", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "follow",
        headers,
        body: JSON.stringify(payload)
      });
      // A signed-out navigation or an interstitial can resolve as HTTP 200
      // after fetch follows a redirect. Do not mistake that page for a
      // successful API enrollment.
      if (response.redirected === true) {
        return { ok: false, duplicate: false, status: 0, code: "network-error", pageSubscriptionPresent };
      }
      const responseBody = await response.json().catch(() => ({}));
      const status = Number.isInteger(Number(response.status))
        ? Math.max(0, Math.min(599, Number(response.status)))
        : 0;
      const strings = [];
      const visit = (value, depth = 0) => {
        if (depth > 4 || strings.length >= 40) return;
        if (typeof value === "string") {
          strings.push(value.slice(0, 500).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
        } else if (Array.isArray(value)) {
          for (const entry of value.slice(0, 20)) visit(entry, depth + 1);
        } else if (value && typeof value === "object") {
          for (const entry of Object.values(value).slice(0, 20)) visit(entry, depth + 1);
        }
      };
      visit([responseBody?.message, responseBody?.error, responseBody?.errors]);
      const enrolled = strings.some((message) => message === "device enrolled successfully");
      const duplicate = strings.some((message) => (
        /\b(?:already registered|already enrolled|device already exists|endpoint already exists)\b/.test(message)
        || /\bendpoint has already been taken\b/.test(message)
        || message === "has already been taken"
      ));
      if (status === 200 || enrolled) {
        return { ok: true, duplicate, status, code: duplicate ? "already-registered" : "enrolled", pageSubscriptionPresent };
      }
      if ([409, 422].includes(status) && duplicate) {
        return { ok: true, duplicate: true, status, code: "already-registered", pageSubscriptionPresent };
      }
      return { ok: false, duplicate: false, status, code: status ? "http-error" : "network-error", pageSubscriptionPresent };
    } catch {
      return { ok: false, duplicate: false, status: 0, code: "network-error", pageSubscriptionPresent };
    }
  }

  async function subscriptionFingerprint(subscription, subtle = globalThis.crypto?.subtle) {
    const endpoint = String(subscription?.endpoint || "");
    if (!endpoint || !subtle?.digest) return "";
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function trackalackerUrl(value) {
    try {
      const url = new URL(String(value || ""), "https://www.trackalacker.com/");
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || url.username || url.password) return "";
      if (host !== "trackalacker.com" && host !== "www.trackalacker.com") return "";
      url.hostname = "www.trackalacker.com";
      url.hash = "";
      return url.href.slice(0, 2_000);
    } catch {
      return "";
    }
  }

  function pushNotificationData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const nested = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data : {};
    const title = cleanText(value.title || nested.title, MAX_PUSH_TITLE_LENGTH);
    const body = cleanBody(value.body || nested.body || value.message || nested.message);
    const url = trackalackerUrl(value.url || nested.url);
    if (!title && !body) return null;
    return Object.freeze({ title, body, url });
  }

  function signalEnvelopeFromPush(value, signalId, receivedAt, extensionId) {
    const notification = pushNotificationData(value);
    const id = cleanText(signalId, 180);
    const timestamp = new Date(receivedAt || "");
    if (!notification || !/^[A-Za-z0-9:._-]{8,180}$/.test(id) || Number.isNaN(timestamp.getTime())) return null;
    return {
      schemaVersion: 1,
      signalId: id,
      testSignal: false,
      source: {
        provider: "trackalacker",
        transport: "chrome_extension_web_push",
        notificationId: id,
        applicationName: "CartCollect Chrome extension",
        applicationId: cleanText(extensionId, 240),
        domain: "trackalacker.com",
        createdAt: timestamp.toISOString(),
        receivedAt: timestamp.toISOString()
      },
      notification: {
        title: notification.title,
        body: notification.body,
        textElements: []
      }
    };
  }

  function safeRegistrationDiagnostic(result = {}) {
    const status = Number.isInteger(Number(result.status)) ? Math.max(0, Math.min(599, Number(result.status))) : 0;
    if (result.ok && result.duplicate) return "Device already registered";
    if (result.ok) return `Device registration succeeded: HTTP ${status || 200}`;
    if (result.code === "missing-subscription") return "Push subscription unavailable";
    if (status) return `Device registration failed: HTTP ${status}`;
    return "Device registration failed";
  }

  return Object.freeze({
    DEVICE_REGISTRATION_URL,
    PLATFORM,
    VAPID_PUBLIC_KEY,
    applicationServerKeyFromBase64Url,
    applicationServerKeyMatches,
    base64Encode,
    deviceRegistrationPayload,
    inspectPagePushSubscription,
    pushNotificationData,
    registerDeviceInPage,
    registrationOutcome,
    safeRegistrationDiagnostic,
    signalEnvelopeFromPush,
    subscriptionFingerprint,
    trackalackerUrl,
    vapidApplicationServerKey
  });
});
