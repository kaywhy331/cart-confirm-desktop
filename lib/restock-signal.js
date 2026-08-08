"use strict";

const { buildAmazonActionUrls, sanitizeAmazonActionUrl } = require("./amazon-entry");
const { RETAILERS, detectRetailer, extractSku, normalizeSku } = require("./retailers");
const { buildWalmartBuyNowUrl, sanitizeWalmartBuyNowUrl } = require("./walmart-entry");

const RETAILER_PATTERNS = Object.freeze({
  target: /(?:^|\s|@|#)target(?:\s|$|\d)/i,
  walmart: /(?:^|\s|@|#)walmart(?:\s|$)/i,
  amazon: /(?:^|\s|@|#)(?:amazon|amzn)(?:\s|$)/i
});
const FIELD_ALIASES = Object.freeze({
  sku: new Set(["sku", "asin", "tcin", "item id", "itemid"]),
  price: new Set(["price"]),
  stock: new Set(["stock", "quantity available"]),
  orderLimit: new Set(["order limit", "limit", "max quantity"]),
  offerId: new Set(["offer id", "offerid", "offer listing id", "offerlistingid"]),
  seller: new Set(["seller", "sold by"])
});

function cleanText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanFieldName(value) {
  return String(value || "").replace(/[*_:`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function numericValue(value, { integer = false, maximum = 1_000_000 } = {}) {
  const match = String(value || "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0 || number > maximum) return null;
  return integer ? Math.floor(number) : Math.round(number * 100) / 100;
}

function messageParts(message = {}) {
  const text = [];
  const fields = [];
  const links = [];
  if (message.content) text.push(String(message.content));
  for (const embed of Array.isArray(message.embeds) ? message.embeds : []) {
    if (embed?.title) text.push(String(embed.title));
    if (embed?.description) text.push(String(embed.description));
    if (embed?.url) links.push({ label: "product", url: String(embed.url) });
    if (embed?.author?.name) text.push(String(embed.author.name));
    if (embed?.footer?.text) text.push(String(embed.footer.text));
    for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
      fields.push({ name: String(field?.name || ""), value: String(field?.value || "") });
      text.push(`${field?.name || ""} ${field?.value || ""}`);
    }
  }
  const stack = [...(Array.isArray(message.components) ? message.components : [])];
  while (stack.length) {
    const component = stack.shift();
    if (Array.isArray(component?.components)) stack.push(...component.components);
    if (component?.url) links.push({ label: String(component.label || ""), url: String(component.url) });
  }
  const urlPattern = /https:\/\/[^\s<>`]+/gi;
  for (const part of text) {
    for (const match of String(part).matchAll(urlPattern)) {
      links.push({ label: "", url: match[0].replace(/[),.;]+$/, "") });
    }
  }
  return { text, fields, links };
}

function aliasedField(fields, alias) {
  const names = FIELD_ALIASES[alias];
  return fields.find((field) => names.has(cleanFieldName(field.name)))?.value || "";
}

function detectSignalRetailer(parts) {
  for (const link of parts.links) {
    const retailer = detectRetailer(link.url);
    if (retailer) return retailer;
  }
  const combined = parts.text.join("\n");
  return Object.keys(RETAILER_PATTERNS).find((retailer) => RETAILER_PATTERNS[retailer].test(combined)) || "";
}

function detectSignalSku(retailer, parts) {
  const explicit = aliasedField(parts.fields, "sku");
  if (retailer) {
    const sku = extractSku(retailer, explicit)
      || parts.links.map((link) => extractSku(retailer, link.url)).find(Boolean)
      || parts.text.map((part) => extractSku(retailer, part)).find(Boolean);
    if (!sku) return "";
    try {
      return normalizeSku(retailer, sku);
    } catch {
      return "";
    }
  }
  const matches = Object.keys(RETAILERS).map((candidate) => ({
    retailer: candidate,
    sku: extractSku(candidate, explicit) || parts.text.map((part) => extractSku(candidate, part)).find(Boolean)
  })).filter((candidate) => candidate.sku);
  return matches.length === 1 ? matches[0].sku : "";
}

function canonicalProductUrl(retailer, sku) {
  if (retailer === "target") return `https://www.target.com/p/-/A-${sku}`;
  if (retailer === "walmart") return `https://www.walmart.com/ip/${sku}`;
  if (retailer === "amazon") return `https://www.amazon.com/dp/${sku}`;
  return "";
}

function productLink(retailer, sku, links) {
  for (const link of links) {
    if (detectRetailer(link.url) !== retailer) continue;
    if (extractSku(retailer, link.url) === sku && !sanitizeAmazonActionUrl(link.url, sku)) {
      return canonicalProductUrl(retailer, sku);
    }
  }
  return canonicalProductUrl(retailer, sku);
}

function signalTitle(message, parts, retailer, sku) {
  const embedTitle = (Array.isArray(message.embeds) ? message.embeds : [])
    .map((embed) => cleanText(embed?.title, 120))
    .find(Boolean);
  if (embedTitle) return embedTitle;
  const lines = String(message.content || "").split(/\r?\n/).map((line) => cleanText(line, 120));
  const metadata = /^(?:sku|price|stock|order limit|offer id|seller|search term)\b/i;
  const title = lines.find((line) => (
    line
    && !metadata.test(line)
    && !/^https:\/\//i.test(line)
    && line !== sku
    && !/^restock alert bot$/i.test(line)
  ));
  return cleanText(title || `${RETAILERS[retailer]?.label || "Product"} ${sku}`, 120);
}

function amazonLinks(parts, sku, offerId, quantity) {
  let amazonAtcUrl = "";
  let amazonBuyNowUrl = "";
  for (const link of parts.links) {
    const sanitized = sanitizeAmazonActionUrl(link.url, sku);
    if (!sanitized) continue;
    if (sanitized.kind === "amazon-atc") amazonAtcUrl ||= sanitized.url;
    if (sanitized.kind === "amazon-buy-now") amazonBuyNowUrl ||= sanitized.url;
  }
  if ((!amazonAtcUrl || !amazonBuyNowUrl) && offerId) {
    const built = buildAmazonActionUrls(sku, offerId, quantity);
    amazonAtcUrl ||= built.amazonAtcUrl;
    amazonBuyNowUrl ||= built.amazonBuyNowUrl;
  }
  return { amazonAtcUrl, amazonBuyNowUrl };
}

function walmartBuyNowLink(parts, sku) {
  for (const link of parts.links) {
    const sanitized = sanitizeWalmartBuyNowUrl(link.url, sku);
    if (sanitized) return sanitized.url;
  }
  return buildWalmartBuyNowUrl(sku);
}

function parseDiscordRestockMessage(message = {}) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const parts = messageParts(message);
  const retailer = detectSignalRetailer(parts);
  const sku = detectSignalSku(retailer, parts);
  if (!retailer || !sku) return null;

  const price = numericValue(aliasedField(parts.fields, "price"));
  const stock = numericValue(aliasedField(parts.fields, "stock"), { integer: true, maximum: 1_000_000 });
  const orderLimit = numericValue(aliasedField(parts.fields, "orderLimit"), { integer: true, maximum: 99 });
  const offerId = cleanText(aliasedField(parts.fields, "offerId"), 2_000);
  const seller = cleanText(aliasedField(parts.fields, "seller"), 120);
  const direct = retailer === "amazon" ? amazonLinks(parts, sku, offerId, 1) : {};
  const walmartBuyNowUrl = retailer === "walmart" ? walmartBuyNowLink(parts, sku) : "";
  const timestamp = new Date(message.timestamp || Date.now());
  const observedAt = Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
  const messageId = cleanText(message.id, 40);
  const channelId = cleanText(message.channel_id || message.channelId, 40);

  return Object.freeze({
    id: messageId ? `discord:${messageId}` : `discord:${retailer}:${sku}:${observedAt}`,
    source: "discord",
    messageId,
    channelId,
    retailer,
    sku,
    productId: `${retailer}:${sku}`,
    title: signalTitle(message, parts, retailer, sku),
    price,
    stock,
    orderLimit,
    seller,
    productUrl: productLink(retailer, sku, parts.links),
    walmartBuyNowUrl,
    amazonAtcUrl: direct.amazonAtcUrl || "",
    amazonBuyNowUrl: direct.amazonBuyNowUrl || "",
    observedAt
  });
}

function matchSignalProduct(signal, products = []) {
  if (!signal?.productId) return null;
  return products.find((product) => product?.id === signal.productId) || null;
}

module.exports = {
  canonicalProductUrl,
  matchSignalProduct,
  parseDiscordRestockMessage
};
