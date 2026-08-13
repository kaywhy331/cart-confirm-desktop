"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { chooseReusableTab, tabSku } = require("../extension/open-request-tabs");

function walmartQueueUrl(itemId) {
  const qpdata = encodeURIComponent(JSON.stringify({
    queued: true,
    customMetadata: { item: { itemID: itemId } }
  }));
  return `https://www.walmart.com/qp?qpdata=${qpdata}&signature=ignored`;
}

const config = {
  products: [
    { id: "walmart:1", retailer: "walmart", sku: "111111111", enabled: true },
    { id: "walmart:2", retailer: "walmart", sku: "222222222", enabled: true },
    { id: "walmart:3", retailer: "walmart", sku: "333333333", enabled: true }
  ]
};

test("the product's own tab is reused first", () => {
  const own = { id: 2, url: "https://www.walmart.com/ip/item/222222222" };
  const chosen = chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [
    { id: 1, active: true, url: "https://www.walmart.com/cart" },
    own
  ]);
  assert.equal(chosen, own);
});

test("an official queue tab remains attached to its mission during fan-out", () => {
  const queued = { id: 1, active: true, url: walmartQueueUrl("111111111") };
  assert.equal(tabSku("walmart", queued.url), "111111111");
  const chosen = chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [
    queued,
    { id: 3, url: "https://www.walmart.com/ip/item/333333333" }
  ]);
  assert.equal(chosen, null, "a fresh tab is required when all tabs belong to other missions");
});

test("an active non-mission store tab is preferred before a recent inactive tab", () => {
  const activeCart = { id: 4, active: true, lastAccessed: 10, url: "https://www.walmart.com/cart" };
  const recentSearch = { id: 5, active: false, lastAccessed: 20, url: "https://www.walmart.com/search?q=item" };
  const chosen = chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [recentSearch, activeCart]);
  assert.equal(chosen, activeCart);
});

test("a dedicated drop request reuses only its exact mission tab", () => {
  const unrelated = { id: 4, active: true, url: "https://www.walmart.com/cart" };
  assert.equal(chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222",
    dedicatedTab: true
  }, [unrelated]), null);

  const own = { id: 5, url: "https://www.walmart.com/ip/item/222222222" };
  assert.equal(chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222",
    dedicatedTab: true
  }, [unrelated, own]), own);
});
