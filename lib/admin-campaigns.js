"use strict";

const { normalizeProduct } = require("./core");
const { resolveHowlLink } = require("./howl-link");

async function provisionHowlCampaign(productInput, howlUrl, options = {}) {
  const product = normalizeProduct(productInput);
  const resolved = await resolveHowlLink(howlUrl, {
    retailer: product.retailer,
    sku: product.sku
  }, options);

  return normalizeProduct({
    ...product,
    howlUrl: resolved.howlUrl,
    affiliateUrl: resolved.affiliateUrl,
    affiliateResolvedFrom: resolved.howlUrl,
    affiliateResolvedAt: resolved.resolvedAt
  });
}

function clearHowlCampaign(productInput) {
  return normalizeProduct({
    ...productInput,
    howlUrl: "",
    affiliateUrl: "",
    affiliateResolvedFrom: "",
    affiliateResolvedAt: ""
  });
}

module.exports = {
  clearHowlCampaign,
  provisionHowlCampaign
};
