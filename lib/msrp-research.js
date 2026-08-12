"use strict";

const crypto = require("node:crypto");
const { RETAILERS, normalizeMsrpRecord } = require("./item-defaults");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MSRP_MODEL = "gpt-5.6";
const MSRP_RESEARCH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_RESEARCH_RECORDS = 20;
const MAX_RESEARCH_SUGGESTIONS = 60;

function emptyMsrpResearchState() {
  return { version: 1, lastRunAt: "", lastError: "", suggestions: [] };
}

function cleanText(value, maximum = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizeTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function sourceKey(value) {
  const normalized = normalizeHttpsUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  url.searchParams.delete("utm_source");
  url.searchParams.delete("utm_medium");
  url.searchParams.delete("utm_campaign");
  return url.toString().replace(/\/$/, "");
}

function normalizePersistedSuggestion(value, catalogIds = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const recordId = cleanText(value.recordId, 80);
  const retailer = cleanText(value.retailer, 20).toLowerCase();
  const price = Math.round(Number(value.price) * 100) / 100;
  const sourceUrl = normalizeHttpsUrl(value.sourceUrl);
  if (!recordId || (catalogIds && !catalogIds.has(recordId))) return null;
  if (!RETAILERS.includes(retailer) || !Number.isFinite(price) || price <= 0 || price > 1_000_000 || !sourceUrl) return null;
  return {
    id: cleanText(value.id, 100) || crypto.createHash("sha256").update(`${recordId}:${retailer}:${price}:${sourceUrl}`).digest("hex").slice(0, 24),
    recordId,
    retailer,
    price,
    sourceUrl,
    sourceTitle: cleanText(value.sourceTitle, 160),
    rationale: cleanText(value.rationale, 500),
    researchedAt: normalizeTimestamp(value.researchedAt) || new Date().toISOString(),
    model: cleanText(value.model, 80) || OPENAI_MSRP_MODEL
  };
}

function normalizeMsrpResearchState(input, catalog = []) {
  const catalogIds = new Set(catalog.map((record) => record.id));
  const suggestions = [];
  const keys = new Set();
  for (const candidate of Array.isArray(input?.suggestions) ? input.suggestions : []) {
    const suggestion = normalizePersistedSuggestion(candidate, catalogIds);
    if (!suggestion) continue;
    const key = `${suggestion.recordId}:${suggestion.retailer}`;
    if (keys.has(key)) continue;
    keys.add(key);
    suggestions.push(suggestion);
    if (suggestions.length >= MAX_RESEARCH_SUGGESTIONS) break;
  }
  return {
    version: 1,
    lastRunAt: normalizeTimestamp(input?.lastRunAt),
    lastError: cleanText(input?.lastError, 500),
    suggestions
  };
}

function approveMsrpSuggestion(catalog, value) {
  const records = Array.isArray(catalog) ? catalog : [];
  const catalogIds = new Set(records.map((record) => record.id));
  const suggestion = normalizePersistedSuggestion(value, catalogIds);
  if (!suggestion) throw new Error("That MSRP suggestion is no longer valid.");
  if (!catalogIds.has(suggestion.recordId)) {
    throw new Error("That MSRP product type is no longer available.");
  }
  return records.map((record) => record.id === suggestion.recordId
    ? normalizeMsrpRecord({
        ...record,
        prices: { ...record.prices, [suggestion.retailer]: suggestion.price },
        sources: {
          ...record.sources,
          [suggestion.retailer]: {
            label: suggestion.sourceTitle || "Cited OpenAI web research",
            url: suggestion.sourceUrl,
            verifiedAt: suggestion.researchedAt
          }
        }
      })
    : record);
}

function researchIsDue(state, now = Date.now()) {
  const last = new Date(state?.lastRunAt || "").getTime();
  return !Number.isFinite(last) || now - last >= MSRP_RESEARCH_INTERVAL_MS;
}

function responseOutputText(response) {
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return typeof response?.output_text === "string" ? response.output_text : "";
}

function responseSources(response) {
  const sources = new Map();
  const add = (urlValue, titleValue) => {
    const url = normalizeHttpsUrl(urlValue);
    const key = sourceKey(url);
    if (key) sources.set(key, { url, title: cleanText(titleValue, 160) });
  };
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type === "web_search_call") {
      for (const source of Array.isArray(item.action?.sources) ? item.action.sources : []) add(source.url, source.title);
    }
    if (item?.type === "message") {
      for (const content of Array.isArray(item.content) ? item.content : []) {
        for (const annotation of Array.isArray(content.annotations) ? content.annotations : []) {
          const citation = annotation.url_citation || annotation;
          if (annotation.type === "url_citation" || annotation.url_citation) add(citation.url, citation.title);
        }
      }
    }
  }
  return sources;
}

const SUGGESTION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      maxItems: MAX_RESEARCH_SUGGESTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["recordId", "retailer", "price", "sourceUrl", "sourceTitle", "rationale"],
        properties: {
          recordId: { type: "string" },
          retailer: { type: "string", enum: RETAILERS },
          price: { type: "number", exclusiveMinimum: 0, maximum: 1_000_000 },
          sourceUrl: { type: "string" },
          sourceTitle: { type: "string" },
          rationale: { type: "string" }
        }
      }
    }
  }
});

function researchRequest(catalog) {
  const records = catalog.slice(0, MAX_RESEARCH_RECORDS).map((record) => ({
    id: record.id,
    productLine: record.productLine,
    productType: record.productType,
    matchTerms: record.matchTerms,
    excludeTerms: record.excludeTerms,
    currentApprovedPrices: record.prices
  }));
  return {
    model: OPENAI_MSRP_MODEL,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "Research current standard US retail/MSRP prices for the supplied sealed product types. Prefer official manufacturer and official Target, Walmart, or Amazon first-party pages. Never use marketplace/reseller, used, auction, sponsored, sale/clearance, bundle, exclusive, or third-party prices. Omit any retailer price that is ambiguous, unavailable, or not supported by a cited URL. Return only the requested JSON schema." }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `As of ${new Date().toISOString().slice(0, 10)}, research these records for Target, Walmart, and Amazon. Keep recordId exact.\n${JSON.stringify(records)}` }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "msrp_research_suggestions",
        strict: true,
        schema: SUGGESTION_SCHEMA
      }
    }
  };
}

async function researchMsrpWithOpenAi(options = {}) {
  const catalog = Array.isArray(options.catalog) ? options.catalog.slice(0, MAX_RESEARCH_RECORDS) : [];
  if (!catalog.length) throw new Error("Add at least one MSRP product type before researching prices.");
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) throw new Error("Configure an OpenAI API key before researching prices.");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5_000, Number(options.timeoutMs || 60_000)));
  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(researchRequest(catalog)),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("MSRP research timed out before OpenAI returned cited results.");
    throw new Error(`MSRP research could not reach OpenAI: ${cleanText(error?.message || "network error", 200)}`);
  } finally {
    clearTimeout(timeout);
  }
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error("OpenAI returned an unreadable MSRP research response.");
  }
  if (!response.ok) {
    throw new Error(`OpenAI MSRP research failed (${response.status}): ${cleanText(body?.error?.message || "request rejected", 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(responseOutputText(body));
  } catch {
    throw new Error("OpenAI did not return the required MSRP suggestion structure.");
  }
  const catalogIds = new Set(catalog.map((record) => record.id));
  const sources = responseSources(body);
  const researchedAt = new Date(options.now || Date.now()).toISOString();
  const suggestions = [];
  const keys = new Set();
  for (const raw of Array.isArray(parsed?.suggestions) ? parsed.suggestions : []) {
    const trustedSource = sources.get(sourceKey(raw?.sourceUrl));
    if (!trustedSource) continue;
    const suggestion = normalizePersistedSuggestion({
      ...raw,
      sourceUrl: trustedSource.url,
      sourceTitle: trustedSource.title || raw.sourceTitle,
      researchedAt,
      model: OPENAI_MSRP_MODEL
    }, catalogIds);
    if (!suggestion) continue;
    const key = `${suggestion.recordId}:${suggestion.retailer}`;
    if (keys.has(key)) continue;
    keys.add(key);
    suggestions.push(suggestion);
  }
  if (!suggestions.length) {
    throw new Error("OpenAI returned no MSRP suggestions backed by its reported web-search citations. Approved prices were not changed.");
  }
  return { suggestions, researchedAt, model: OPENAI_MSRP_MODEL };
}

module.exports = {
  MAX_RESEARCH_RECORDS,
  MAX_RESEARCH_SUGGESTIONS,
  MSRP_RESEARCH_INTERVAL_MS,
  OPENAI_MSRP_MODEL,
  OPENAI_RESPONSES_URL,
  approveMsrpSuggestion,
  emptyMsrpResearchState,
  normalizeMsrpResearchState,
  researchIsDue,
  researchMsrpWithOpenAi,
  researchRequest,
  responseSources
};
