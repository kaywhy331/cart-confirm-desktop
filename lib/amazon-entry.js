"use strict";

const AMAZON_HOSTS = new Set(["amazon.com", "www.amazon.com"]);
const AMAZON_ATC_PATH = "/gp/aws/cart/add.html";
const AMAZON_BUY_NOW_PATH = "/gp/buy/express/handlers/display.html";
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

function cleanOfferId(value) {
  let offerId = String(value || "").trim();
  if (!offerId) return "";
  try {
    offerId = decodeURIComponent(offerId);
  } catch {
    // A literal offer identifier is still usable; URLSearchParams will safely encode it.
  }
  return offerId.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 2_000);
}

function cleanAsin(value) {
  const asin = String(value || "").trim().toUpperCase();
  return ASIN_PATTERN.test(asin) ? asin : "";
}

function cleanQuantity(value, fallback = 1) {
  const quantity = Number(value);
  if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 99) return quantity;
  return fallback;
}

function parameter(params, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [name, value] of params) {
    if (wanted.has(name.toLowerCase())) return value;
  }
  return "";
}

function sanitizeAmazonActionUrl(value, expectedAsin = "") {
  let input;
  try {
    input = new URL(String(value || "").trim());
  } catch {
    return null;
  }
  if (input.protocol !== "https:" || !AMAZON_HOSTS.has(input.hostname.toLowerCase())) return null;

  const path = input.pathname.replace(/\/{2,}/g, "/").toLowerCase();
  const kind = path === AMAZON_ATC_PATH
    ? "amazon-atc"
    : path === AMAZON_BUY_NOW_PATH
      ? "amazon-buy-now"
      : "";
  if (!kind) return null;

  const asin = cleanAsin(parameter(input.searchParams, ["ASIN", "ASIN.1"]));
  const requiredAsin = cleanAsin(expectedAsin);
  if (!asin || (requiredAsin && asin !== requiredAsin)) return null;

  const offerId = cleanOfferId(parameter(input.searchParams, ["offerListingID", "OfferListingId.1"]));
  const quantity = cleanQuantity(parameter(input.searchParams, ["quantity", "Quantity.1"]));
  const output = new URL(`https://www.amazon.com${kind === "amazon-atc" ? AMAZON_ATC_PATH : AMAZON_BUY_NOW_PATH}`);
  if (kind === "amazon-atc") {
    output.searchParams.set("ASIN.1", asin);
    output.searchParams.set("Quantity.1", String(quantity));
    if (offerId) output.searchParams.set("OfferListingId.1", offerId);
  } else {
    output.searchParams.set("ASIN", asin);
    output.searchParams.set("quantity", String(quantity));
    if (offerId) output.searchParams.set("offerListingID", offerId);
  }
  return Object.freeze({ kind, url: output.href, asin, offerId, quantity });
}

function buildAmazonActionUrls(asinValue, offerIdValue, quantityValue = 1) {
  const asin = cleanAsin(asinValue);
  const offerId = cleanOfferId(offerIdValue);
  if (!asin || !offerId) return Object.freeze({ amazonAtcUrl: "", amazonBuyNowUrl: "" });
  const quantity = cleanQuantity(quantityValue);
  const atc = new URL(`https://www.amazon.com${AMAZON_ATC_PATH}`);
  atc.searchParams.set("ASIN.1", asin);
  atc.searchParams.set("Quantity.1", String(quantity));
  atc.searchParams.set("OfferListingId.1", offerId);
  const buyNow = new URL(`https://www.amazon.com${AMAZON_BUY_NOW_PATH}`);
  buyNow.searchParams.set("ASIN", asin);
  buyNow.searchParams.set("quantity", String(quantity));
  buyNow.searchParams.set("offerListingID", offerId);
  return Object.freeze({ amazonAtcUrl: atc.href, amazonBuyNowUrl: buyNow.href });
}

module.exports = {
  AMAZON_ATC_PATH,
  AMAZON_BUY_NOW_PATH,
  buildAmazonActionUrls,
  cleanOfferId,
  sanitizeAmazonActionUrl
};
