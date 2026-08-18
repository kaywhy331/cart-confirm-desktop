"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { QUIET_CHROME_VERSION, QUIET_USER_AGENT, quietFetch, quietNavigationHeaders } = require("../lib/quiet-headers");

test("the quiet fingerprint is a coherent Chrome page-navigation profile", () => {
  const headers = quietNavigationHeaders();
  // UA and Client Hints stay in version lockstep from one constant.
  assert.match(QUIET_USER_AGENT, new RegExp(`Chrome/${QUIET_CHROME_VERSION}\\.0\\.0\\.0 `));
  assert.equal(headers["User-Agent"], QUIET_USER_AGENT);
  assert.match(headers["Sec-Ch-Ua"], new RegExp(`"Chromium";v="${QUIET_CHROME_VERSION}"`));
  assert.match(headers["Sec-Ch-Ua"], new RegExp(`"Google Chrome";v="${QUIET_CHROME_VERSION}"`));
  // No Electron or app-name leakage anywhere in the fingerprint.
  assert.doesNotMatch(JSON.stringify(headers), /electron|cart.?confirm/i);
  // Fetch Metadata must describe a top-level navigation, consistent with the
  // HTML Accept — an XHR profile (empty/cors/json) on an HTML page fetch
  // would itself be an anomaly.
  assert.equal(headers["Sec-Fetch-Dest"], "document");
  assert.equal(headers["Sec-Fetch-Mode"], "navigate");
  assert.equal(headers["Sec-Fetch-Site"], "none");
  assert.equal(headers["Sec-Fetch-User"], "?1");
  assert.match(headers.Accept, /^text\/html,application\/xhtml\+xml/);
  assert.equal(headers["Accept-Language"], "en-US,en;q=0.9");
  assert.equal(headers["Sec-Ch-Ua-Mobile"], "?0");
  assert.equal(headers["Sec-Ch-Ua-Platform"], '"Windows"');
  assert.equal(headers["Upgrade-Insecure-Requests"], "1");
});

test("quietFetch transmits every fingerprint header verbatim, including Sec-Fetch-Mode: navigate", async () => {
  const zlib = require("node:zlib");
  let received = null;
  const server = http.createServer((req, res) => {
    received = req.headers;
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/probe" });
      res.end();
      return;
    }
    if (req.url === "/probe") {
      res.writeHead(200, { "Content-Encoding": "gzip", "Content-Type": "text/html", Etag: '"abc123"' });
      res.end(zlib.gzipSync("<html>riftbound</html>"));
      return;
    }
    if (req.url === "/cached") {
      res.writeHead(304);
      res.end();
      return;
    }
    res.end("ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const response = await quietFetch(`http://127.0.0.1:${port}/redirect`, { headers: quietNavigationHeaders() });
    const sent = quietNavigationHeaders();
    for (const [name, value] of Object.entries(sent)) {
      assert.equal(received[name.toLowerCase()], value, `header ${name} did not arrive`);
    }
    // The redirect was followed, the final URL is tracked (the SKU assertion
    // depends on it), and the gzip body decodes.
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.match(response.url, /\/probe$/);
    assert.equal(response.headers.get("etag"), '"abc123"');
    assert.equal(await response.text(), "<html>riftbound</html>");
    const cached = await quietFetch(`http://127.0.0.1:${port}/cached`, { headers: quietNavigationHeaders() });
    assert.equal(cached.status, 304);
    assert.equal(cached.ok, false);
  } finally {
    server.close();
  }
});

test("both quiet retailer fetch sites in main.js use the shared fingerprint", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
  assert.match(source, /require\("\.\/lib\/quiet-headers"\)/);
  assert.equal((source.match(/quietNavigationHeaders\(\)/g) || []).length >= 2, true);
  assert.equal((source.match(/await quietFetch\(/g) || []).length, 2);
  // Undici fetch (which force-rewrites Sec-Fetch-Mode) is no longer used for
  // retailer product-page checks.
  assert.doesNotMatch(source, /await fetch\((?:product|candidate)\.productUrl/);
  // The old hand-rolled UA constant is fully retired.
  assert.doesNotMatch(source, /QUIET_USER_AGENT/);
});

test("quietFetch responses feed readBoundedHtml: gzip HTML decodes through the reader interface", async () => {
  const zlib = require("node:zlib");
  const { readBoundedHtml } = require("../lib/quiet-monitor");
  const html = `<!doctype html><html><body>${"stock ".repeat(50_000)}</body></html>`;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Encoding": "gzip" });
    res.end(zlib.gzipSync(html));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const response = await quietFetch(`http://127.0.0.1:${port}/p/item/-/A-123`, { headers: quietNavigationHeaders() });
    // The 3.6.17 regression: quietCheck reads the page through
    // readBoundedHtml, which consumes response.body.getReader(). A response
    // without that reader made every quiet check throw "unreadable-body",
    // so tabless missions only reached Chrome minutes later via the
    // three-failure quarantine fallback.
    assert.equal(typeof response.body?.getReader, "function");
    const body = await readBoundedHtml(response);
    assert.equal(body, html);
  } finally {
    server.close();
  }
});

test("readBoundedHtml still enforces its size cap on quietFetch responses", async () => {
  const { readBoundedHtml } = require("../lib/quiet-monitor");
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html>${"x".repeat(200_000)}</html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const response = await quietFetch(`http://127.0.0.1:${port}/p/item/-/A-123`, { headers: quietNavigationHeaders() });
    await assert.rejects(readBoundedHtml(response, { maximumBytes: 4_096 }), (error) => error.code === "body-too-large");
  } finally {
    server.close();
  }
});
