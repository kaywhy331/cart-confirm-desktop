"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  conditionalHeaders,
  walmartPrepObservation,
  walmartPrepTransition
} = require("../lib/walmart-prep-monitor");

test("conditional Walmart prep checks reuse public cache validators", () => {
  assert.deepEqual(conditionalHeaders({ etag: '"abc"', lastModified: "Wed, 12 Aug 2026 18:00:00 GMT" }), {
    "If-None-Match": '"abc"',
    "If-Modified-Since": "Wed, 12 Aug 2026 18:00:00 GMT"
  });
});

test("only meaningful public-page transitions trigger Walmart prep", () => {
  const healthy = walmartPrepObservation({
    status: 200,
    html: '<script>{"availabilityStatus":"OUT_OF_STOCK"}</script>',
    url: "https://www.walmart.com/ip/item/123456789",
    now: 1_000
  }, "123456789");
  const unavailable = walmartPrepObservation({ status: 404, html: "not found", now: 2_000 }, "123456789");
  const inStock = walmartPrepObservation({
    status: 200,
    html: '<script>{"availabilityStatus":"IN_STOCK"}</script>',
    now: 3_000
  }, "123456789");
  assert.deepEqual(walmartPrepTransition(null, healthy), { triggered: false, reason: "unchanged" });
  assert.deepEqual(walmartPrepTransition(healthy, unavailable), { triggered: true, reason: "http-404" });
  assert.deepEqual(walmartPrepTransition(unavailable, healthy), { triggered: true, reason: "http-restored" });
  assert.deepEqual(walmartPrepTransition(healthy, inStock), { triggered: true, reason: "availability-available" });
  assert.equal(walmartPrepTransition(healthy, { ...healthy }).triggered, false);
});

test("a visible Walmart queue redirect is an authoritative prep signal", () => {
  const previous = walmartPrepObservation({ status: 200, html: "", now: 1_000 }, "123456789");
  const qpdata = encodeURIComponent(JSON.stringify({
    queued: true,
    customMetadata: JSON.stringify({ item: JSON.stringify({ itemID: "123456789" }) })
  }));
  const queued = walmartPrepObservation({
    status: 200,
    html: "",
    url: `https://www.walmart.com/qp?qpdata=${qpdata}`,
    now: 2_000
  }, "123456789");
  assert.deepEqual(walmartPrepTransition(previous, queued), { triggered: true, reason: "queue-visible" });
  assert.equal(walmartPrepObservation({
    status: 200,
    url: "https://www.walmart.com/qp?qpdata=x",
    now: 3_000
  }, "123456789").queue, false, "ambiguous queue pages must not trigger an exact-item candidate");
});
