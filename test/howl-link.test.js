"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  blockedHostname,
  blockedIpAddress,
  normalizeHowlUrl,
  resolveHowlLink,
  validateRetailerShareUrl
} = require("../lib/howl-link");

test("Howl source links accept generated link hosts and reject unsafe sources", () => {
  assert.equal(normalizeHowlUrl("https://howl.me/abc123"), "https://howl.me/abc123");
  assert.equal(normalizeHowlUrl("https://shop-links.co/link/?url=x"), "https://shop-links.co/link/?url=x");
  assert.throws(() => normalizeHowlUrl("http://howl.me/abc123"), /HTTPS/);
  assert.throws(() => normalizeHowlUrl("https://app.howl.link/links/1"), /generated howl/);
  assert.throws(() => normalizeHowlUrl("https://user:pass@howl.me/abc123"), /credential-free/);
});

test("private and local redirect destinations are blocked", () => {
  assert.equal(blockedHostname("localhost"), true);
  assert.equal(blockedHostname("metadata.internal"), true);
  assert.equal(blockedHostname("127.0.0.1"), true);
  assert.equal(blockedHostname("redirect.impact.com"), false);
  assert.equal(blockedIpAddress("10.1.2.3"), true);
  assert.equal(blockedIpAddress("169.254.169.254"), true);
  assert.equal(blockedIpAddress("8.8.8.8"), false);
  assert.equal(blockedIpAddress("::1"), true);
  assert.equal(blockedIpAddress("::ffff:7f00:1"), true);
  assert.equal(blockedIpAddress("0:0:0:0:0:ffff:7f00:1"), true);
  assert.equal(blockedIpAddress("fec0::1"), true);
  assert.equal(blockedIpAddress("2606:4700:4700::1111"), false);
});

test("retailer share links must match the mission store and exact item", () => {
  const target = "https://www.target.com/p/example/-/A-95298172?nrtv_cid=abc&clkid=123";
  assert.deepEqual(validateRetailerShareUrl(target, { retailer: "target", sku: "95298172" }), {
    url: target,
    retailer: "target",
    sku: "95298172"
  });
  assert.throws(
    () => validateRetailerShareUrl(target, { retailer: "target", sku: "1011483406" }),
    /does not match this mission's item ID/
  );
  assert.throws(
    () => validateRetailerShareUrl(target, { retailer: "walmart", sku: "95298172" }),
    /store does not match/
  );
  assert.throws(() => validateRetailerShareUrl(target), /mission store is required/);
});

test("resolver refuses to register a click without an exact mission identity", async () => {
  let requested = false;
  await assert.rejects(resolveHowlLink("https://howl.me/campaign123", {}, {
    request: async () => {
      requested = true;
      return { statusCode: 302, location: "https://www.target.com/p/-/A-95298172" };
    }
  }), /mission store is required/);
  assert.equal(requested, false);
});

test("resolver follows redirects once and stops before requesting the retailer page", async () => {
  const target = "https://www.target.com/p/example/-/A-95298172?nrtv_cid=abc&clkid=123&TCID=AFL-123";
  const calls = [];
  const responses = new Map([
    ["https://howl.me/campaign123", { statusCode: 302, location: "https://tracking.example/click/abc" }],
    ["https://tracking.example/click/abc", { statusCode: 302, location: target }]
  ]);
  const result = await resolveHowlLink(
    "https://howl.me/campaign123",
    { retailer: "target", sku: "95298172" },
    {
      request: async (url) => {
        calls.push(url);
        return responses.get(url);
      }
    }
  );

  assert.deepEqual(calls, ["https://howl.me/campaign123", "https://tracking.example/click/abc"]);
  assert.equal(result.affiliateUrl, target);
  assert.equal(result.retailer, "target");
  assert.equal(result.sku, "95298172");
  assert.equal(result.redirectCount, 2);
  assert.match(result.resolvedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("resolver rejects mismatched products, unsafe hops, loops, and non-redirect responses", async () => {
  await assert.rejects(
    resolveHowlLink("https://howl.me/wrong", { retailer: "target", sku: "95298172" }, {
      request: async () => ({ statusCode: 302, location: "https://www.target.com/p/-/A-1011483406?nrtv_cid=x" })
    }),
    /does not match this mission's item ID/
  );
  await assert.rejects(
    resolveHowlLink("https://howl.me/private", { retailer: "target", sku: "95298172" }, {
      request: async () => ({ statusCode: 302, location: "https://127.0.0.1/admin" })
    }),
    /unsafe redirect/
  );
  await assert.rejects(
    resolveHowlLink("https://howl.me/loop", { retailer: "target", sku: "95298172" }, {
      request: async () => ({ statusCode: 302, location: "https://howl.me/loop" })
    }),
    /redirect loop/
  );
  await assert.rejects(
    resolveHowlLink("https://howl.me/no-redirect", { retailer: "target", sku: "95298172" }, {
      request: async () => ({ statusCode: 200, location: "" })
    }),
    /did not return a reusable retailer redirect/
  );
});
