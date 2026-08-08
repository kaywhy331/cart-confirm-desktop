"use strict";

const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");

const {
  RETAILERS,
  extractSku,
  normalizeSku,
  parseRetailUrl
} = require("./retailers");

const HOWL_LINK_HOSTS = new Set([
  "howl.link",
  "www.howl.link",
  "howl.me",
  "www.howl.me",
  "shop-links.co",
  "www.shop-links.co"
]);
const MAX_LINK_LENGTH = 16_384;
const MAX_REDIRECTS = 10;
const REQUEST_TIMEOUT_MS = 15_000;

function parseHttpsUrl(rawUrl, label) {
  const text = String(rawUrl || "").trim();
  if (!text || text.length > MAX_LINK_LENGTH) {
    throw new Error(`${label} is missing or too long.`);
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  return parsed;
}

function normalizeHowlUrl(rawUrl) {
  const parsed = parseHttpsUrl(rawUrl, "Howl campaign link");
  if (!HOWL_LINK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Paste a generated howl.me, howl.link, or shop-links.co campaign link.");
  }
  return parsed.href;
}

function blockedIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && [0, 168].includes(b))
    || (a === 198 && [18, 19, 51].includes(b))
    || (a === 203 && b === 0)
    || a >= 224
  );
}

function blockedIpAddress(address) {
  const normalized = String(address || "").trim().toLowerCase().split("%")[0];
  const family = net.isIP(normalized);
  if (family === 4) return blockedIpv4(normalized);
  if (family !== 6) return true;

  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blockedIpv4(mapped[1]);
  if (["::", "::1"].includes(normalized)) return true;
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    first === 0
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0
    || (first & 0xff00) === 0xff00
    || normalized.startsWith("2001:db8:")
  );
}

function blockedHostname(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) return true;
  if (["localhost", "localhost.localdomain"].includes(host)) return true;
  if ([".localhost", ".local", ".internal", ".home.arpa"].some((suffix) => host.endsWith(suffix))) return true;
  return net.isIP(host) ? blockedIpAddress(host) : false;
}

function assertSafeRedirectUrl(rawUrl, baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ""), baseUrl);
  } catch {
    throw new Error("Howl returned an invalid redirect destination.");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.href.length > MAX_LINK_LENGTH
    || blockedHostname(parsed.hostname)
  ) {
    throw new Error("Howl returned an unsafe redirect destination.");
  }
  return parsed;
}

function safeLookup(hostname, options, callback) {
  const requestedFamily = typeof options === "number" ? options : Number(options?.family || 0);
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    const usable = addresses.filter((entry) => (
      (!requestedFamily || entry.family === requestedFamily)
      && !blockedIpAddress(entry.address)
    ));
    if (!usable.length || usable.length !== addresses.filter((entry) => !requestedFamily || entry.family === requestedFamily).length) {
      return callback(new Error("The redirect host did not resolve to a public network address."));
    }
    if (typeof options === "object" && options?.all) return callback(null, usable);
    return callback(null, usable[0].address, usable[0].family);
  });
}

function requestRedirect(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || REQUEST_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = https.request(url, {
      method: "GET",
      agent: false,
      lookup: safeLookup,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Cache-Control": "no-store",
        "User-Agent": "Mozilla/5.0 CartConfirm-HowlResolver/1.0"
      }
    }, (response) => {
      const rawLocation = response.headers.location;
      const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
      const result = {
        statusCode: Number(response.statusCode || 0),
        location: String(location || "")
      };
      settled = true;
      response.destroy();
      resolve(result);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Howl link resolution timed out."));
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
    request.end();
  });
}

function validateRetailerShareUrl(rawUrl, expected = {}) {
  const expectedRetailer = String(expected.retailer || "").trim().toLowerCase();
  if (!RETAILERS[expectedRetailer]) {
    throw new Error("A supported mission store is required for the Howl link.");
  }
  const normalizedExpectedSku = normalizeSku(expectedRetailer, expected.sku);
  const parsedInput = parseHttpsUrl(rawUrl, "Resolved retailer link");
  const { parsed, retailer } = parseRetailUrl(parsedInput.href);
  const sku = extractSku(retailer, parsed.href);
  if (!sku) throw new Error("The resolved retailer link does not identify a supported product.");

  if (retailer !== expectedRetailer) {
    throw new Error("The Howl destination store does not match this mission.");
  }
  if (sku !== normalizedExpectedSku) {
    throw new Error("The Howl destination product does not match this mission's item ID.");
  }

  return Object.freeze({ url: parsed.href, retailer, sku });
}

async function resolveHowlLink(rawUrl, expected = {}, options = {}) {
  const howlUrl = normalizeHowlUrl(rawUrl);
  const expectedProduct = {
    retailer: String(expected.retailer || "").trim().toLowerCase(),
    sku: expected.sku
  };
  if (!RETAILERS[expectedProduct.retailer]) {
    throw new Error("A supported mission store is required for the Howl link.");
  }
  expectedProduct.sku = normalizeSku(expectedProduct.retailer, expectedProduct.sku);
  const request = options.request || requestRedirect;
  const maxRedirects = Number.isInteger(options.maxRedirects) ? options.maxRedirects : MAX_REDIRECTS;
  const visited = new Set();
  let current = new URL(howlUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (visited.has(current.href)) throw new Error("The Howl link entered a redirect loop.");
    visited.add(current.href);

    try {
      const destination = validateRetailerShareUrl(current.href, expectedProduct);
      return Object.freeze({
        howlUrl,
        affiliateUrl: destination.url,
        retailer: destination.retailer,
        sku: destination.sku,
        redirectCount,
        resolvedAt: new Date().toISOString()
      });
    } catch (error) {
      if (redirectCount > 0 && /does not match this mission/.test(String(error?.message || ""))) throw error;
      if (redirectCount > 0 && /does not identify/.test(String(error?.message || ""))) throw error;
    }

    if (redirectCount === maxRedirects) break;

    let response;
    try {
      response = await request(current.href, { timeoutMs: options.timeoutMs });
    } catch {
      throw new Error("The Howl campaign link could not be resolved. Check the link and try again.");
    }
    if (![301, 302, 303, 307, 308].includes(Number(response?.statusCode)) || !response?.location) {
      throw new Error("The Howl campaign link did not return a reusable retailer redirect.");
    }
    current = assertSafeRedirectUrl(response.location, current.href);
  }

  throw new Error(`The Howl campaign link exceeded ${maxRedirects} redirects.`);
}

module.exports = {
  HOWL_LINK_HOSTS,
  MAX_REDIRECTS,
  blockedHostname,
  blockedIpAddress,
  normalizeHowlUrl,
  requestRedirect,
  resolveHowlLink,
  validateRetailerShareUrl
};
