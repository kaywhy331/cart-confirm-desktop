"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpenRequestStore } = require("../lib/open-requests");

test("a pending open request can be claimed exactly once", () => {
  const store = createOpenRequestStore({ now: () => 1_000 });
  const request = store.add("target", "https://www.target.com/p/restocks/A-95298172");

  assert.deepEqual(store.pending().map((entry) => entry.id), [request.id]);
  const claimed = store.claim(request.id);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.url, "https://www.target.com/p/restocks/A-95298172");
  assert.equal(store.claim(request.id).reason, "already-claimed");
  assert.deepEqual(store.pending(), []);
});

test("a pending request carries only its bounded product context", () => {
  const store = createOpenRequestStore({ now: () => 1_000 });
  const request = store.add(
    "amazon",
    "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1",
    { productId: "amazon:B0GG16Q4X1", contextRequired: true, dedicatedTab: true, background: true }
  );

  assert.deepEqual(store.pending()[0], {
    id: request.id,
    retailer: "amazon",
    url: "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1",
    productId: "amazon:B0GG16Q4X1",
    contextRequired: true,
    dedicatedTab: true,
    background: true,
    signalOrderLimit: null,
    createdAt: 1_000
  });
  const claimed = store.claim(request.id);
  assert.equal(claimed.productId, "amazon:B0GG16Q4X1");
  assert.equal(claimed.background, true);
  assert.equal(store.claim(request.id).reason, "already-claimed");
});

test("waitForClaim resolves true when the companion claims the request", async () => {
  const store = createOpenRequestStore({
    now: () => 1_000,
    wait: () => new Promise(() => {})
  });
  const request = store.add("walmart", "https://www.walmart.com/ip/123456789");
  const waiting = store.waitForClaim(request.id, 5_000);
  assert.equal(store.claim(request.id).ok, true);
  assert.equal(await waiting, true);
});

test("waitForClaim falls back after the timeout and removes the request", async () => {
  const store = createOpenRequestStore({
    now: () => 1_000,
    wait: () => Promise.resolve()
  });
  const request = store.add("amazon", "https://www.amazon.com/dp/B0ABC12345");
  assert.equal(await store.waitForClaim(request.id, 100), false);
  assert.equal(store.claim(request.id).reason, "not-found");
  assert.deepEqual(store.pending(), []);
});

test("expired requests are pruned and cannot be claimed", () => {
  let clock = 1_000;
  const store = createOpenRequestStore({ now: () => clock, ttlMs: 2_000 });
  const request = store.add("target", "https://www.target.com/p/restocks/A-95298172");
  clock += 5_000;
  assert.deepEqual(store.pending(), []);
  assert.equal(store.claim(request.id).reason, "not-found");
});
