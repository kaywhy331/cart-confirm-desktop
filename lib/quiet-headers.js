"use strict";

// Request fingerprint for the app's own quiet retailer checks (anonymous
// product-page reads from the Electron main process). Modern anti-bot stacks
// evaluate Client Hints and Fetch Metadata alongside the User-Agent: a UA
// claiming modern Chrome with none of those headers is a classic script
// signature. These headers mimic what desktop Chrome sends for a top-level
// page NAVIGATION — deliberately not an XHR profile (dest:empty/mode:cors
// with a JSON Accept would itself be anomalous for an HTML page fetch).
//
// Bump QUIET_CHROME_VERSION periodically; the User-Agent and Sec-Ch-Ua
// brand list update in lockstep so they can never disagree.
const QUIET_CHROME_VERSION = "146";

const QUIET_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${QUIET_CHROME_VERSION}.0.0.0 Safari/537.36`;

function quietNavigationHeaders() {
  return {
    "User-Agent": QUIET_USER_AGENT,
    // Structured Client Hints validating the User-Agent string.
    "Sec-Ch-Ua": `"Chromium";v="${QUIET_CHROME_VERSION}", "Google Chrome";v="${QUIET_CHROME_VERSION}", "Not=A?Brand";v="99"`,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    // Fetch Metadata for a user-initiated top-level navigation, matching the
    // HTML Accept below.
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
  };
}

// Node's built-in fetch (undici) enforces the WHATWG forbidden-header rules
// and force-overwrites Sec-Fetch-Mode to "cors", which makes a coherent
// navigation fingerprint impossible (mode:cors with no Origin header is its
// own script signature). This thin https.request client sends the headers
// verbatim, follows redirects while tracking the final URL (the SKU
// assertion depends on it), and decodes the encodings the fingerprint
// advertises.
const { request: httpsRequest } = require("node:https");
const { request: httpRequest } = require("node:http");
const zlib = require("node:zlib");

const QUIET_MAX_REDIRECTS = 5;

function decodeBody(buffer, contentEncoding) {
  const encoding = String(contentEncoding || "").trim().toLowerCase();
  return new Promise((resolve, reject) => {
    const done = (error, result) => (error ? reject(error) : resolve(result));
    if (encoding === "gzip" || encoding === "x-gzip") zlib.gunzip(buffer, done);
    else if (encoding === "deflate") zlib.inflate(buffer, (error, result) => (
      error ? zlib.inflateRaw(buffer, done) : resolve(result)
    ));
    else if (encoding === "br") zlib.brotliDecompress(buffer, done);
    else resolve(buffer);
  });
}

function quietFetch(url, { signal, headers = {} } = {}, redirectsLeft = QUIET_MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(String(url || ""));
    } catch (error) {
      reject(error);
      return;
    }
    const lib = target.protocol === "http:" ? httpRequest : httpsRequest;
    const req = lib(target, { method: "GET", headers, signal }, (res) => {
      const status = Number(res.statusCode || 0);
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        res.resume();
        let next;
        try {
          next = new URL(String(Array.isArray(location) ? location[0] : location), target).toString();
        } catch (error) {
          reject(error);
          return;
        }
        resolve(quietFetch(next, { signal, headers }, redirectsLeft - 1));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        const decoded = () => decodeBody(raw, res.headers["content-encoding"]);
        resolve({
          status,
          ok: status >= 200 && status < 300,
          url: target.toString(),
          headers: {
            get(name) {
              const value = res.headers[String(name || "").toLowerCase()];
              if (value === undefined) return null;
              return Array.isArray(value) ? value[0] : String(value);
            }
          },
          // readBoundedHtml consumes the body through the WHATWG reader
          // interface, exactly like an undici Response. The decoded bytes are
          // streamed in bounded chunks so its incremental size cap keeps
          // engaging before the full page is handed over.
          body: {
            getReader() {
              let pending = null;
              let offset = 0;
              let cancelled = false;
              const CHUNK_BYTES = 64 * 1024;
              return {
                async read() {
                  if (cancelled) return { done: true, value: undefined };
                  pending ||= await decoded();
                  if (offset >= pending.byteLength) return { done: true, value: undefined };
                  const chunk = pending.subarray(offset, offset + CHUNK_BYTES);
                  offset += chunk.byteLength;
                  return { done: false, value: new Uint8Array(chunk) };
                },
                async cancel() {
                  cancelled = true;
                },
                releaseLock() {}
              };
            }
          },
          text: () => decoded().then((buffer) => buffer.toString("utf8"))
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const api = Object.freeze({
  QUIET_CHROME_VERSION,
  QUIET_USER_AGENT,
  quietFetch,
  quietNavigationHeaders
});

module.exports = api;
