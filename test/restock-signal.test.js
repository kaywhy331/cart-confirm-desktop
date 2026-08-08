"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { matchSignalProduct, parseDiscordRestockMessage } = require("../lib/restock-signal");

function embedMessage(id, title, retailerText, fields, components = []) {
  return {
    id,
    channel_id: "123456789012345678",
    timestamp: "2026-08-08T17:20:00.000Z",
    content: retailerText,
    embeds: [{ title, fields: Object.entries(fields).map(([name, value]) => ({ name, value })) }],
    components
  };
}

test("Target stock embeds normalize into a catalog identity", () => {
  const signal = parseDiscordRestockMessage(embedMessage(
    "2001",
    "Pokemon Trading Card Game: Mega Evolution Pitch Black Elite Trainer Box [High Stock]",
    "<@&target-role> @Target 2",
    { SKU: "1011483406", Price: "$59.99", Stock: "10", "Order Limit": "2" }
  ));
  assert.deepEqual({
    retailer: signal.retailer,
    sku: signal.sku,
    productId: signal.productId,
    price: signal.price,
    stock: signal.stock,
    orderLimit: signal.orderLimit,
    productUrl: signal.productUrl
  }, {
    retailer: "target",
    sku: "1011483406",
    productId: "target:1011483406",
    price: 59.99,
    stock: 10,
    orderLimit: 2,
    productUrl: "https://www.target.com/p/-/A-1011483406"
  });
});

test("Walmart alerts match existing missions by normalized store and SKU", () => {
  const buyNow = "https://www.walmart.com/affil/cart/buynow?items=20243261734&veh=aff";
  const signal = parseDiscordRestockMessage(embedMessage(
    "2002",
    "Pokemon Trading Card Games Mega Evolution 5 Pitch Black Booster Bundle",
    "@Walmart",
    { SKU: "20243261734", Price: "$31.97", "Order Limit": "12" },
    [{ components: [{ type: 2, label: "Buy Now", url: buyNow }] }]
  ));
  const product = { id: "walmart:20243261734", title: "Pitch Black bundle" };
  assert.equal(matchSignalProduct(signal, [product]), product);
  assert.equal(matchSignalProduct(signal, [{ id: "walmart:other" }]), null);
  assert.equal(signal.walmartBuyNowUrl, "https://www.walmart.com/affil/cart/buynow?items=20243261734");
});

test("Walmart alerts synthesize the exact Buy Now URL when no button is present", () => {
  const signal = parseDiscordRestockMessage(embedMessage(
    "2004",
    "Walmart drop without a link button",
    "@Walmart",
    { SKU: "19952559023", Price: "$31.97" }
  ));
  assert.equal(
    signal.walmartBuyNowUrl,
    "https://www.walmart.com/affil/cart/buynow?items=19952559023"
  );
});

test("Amazon embeds ingest seller, offer, ATC, and sanitized Buy Now links", () => {
  const offer = "R%2BJU%2B5L5Om%2FbUwJCA%3D%3D";
  const atc = `https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B0GG16Q4X1&Quantity.1=1&OfferListingId.1=${offer}&tag=affiliate`;
  const buyNow = `https://www.amazon.com/gp/buy/express/handlers/display.html?ASIN=B0GG16Q4X1&quantity=1&offerListingID=${offer}&isEligibilityLogicDisabled=1`;
  const signal = parseDiscordRestockMessage(embedMessage(
    "2003",
    "Pokémon TCG: Mega Evolution—Perfect Order Booster Display Box",
    "@Amzn",
    { SKU: "B0GG16Q4X1", Price: "$179.99", "Offer ID": offer, Seller: "Amazon.com" },
    [{ components: [
      { type: 2, label: "ATC", url: atc },
      { type: 2, label: "Buy Now", url: buyNow }
    ] }]
  ));
  assert.equal(signal.retailer, "amazon");
  assert.equal(signal.sku, "B0GG16Q4X1");
  assert.equal(signal.seller, "Amazon.com");
  assert.match(signal.amazonAtcUrl, /OfferListingId\.1=R%2BJU%2B5L5Om%2FbUwJCA%3D%3D/);
  assert.match(signal.amazonBuyNowUrl, /offerListingID=R%2BJU%2B5L5Om%2FbUwJCA%3D%3D/);
  assert.equal(signal.amazonBuyNowUrl.includes("isEligibilityLogicDisabled"), false);
});

test("non-product Discord chatter is ignored", () => {
  assert.equal(parseDiscordRestockMessage({ id: "x", content: "hello everyone" }), null);
});
