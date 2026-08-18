"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Evidence = require("../extension/evidence");
const {
  CHECKOUT_EVIDENCE_SOURCE,
  CHECKOUT_EVIDENCE_VERSION,
  applyCheckoutPreflight,
  normalizeCheckoutEvidence,
  preserveCheckoutEvidence
} = require("../lib/core");

const NOW = Date.parse("2026-08-13T20:00:00.000Z");

function product(retailer = "target", overrides = {}) {
  const sku = retailer === "amazon" ? "B0ABC12345" : retailer === "walmart" ? "123456789" : "1011960739";
  return {
    id: `${retailer}:${sku}`,
    retailer,
    sku,
    quantity: 2,
    fulfillmentMode: "shipping",
    action: "checkout",
    maxPrice: 50,
    maxOrderTotal: 125,
    enabled: true,
    ...overrides
  };
}

function contract(entry, overrides = {}) {
  return {
    version: CHECKOUT_EVIDENCE_VERSION,
    normalizerVersion: 1,
    provenance: {
      source: CHECKOUT_EVIDENCE_SOURCE,
      retailer: entry.retailer,
      productId: entry.id,
      sku: entry.sku
    },
    fulfillment: {
      mode: entry.fulfillmentMode,
      destinationFingerprint: entry.fulfillmentMode === "shipping" ? "a".repeat(64) : "",
      pickupStoreFingerprint: entry.fulfillmentMode === "pickup" ? "b".repeat(64) : ""
    },
    payment: { instrumentSetFingerprint: "c".repeat(64), instrumentCount: 2 },
    substitutions: { state: entry.retailer === "walmart" ? "disabled" : "not-applicable", sku: entry.sku },
    cart: { independentlyCounted: true, lineCount: 1, sku: entry.sku, quantity: entry.quantity },
    orderTotal: 109.73,
    capturedAt: new Date(NOW).toISOString(),
    ...overrides
  };
}

test("checkout fingerprints use a persistent secret rather than raw SHA-256", async () => {
  const values = ["Visa ending in 4242", "123 Main Street"];
  const first = await Evidence.fingerprintWithSecret("1".repeat(64), values);
  const repeated = await Evidence.fingerprintWithSecret("1".repeat(64), values);
  const otherInstall = await Evidence.fingerprintWithSecret("2".repeat(64), values);
  const raw = await Evidence.sha256Hex(Evidence.canonicalString(Evidence.normalizeFingerprintValues(values)));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, repeated);
  assert.notEqual(first, otherInstall);
  assert.notEqual(first, raw);
});

for (const retailer of ["target", "walmart", "amazon"]) {
  test(`${retailer} checkout evidence binds destination, payment set, substitutions, schema, and provenance`, () => {
    const entry = product(retailer);
    const evidence = contract(entry);
    assert.deepEqual(normalizeCheckoutEvidence(evidence, entry), evidence);
    assert.equal(normalizeCheckoutEvidence({ ...evidence, version: 1 }, entry), null);
    const otherRetailer = retailer === "amazon" ? "target" : "amazon";
    assert.equal(normalizeCheckoutEvidence({ ...evidence, provenance: { ...evidence.provenance, retailer: otherRetailer } }, entry), null);
    assert.equal(normalizeCheckoutEvidence({ ...evidence, payment: { ...evidence.payment, instrumentSetFingerprint: "d".repeat(64) } }, entry)?.payment.instrumentSetFingerprint, "d".repeat(64));
    assert.equal(normalizeCheckoutEvidence({ ...evidence, substitutions: { ...evidence.substitutions, state: "enabled" } }, entry), null);
  });
}

test("pickup evidence requires one exact pickup store and no shipping destination", () => {
  const entry = product("walmart", { fulfillmentMode: "pickup" });
  const evidence = contract(entry);
  assert.deepEqual(normalizeCheckoutEvidence(evidence, entry), evidence);
  assert.equal(normalizeCheckoutEvidence({
    ...evidence,
    fulfillment: { ...evidence.fulfillment, destinationFingerprint: "d".repeat(64) }
  }, entry), null);
});

test("checkout approval requires fresh evidence and binds it to the unchanged mission", () => {
  const entry = product();
  const originalNow = Date.now;
  Date.now = () => NOW;
  try {
    const approved = applyCheckoutPreflight([entry], entry.id, contract(entry));
    assert.equal(approved[0].checkoutEvidence.version, CHECKOUT_EVIDENCE_VERSION);
    assert.throws(() => applyCheckoutPreflight([entry], entry.id, {
      ...contract(entry),
      capturedAt: new Date(NOW - 5 * 60_000 - 1).toISOString()
    }), /fresh visible final-review page/);

    const unchanged = preserveCheckoutEvidence([{ ...entry }], approved);
    assert.ok(unchanged[0].checkoutEvidence);
    for (const changed of [
      { quantity: 3 },
      { fulfillmentMode: "pickup" },
      { action: "review" },
      { maxPrice: 49 },
      { maxOrderTotal: 124 }
    ]) {
      assert.equal(preserveCheckoutEvidence([{ ...entry, ...changed }], approved)[0].checkoutEvidence, null);
    }
  } finally {
    Date.now = originalNow;
  }
});

test("checkout evidence rejects missing or non-positive mission total caps", () => {
  const uncapped = product("target", { maxOrderTotal: 0 });
  const missingCap = product("target", { maxOrderTotal: undefined });
  assert.equal(normalizeCheckoutEvidence(contract(uncapped), uncapped), null);
  assert.equal(Evidence.validate(contract(uncapped), uncapped).ok, false);
  assert.equal(Evidence.validate(contract(missingCap), missingCap).ok, false);
  assert.throws(
    () => applyCheckoutPreflight([uncapped], uncapped.id, {
      ...contract(uncapped),
      capturedAt: new Date().toISOString()
    }),
    /did not prove/
  );
});

test("capture and matches bind visible checkout fields and survive only the same HMAC secret", async () => {
  const entry = product("target");
  const signer = (secret) => (values) => Evidence.fingerprintWithSecret(secret, values);
  const observed = {
    fulfillmentMode: "shipping",
    destinationTexts: ["Deliver to 123 Main Street"],
    pickupStoreTexts: [],
    paymentInstrumentTexts: ["Visa ending in 4242", "Gift card ending in 0099"],
    substitutionState: "not-applicable",
    inventory: {
      independentlyCounted: true,
      items: [{ sku: entry.sku }]
    },
    line: { quantity: entry.quantity },
    orderTotal: 109.73,
    capturedAt: NOW
  };
  const expected = await Evidence.capture(entry, observed, signer("1".repeat(64)));
  const unchanged = await Evidence.capture(entry, observed, signer("1".repeat(64)));
  const preflightMatch = await Evidence.matches(expected, unchanged, entry);
  assert.equal(preflightMatch.ok, true);
  assert.equal(preflightMatch.verification, "preflight");
  const untrusted = await Evidence.matches(null, unchanged, entry);
  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.reason, "checkout-trust-required");
  const trust = {
    target: {
      shipping: {
        destinationFingerprint: unchanged.fulfillment.destinationFingerprint,
        pickupStoreFingerprint: "",
        instrumentSetFingerprint: unchanged.payment.instrumentSetFingerprint,
        instrumentCount: unchanged.payment.instrumentCount
      }
    }
  };
  const trustMatch = await Evidence.matches(null, unchanged, entry, trust);
  assert.equal(trustMatch.ok, true);
  assert.equal(trustMatch.verification, "account-trust");
  for (const drift of [
    { destinationFingerprint: "d".repeat(64) },
    { instrumentSetFingerprint: "e".repeat(64) },
    { instrumentCount: unchanged.payment.instrumentCount + 1 }
  ]) {
    const driftedTrust = { target: { shipping: { ...trust.target.shipping, ...drift } } };
    assert.equal((await Evidence.matches(null, unchanged, entry, driftedTrust)).reason, "checkout-trust-changed");
  }
  assert.equal(
    (await Evidence.matches(null, unchanged, entry, { walmart: trust.target })).reason,
    "checkout-trust-required"
  );
  const unsafeLive = await Evidence.capture(entry, {
    ...observed,
    substitutionState: "enabled"
  }, signer("1".repeat(64)));
  assert.equal((await Evidence.matches(null, unsafeLive, entry, trust)).reason, "checkout-evidence-unverified");

  for (const change of [
    { destinationTexts: ["Deliver to 987 Other Avenue"] },
    { paymentInstrumentTexts: ["Mastercard ending in 1111"] }
  ]) {
    const current = await Evidence.capture(entry, { ...observed, ...change }, signer("1".repeat(64)));
    assert.equal((await Evidence.matches(expected, current, entry)).reason, "checkout-evidence-changed");
  }

  for (const change of [
    { substitutionState: "enabled" },
    { line: { quantity: entry.quantity + 1 } },
    { orderTotal: entry.maxOrderTotal + 0.01 }
  ]) {
    const current = await Evidence.capture(entry, { ...observed, ...change }, signer("1".repeat(64)));
    assert.equal((await Evidence.matches(expected, current, entry)).reason, "checkout-evidence-unverified");
  }

  const afterSecretReset = await Evidence.capture(entry, observed, signer("2".repeat(64)));
  assert.equal((await Evidence.matches(expected, afterSecretReset, entry)).reason, "checkout-evidence-changed");
});

test("readable checkout labels stay inside the content-script hashing boundary", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(content, /!freshReview\.evidence\.ok/);
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  assert.match(content, /fingerprintWithSecret\(await checkoutHmacSecret\(\), normalized\)/);
  assert.doesNotMatch(content, /CART_CONFIRM_FINGERPRINT_CHECKOUT_EVIDENCE/);
  assert.doesNotMatch(background, /CART_CONFIRM_FINGERPRINT_CHECKOUT_EVIDENCE|message\.values/);
  assert.doesNotMatch(`${background}\n${main}\n${renderer}`, /destinationTexts|paymentInstrumentTexts|pickupStoreTexts/);
});

test("account checkout trust normalizes per store and mode and is written on preflight approval", () => {
  const { normalizeCheckoutTrust, checkoutTrustWithEvidence } = require("../lib/core");
  const entry = product("target");
  const evidence = contract(entry);
  const trust = checkoutTrustWithEvidence({}, entry, evidence);
  assert.deepEqual(trust.target.shipping, {
    destinationFingerprint: "a".repeat(64),
    pickupStoreFingerprint: "",
    instrumentSetFingerprint: "c".repeat(64),
    instrumentCount: 2,
    capturedAt: evidence.capturedAt,
    sourceProductId: entry.id
  });
  // Round-trips through settings normalization unchanged.
  assert.deepEqual(normalizeCheckoutTrust(trust), trust);
  // Re-approval overwrites the same store+mode slot instead of accumulating.
  const other = { ...entry, id: "target:1099999999", sku: "1099999999" };
  const replaced = checkoutTrustWithEvidence(trust, other, {
    ...contract(other),
    payment: { instrumentSetFingerprint: "f".repeat(64), instrumentCount: 1 }
  });
  assert.equal(replaced.target.shipping.instrumentSetFingerprint, "f".repeat(64));
  assert.equal(replaced.target.shipping.sourceProductId, other.id);
  // A pickup approval lands beside shipping without clobbering it.
  const pickupEntry = product("walmart", { fulfillmentMode: "pickup" });
  const both = checkoutTrustWithEvidence(replaced, pickupEntry, contract(pickupEntry));
  assert.equal(both.target.shipping.instrumentSetFingerprint, "f".repeat(64));
  assert.equal(both.walmart.pickup.pickupStoreFingerprint, "b".repeat(64));
  assert.equal(both.walmart.pickup.destinationFingerprint, "");
  // Malformed entries are dropped, not preserved.
  for (const bad of [
    { instrumentSetFingerprint: "short", instrumentCount: 2, destinationFingerprint: "a".repeat(64), capturedAt: evidence.capturedAt },
    { instrumentSetFingerprint: "c".repeat(64), instrumentCount: 0, destinationFingerprint: "a".repeat(64), capturedAt: evidence.capturedAt },
    { instrumentSetFingerprint: "c".repeat(64), instrumentCount: 2, destinationFingerprint: "a".repeat(64), capturedAt: "not-a-date" },
    { instrumentSetFingerprint: "c".repeat(64), instrumentCount: 2, destinationFingerprint: "a".repeat(64), pickupStoreFingerprint: "b".repeat(64), capturedAt: evidence.capturedAt }
  ]) {
    assert.deepEqual(normalizeCheckoutTrust({ target: { shipping: bad } }), {});
  }
});

test("checkout trust is stored on preflight approval and enforced by the content script", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  assert.match(main, /checkoutTrust: checkoutTrustWithEvidence\(settings\.checkoutTrust/);
  assert.match(main, /checkoutTrust: settings\.checkoutTrust/);
  assert.match(content, /Evidence\.matches\(expectedEvidence, checkoutEvidence, product, config\?\.checkoutTrust\)/);
  assert.match(content, /checkout-trust-required/);
  assert.match(content, /checkout-trust-changed/);
});
