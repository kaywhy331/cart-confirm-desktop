"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_PRODUCTS } = require("../lib/core");
const {
  MAX_OPEN_REQUESTS,
  chooseReusableTab,
  partitionOpenRequests,
  purchaseStageTab,
  shouldActivateTab,
  tabSku
} = require("../extension/open-request-tabs");

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

test("only explicit background requests keep their claimed tab inactive", () => {
  assert.equal(shouldActivateTab({ background: true }), false);
  assert.equal(shouldActivateTab({ background: false }), true);
  assert.equal(shouldActivateTab({}), true);
});

test("the browser drains the full 100-mission request batch", () => {
  const requests = Array.from({ length: MAX_PRODUCTS + 1 }, (_, index) => ({
    id: index,
    dedicatedTab: index % 2 === 0
  }));
  const { dedicated, ordinary } = partitionOpenRequests(requests);
  assert.equal(MAX_OPEN_REQUESTS, MAX_PRODUCTS);
  assert.equal(dedicated.length + ordinary.length, 100);
  assert.equal([...dedicated, ...ordinary].some((request) => request.id === 100), false);
});

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
  const activeHome = { id: 4, active: true, lastAccessed: 10, url: "https://www.walmart.com/" };
  const recentSearch = { id: 5, active: false, lastAccessed: 20, url: "https://www.walmart.com/search?q=item" };
  const chosen = chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [recentSearch, activeHome]);
  assert.equal(chosen, activeHome);
});

test("a cart tab is never reused, even when it is the active tab", () => {
  const activeCart = { id: 4, active: true, lastAccessed: 30, url: "https://www.walmart.com/cart" };
  const recentSearch = { id: 5, active: false, lastAccessed: 20, url: "https://www.walmart.com/search?q=item" };
  assert.equal(chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [activeCart, recentSearch]), recentSearch);
  assert.equal(chooseReusableTab(config, {
    retailer: "walmart",
    url: "https://www.walmart.com/ip/item/222222222"
  }, [activeCart]), null, "only a cart tab available means a fresh tab is required");
});

test("purchase-stage pages are protected for every supported retailer", () => {
  assert.equal(purchaseStageTab("target", "https://www.target.com/cart"), true);
  assert.equal(purchaseStageTab("target", "https://www.target.com/co-review"), true);
  assert.equal(purchaseStageTab("target", "https://www.target.com/checkout/payment"), true);
  assert.equal(purchaseStageTab("target", "https://www.target.com/p/item/-/A-94336414"), false);
  assert.equal(purchaseStageTab("walmart", "https://www.walmart.com/cart"), true);
  assert.equal(purchaseStageTab("walmart", "https://www.walmart.com/checkout/review-order"), true);
  assert.equal(purchaseStageTab("walmart", "https://www.walmart.com/ip/item/222222222"), false);
  assert.equal(purchaseStageTab("amazon", "https://www.amazon.com/gp/cart/view.html"), true);
  assert.equal(purchaseStageTab("amazon", "https://www.amazon.com/gp/buy/spc/handlers/display.html"), true);
  assert.equal(purchaseStageTab("amazon", "https://www.amazon.com/dp/B0TEST"), false);
  assert.equal(purchaseStageTab("target", "not a url"), false);
});

test("a target cart tab pulled forward by a purchase mission survives watcher fan-out", () => {
  const targetConfig = {
    products: [
      { id: "target:1", retailer: "target", sku: "94336414", enabled: true },
      { id: "target:2", retailer: "target", sku: "1011206804", enabled: true }
    ]
  };
  const activeCart = { id: 9, active: true, lastAccessed: 99, url: "https://www.target.com/cart" };
  const chosen = chooseReusableTab(targetConfig, {
    retailer: "target",
    url: "https://www.target.com/p/other/-/A-1011206804"
  }, [activeCart]);
  assert.equal(chosen, null, "the watcher must open its own tab instead of navigating over the cart");
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
