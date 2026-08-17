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
  assert.match(html, /data-field=["']affiliateOpenUrl["']/i);
  assert.doesNotMatch(html, /Resolve once|Resolve again/i);
  assert.doesNotMatch(preload, /resolveHowlLink|resolve-howl-link/);
  assert.doesNotMatch(main, /ipcMain\.handle\(["']cart-assist:resolve-howl-link/);
  assert.match(main, /async function openMissionProduct[\s\S]*?missionOpenUrl\(product\)/);
  assert.match(main, /cart-assist:open-product["'], \(_event, productId\) => openMissionProduct\(productId\)/);
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

test("every automation open path prefers the mission's affiliate link", () => {
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");

  // The companion config hands the extension a validated affiliate-first URL.
  assert.match(main, /openUrl: missionOpenUrl\(product\)/);
  // Desktop-driven opens (default, plan fan-out, companion bootstrap) are
  // affiliate-first, and an affiliate open still counts as product entry.
  assert.match(main, /options\.urlOverride \|\| missionOpenUrl\(product\)/);
  assert.match(main, /openExternalRetailer\(missionOpenUrl\(product\), \{ \.\.\.openOptions/);
  assert.equal((main.match(/openExternalRetailer\(missionOpenUrl\(bootstrap\)/g) || []).length, 2);
  assert.match(main, /!\[product\.productUrl, missionOpenUrl\(product\)\]\.includes\(requested\.parsed\.href\)/);
  // The extension navigates product pages with the same priority.
  assert.equal((content.match(/location\.assign\(product\.openUrl \|\| product\.productUrl\)/g) || []).length, 3);
  assert.doesNotMatch(content, /location\.assign\(product\.productUrl\)/);
  assert.match(background, /url: product\.openUrl \|\| product\.productUrl/);
  assert.match(background, /tabs\.create\(\{ url: product\.openUrl \|\| product\.productUrl, active \}\)/);
  // The mission form documents the affiliate-first behavior.
  assert.match(html, /Preferred whenever Cart Confirm opens this product/);
});
