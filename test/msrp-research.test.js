"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OPENAI_MSRP_MODEL,
  OPENAI_RESPONSES_URL,
  approveMsrpSuggestion,
  normalizeMsrpResearchState,
  researchIsDue,
  researchMsrpWithOpenAi
} = require("../lib/msrp-research");

const CATALOG = [{
  id: "msrp:pokemon-etb",
  productLine: "Pokémon",
  productType: "Elite Trainer Box",
  matchTerms: ["elite trainer box", "etb"],
  excludeTerms: [],
  prices: { target: null, walmart: null, amazon: null }
}];

function mockResponse(suggestions, sources) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      output: [
        { type: "web_search_call", action: { sources } },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({ suggestions }),
            annotations: sources.map((source) => ({ type: "url_citation", url: source.url, title: source.title }))
          }]
        }
      ]
    })
  };
}

test("cited OpenAI web research yields review-only normalized MSRP suggestions", async () => {
  let request;
  const result = await researchMsrpWithOpenAi({
    apiKey: "sk-test-key-with-at-least-twenty-characters",
    catalog: CATALOG,
    now: Date.parse("2026-08-12T12:00:00Z"),
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return mockResponse([
        {
          recordId: "msrp:pokemon-etb",
          retailer: "target",
          price: 49.99,
          sourceUrl: "https://www.target.com/p/example?utm_source=test",
          sourceTitle: "Target ETB",
          rationale: "Current first-party listing"
        },
        {
          recordId: "msrp:pokemon-etb",
          retailer: "amazon",
          price: 1,
          sourceUrl: "https://invented.example/uncited",
          sourceTitle: "Uncited",
          rationale: "Must be dropped"
        }
      ], [{ url: "https://www.target.com/p/example", title: "Target official listing" }]);
    }
  });
  assert.equal(request.url, OPENAI_RESPONSES_URL);
  assert.equal(request.options.method, "POST");
  assert.equal(request.body.model, OPENAI_MSRP_MODEL);
  assert.deepEqual(request.body.tools, [{ type: "web_search", search_context_size: "medium" }]);
  assert.deepEqual(request.body.include, ["web_search_call.action.sources"]);
  assert.equal(request.body.text.format.type, "json_schema");
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].retailer, "target");
  assert.equal(result.suggestions[0].price, 49.99);
  assert.equal(result.suggestions[0].sourceUrl, "https://www.target.com/p/example");
  assert.equal(result.suggestions[0].model, OPENAI_MSRP_MODEL);
});

test("uncited or malformed research cannot become a persisted suggestion", async () => {
  await assert.rejects(() => researchMsrpWithOpenAi({
    apiKey: "sk-test-key-with-at-least-twenty-characters",
    catalog: CATALOG,
    fetchImpl: async () => mockResponse([{
      recordId: "msrp:pokemon-etb",
      retailer: "target",
      price: 49.99,
      sourceUrl: "https://uncited.example/product",
      sourceTitle: "Uncited",
      rationale: "No reported source"
    }], [])
  }), /no MSRP suggestions backed/);

  const state = normalizeMsrpResearchState({
    suggestions: [
      { recordId: "missing", retailer: "target", price: 10, sourceUrl: "https://example.com" },
      { recordId: "msrp:pokemon-etb", retailer: "other", price: 10, sourceUrl: "https://example.com" },
      { recordId: "msrp:pokemon-etb", retailer: "target", price: 0, sourceUrl: "https://example.com" }
    ]
  }, CATALOG);
  assert.deepEqual(state.suggestions, []);
});

test("monthly research becomes due after thirty days", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  assert.equal(researchIsDue({}, now), true);
  assert.equal(researchIsDue({ lastRunAt: "2026-07-14T12:00:00Z" }, now), false);
  assert.equal(researchIsDue({ lastRunAt: "2026-07-12T11:59:59Z" }, now), true);
});

test("approving a suggestion changes only its exact retailer and product type", () => {
  const other = {
    ...CATALOG[0],
    id: "msrp:pokemon-upc",
    productType: "Ultra-Premium Collection",
    matchTerms: ["ultra premium collection"]
  };
  const approved = approveMsrpSuggestion([CATALOG[0], other], {
    id: "suggestion-1",
    recordId: "msrp:pokemon-etb",
    retailer: "target",
    price: 49.99,
    sourceUrl: "https://www.target.com/p/example",
    sourceTitle: "Target official listing",
    rationale: "Current first-party listing",
    researchedAt: "2026-08-12T12:00:00Z",
    model: OPENAI_MSRP_MODEL
  });
  assert.equal(approved[0].prices.target, 49.99);
  assert.equal(approved[0].prices.walmart, null);
  assert.equal(approved[0].sources.target.url, "https://www.target.com/p/example");
  assert.equal(approved[1], other);
  assert.throws(() => approveMsrpSuggestion([CATALOG[0]], {
    recordId: "msrp:removed",
    retailer: "target",
    price: 1,
    sourceUrl: "https://www.target.com/p/example"
  }), /no longer valid|no longer available/);
});
