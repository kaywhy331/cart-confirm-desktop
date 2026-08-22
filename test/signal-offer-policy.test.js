"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const OfferPolicy = require("../lib/offer-policy");
const Safety = require("../extension/safety");

test("the packaged Node policy and bundled browser policy stay identical", () => {
  assert.equal(
    fs.readFileSync(path.join(__dirname, "..", "lib", "offer-policy.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "..", "extension", "offer-policy.js"), "utf8")
  );
});

const product = {
  id: "walmart:123456789",
  retailer: "walmart",
  sku: "123456789",
  maxPrice: 60,
  quantity: 1
};

function signalProduct(overrides = {}) {
  return {
    ...product,
    signalOffer: {
      maximumPrice: 49.99,
      seller: "Acme Collectibles",
      firstParty: false,
      allowThirdPartySeller: true,
      ...overrides
    }
  };
}

test("ordinary missions remain first-party-only", () => {
  assert.equal(OfferPolicy.validateOffer(product, {
    price: 39.99,
    seller: "Walmart.com",
    firstParty: true
  }).reason, "out-of-stock", "availability must be positively re-proven");
  assert.equal(OfferPolicy.validateOffer(product, {
    available: true,
    price: 39.99,
    seller: "Walmart.com",
    firstParty: true
  }).ok, true);
  assert.equal(OfferPolicy.validateOffer(product, {
    available: true,
    price: 39.99,
    seller: "Acme Collectibles",
    firstParty: false
  }).reason, "third-party");
});

test("a signal price is an additional live ceiling and lower prices remain valid", () => {
  assert.equal(OfferPolicy.validateOffer(signalProduct(), {
    available: true,
    price: 44.99,
    seller: "Sold by Acme Collectibles",
    firstParty: false
  }).ok, true);
  assert.equal(OfferPolicy.validateOffer(signalProduct(), {
    available: true,
    price: 50,
    seller: "Acme Collectibles",
    firstParty: false
  }).reason, "signal-price-mismatch");
  assert.equal(OfferPolicy.validateOffer(signalProduct({ maximumPrice: 70 }), {
    available: true,
    price: 60.01,
    seller: "Acme Collectibles",
    firstParty: false
  }).reason, "over-price");
});

test("third-party permission is explicit and binds a named marketplace seller", () => {
  assert.equal(OfferPolicy.validateOffer(signalProduct({ allowThirdPartySeller: false }), {
    available: true,
    price: 39.99,
    seller: "Acme Collectibles",
    firstParty: false
  }).reason, "third-party");
  assert.equal(OfferPolicy.validateOffer(signalProduct(), {
    available: true,
    price: 39.99,
    seller: "Another Seller",
    firstParty: false
  }).reason, "signal-seller-mismatch");
  assert.equal(OfferPolicy.validateOffer(signalProduct(), {
    available: true,
    price: 39.99,
    seller: "",
    firstParty: false
  }).reason, "seller-unverified");
  assert.equal(OfferPolicy.validateOffer(signalProduct(), {
    available: true,
    price: 39.99,
    seller: "Walmart.com",
    firstParty: true
  }).reason, "signal-seller-mismatch");
});

test("cart and checkout offer validation preserve the same signal binding", () => {
  const bound = signalProduct();
  const matching = Safety.effectiveLineOffer(bound, {
    seller: "Sold by Acme Collectibles",
    firstParty: false,
    price: 44.99,
    quantity: 1
  });
  assert.equal(matching.ok, true);
  assert.equal(matching.firstParty, false);

  const proofBacked = Safety.effectiveLineOffer(bound, {
    seller: "",
    firstParty: false,
    price: 44.99,
    quantity: 1
  }, {
    seller: "Acme Collectibles",
    firstParty: false,
    price: 44.99
  });
  assert.equal(proofBacked.ok, true);
  assert.equal(Safety.effectiveLineOffer(bound, {
    seller: "Another Seller",
    firstParty: false,
    price: 44.99,
    quantity: 1
  }, proofBacked).reason, "signal-seller-mismatch");
});

test("the final extension-owned add authorization independently revalidates the offer proof", () => {
  const background = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  const content = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
  assert.match(background, /prepareProductAddAction[\s\S]*?OfferPolicy\.validateOffer\(product, proof\)/);
  assert.match(background, /authorizeProductAddClick\(productId, ownerId, proof\)[\s\S]*?OfferPolicy\.validateOffer\(product, proof\)/);
  assert.match(background, /CART_CONFIRM_AUTHORIZE_ADD_CLICK[\s\S]*?message\.proof/);
  assert.match(content, /function proofInput[\s\S]*?available: offer\?\.available === true/);
  assert.match(content, /const preparedOffer = adapter\.offer\(document, product\)[\s\S]*?prepareAddAction\(product, preparedOffer\)/);
  assert.match(content, /const finalOffer = adapter\.offer\(document, product\)[\s\S]*?clickAction\(finalOffer\.addButton[\s\S]*?authorizationOffer = adapter\.offer\(document, product\)[\s\S]*?authorizeAddClick\(product, authorizationOffer\)/);
});
