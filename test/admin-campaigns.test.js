"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  clearHowlCampaign,
  provisionHowlCampaign
} = require("../lib/admin-campaigns");

const PRODUCT = Object.freeze({
  productUrl: "https://www.target.com/p/example/-/A-95298172",
  sku: "95298172",
  maxPrice: 40,
  quantity: 1,
  action: "watch"
});

test("Howl provisioning is absent from the user renderer and preload boundary", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");

  assert.doesNotMatch(html, /data-field=["']howlUrl["']/i);
  assert.doesNotMatch(html, /Resolve once|Resolve again/i);
  assert.doesNotMatch(preload, /resolveHowlLink|resolve-howl-link/);
  assert.doesNotMatch(main, /ipcMain\.handle\(["']cart-assist:resolve-howl-link/);
});

test("the admin workflow resolves and attaches an exact-product campaign", async () => {
  const affiliateUrl = "https://www.target.com/p/example/-/A-95298172?nrtv_cid=admin&clkid=123";
  const calls = [];
  const provisioned = await provisionHowlCampaign(PRODUCT, "https://howl.me/admin-campaign", {
    request: async (url) => {
      calls.push(url);
      return { statusCode: 302, location: affiliateUrl };
    }
  });

  assert.deepEqual(calls, ["https://howl.me/admin-campaign"]);
  assert.equal(provisioned.id, "target:95298172");
  assert.equal(provisioned.howlUrl, "https://howl.me/admin-campaign");
  assert.equal(provisioned.affiliateUrl, affiliateUrl);
  assert.equal(provisioned.affiliateResolvedFrom, provisioned.howlUrl);
  assert.match(provisioned.affiliateResolvedAt, /^\d{4}-\d{2}-\d{2}T/);

  const cleared = clearHowlCampaign(provisioned);
  assert.equal(cleared.howlUrl, "");
  assert.equal(cleared.affiliateUrl, "");
  assert.equal(cleared.affiliateResolvedFrom, "");
  assert.equal(cleared.affiliateResolvedAt, "");
});

test("the admin workflow rejects a campaign for another product", async () => {
  await assert.rejects(provisionHowlCampaign(PRODUCT, "https://howl.me/wrong-product", {
    request: async () => ({
      statusCode: 302,
      location: "https://www.target.com/p/other/-/A-1011483406?nrtv_cid=wrong"
    })
  }), /does not match this mission's item ID/);
});
