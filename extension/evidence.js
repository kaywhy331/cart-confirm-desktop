"use strict";

(() => {
  const EVIDENCE_VERSION = 2;
  const NORMALIZER_VERSION = 1;
  const EVIDENCE_SOURCE = "visible-checkout-dom";

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }

  function canonicalString(value) {
    return JSON.stringify(canonicalize(value));
  }

  async function sha256Hex(value) {
    const normalized = String(value || "");
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    if (typeof require === "function") {
      return require("node:crypto").createHash("sha256").update(normalized).digest("hex");
    }
    throw new Error("SHA-256 is unavailable.");
  }

  function normalizeFingerprintValues(values) {
    return [...new Set([values].flat()
      .slice(0, 20)
      .map((value) => normalizeText(String(value || "").slice(0, 1_000)))
      .filter(Boolean))]
      .sort();
  }

  async function hmacSha256Hex(secret, value) {
    const keyText = String(secret || "");
    if (!keyText) throw new Error("The checkout evidence HMAC secret is unavailable.");
    if (globalThis.crypto?.subtle) {
      const key = await globalThis.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(keyText),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signature = await globalThis.crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(String(value || ""))
      );
      return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    if (typeof require === "function") {
      return require("node:crypto").createHmac("sha256", keyText).update(String(value || "")).digest("hex");
    }
    throw new Error("HMAC-SHA-256 is unavailable.");
  }

  async function fingerprintWithSecret(secret, values) {
    const normalized = normalizeFingerprintValues(values);
    return normalized.length ? hmacSha256Hex(secret, canonicalString(normalized)) : "";
  }

  function comparable(contract) {
    if (!contract || typeof contract !== "object") return null;
    return {
      version: Number(contract.version),
      normalizerVersion: Number(contract.normalizerVersion),
      provenance: {
        source: String(contract.provenance?.source || ""),
        retailer: String(contract.provenance?.retailer || ""),
        productId: String(contract.provenance?.productId || ""),
        sku: String(contract.provenance?.sku || "")
      },
      fulfillment: {
        mode: String(contract.fulfillment?.mode || ""),
        destinationFingerprint: String(contract.fulfillment?.destinationFingerprint || ""),
        pickupStoreFingerprint: String(contract.fulfillment?.pickupStoreFingerprint || "")
      },
      payment: {
        instrumentSetFingerprint: String(contract.payment?.instrumentSetFingerprint || ""),
        instrumentCount: Number(contract.payment?.instrumentCount)
      },
      substitutions: {
        state: String(contract.substitutions?.state || "unknown"),
        sku: String(contract.substitutions?.sku || "")
      },
      cart: {
        independentlyCounted: contract.cart?.independentlyCounted === true,
        lineCount: Number(contract.cart?.lineCount),
        sku: String(contract.cart?.sku || ""),
        quantity: Number(contract.cart?.quantity)
      },
      orderTotal: Number(contract.orderTotal)
    };
  }

  function validate(contract, product) {
    const value = comparable(contract);
    const maxOrderTotal = Number(product?.maxOrderTotal);
    if (
      !value
      || value.version !== EVIDENCE_VERSION
      || value.normalizerVersion !== NORMALIZER_VERSION
      || value.provenance.source !== EVIDENCE_SOURCE
      || value.provenance.retailer !== product?.retailer
      || value.provenance.productId !== product?.id
      || value.provenance.sku !== product?.sku
      || !["shipping", "pickup"].includes(value.fulfillment.mode)
      || value.fulfillment.mode !== product?.fulfillmentMode
      || (value.fulfillment.mode === "shipping" && !/^[a-f0-9]{64}$/.test(value.fulfillment.destinationFingerprint))
      || (value.fulfillment.mode === "shipping" && value.fulfillment.pickupStoreFingerprint !== "")
      || (value.fulfillment.mode === "pickup" && !/^[a-f0-9]{64}$/.test(value.fulfillment.pickupStoreFingerprint))
      || (value.fulfillment.mode === "pickup" && value.fulfillment.destinationFingerprint !== "")
      || !/^[a-f0-9]{64}$/.test(value.payment.instrumentSetFingerprint)
      || !Number.isInteger(value.payment.instrumentCount)
      || value.payment.instrumentCount < 1
      || !["disabled", "not-applicable"].includes(value.substitutions.state)
      || value.substitutions.sku !== product?.sku
      || value.cart.independentlyCounted !== true
      || value.cart.lineCount !== 1
      || value.cart.sku !== product?.sku
      || value.cart.quantity !== product?.quantity
      || !Number.isFinite(value.orderTotal)
      || value.orderTotal <= 0
      || !Number.isFinite(maxOrderTotal)
      || maxOrderTotal <= 0
      || value.orderTotal > maxOrderTotal
    ) return { ok: false, reason: "checkout-evidence-unverified", evidence: value };
    return { ok: true, evidence: value };
  }

  async function capture(product, observed = {}, signFingerprint) {
    if (typeof signFingerprint !== "function") {
      throw new Error("Checkout evidence requires a persistent local-secret HMAC signer.");
    }
    const fulfillmentMode = String(observed.fulfillmentMode || "");
    const destinationFingerprint = fulfillmentMode === "shipping"
      ? await signFingerprint(observed.destinationTexts || [])
      : "";
    const pickupStoreFingerprint = fulfillmentMode === "pickup"
      ? await signFingerprint(observed.pickupStoreTexts || [])
      : "";
    const normalizedPaymentInstruments = normalizeFingerprintValues(observed.paymentInstrumentTexts || []);
    const instrumentSetFingerprint = await signFingerprint(normalizedPaymentInstruments);
    return {
      version: EVIDENCE_VERSION,
      normalizerVersion: NORMALIZER_VERSION,
      provenance: {
        source: EVIDENCE_SOURCE,
        retailer: String(product?.retailer || ""),
        productId: String(product?.id || ""),
        sku: String(product?.sku || "")
      },
      fulfillment: { mode: fulfillmentMode, destinationFingerprint, pickupStoreFingerprint },
      payment: {
        instrumentSetFingerprint,
        instrumentCount: normalizedPaymentInstruments.length
      },
      substitutions: {
        state: String(observed.substitutionState || "unknown"),
        sku: String(product?.sku || "")
      },
      cart: {
        independentlyCounted: observed.inventory?.independentlyCounted === true,
        lineCount: Array.isArray(observed.inventory?.items) ? observed.inventory.items.length : 0,
        sku: String(observed.inventory?.items?.[0]?.sku || ""),
        quantity: Number(observed.line?.quantity)
      },
      orderTotal: Number(observed.orderTotal),
      capturedAt: new Date(observed.capturedAt || Date.now()).toISOString()
    };
  }

  // Account-level checkout trust: destination and payment fingerprints the
  // operator approved once per store and fulfillment mode. A mission without
  // its own preflight is only allowed to auto-submit when the live page's
  // fingerprints match that approved profile exactly.
  function trustEntryFor(trust, product, mode) {
    const entry = trust?.[String(product?.retailer || "")]?.[String(mode || "")];
    return entry && typeof entry === "object" ? entry : null;
  }

  async function matches(expected, current, product, trust) {
    const currentResult = validate(current, product);
    if (!currentResult.ok) return currentResult;
    const expectedResult = validate(expected, product);
    if (expectedResult.ok) {
      return canonicalString(expectedResult.evidence) === canonicalString(currentResult.evidence)
        ? { ok: true, evidence: currentResult.evidence, verification: "preflight" }
        : { ok: false, reason: "checkout-evidence-changed" };
    }
    const live = currentResult.evidence;
    const entry = trustEntryFor(trust, product, live.fulfillment.mode);
    if (!entry) return { ok: false, reason: "checkout-trust-required" };
    const trusted =
      String(entry.destinationFingerprint || "") === live.fulfillment.destinationFingerprint
      && String(entry.pickupStoreFingerprint || "") === live.fulfillment.pickupStoreFingerprint
      && String(entry.instrumentSetFingerprint || "") === live.payment.instrumentSetFingerprint
      && Number(entry.instrumentCount) === live.payment.instrumentCount;
    return trusted
      ? { ok: true, evidence: currentResult.evidence, verification: "account-trust" }
      : { ok: false, reason: "checkout-trust-changed" };
  }

  const api = Object.freeze({
    EVIDENCE_VERSION,
    EVIDENCE_SOURCE,
    NORMALIZER_VERSION,
    canonicalString,
    capture,
    comparable,
    fingerprintWithSecret,
    hmacSha256Hex,
    matches,
    normalizeFingerprintValues,
    normalizeText,
    sha256Hex,
    validate
  });
  globalThis.CartConfirmEvidence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
