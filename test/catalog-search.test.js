"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const Retailers = require("../extension/retailers");
const {
  buildSearchUrl,
  inspectSearchPage,
  searchPageContext
} = require("../extension/catalog-search");

test("catalog search builds only official keyword result URLs", () => {
  assert.equal(buildSearchUrl("target", "pokemon cards"), "https://www.target.com/s?searchTerm=pokemon%20cards");
  assert.equal(buildSearchUrl("walmart", "pokemon cards"), "https://www.walmart.com/search?q=pokemon%20cards");
  assert.equal(buildSearchUrl("amazon", "pokemon cards"), "https://www.amazon.com/s?k=pokemon%20cards");
  assert.deepEqual(
    searchPageContext("https://www.target.com/s?searchTerm=pokemon%20cards", Retailers),
    { retailer: "target", query: "pokemon cards" }
  );
  assert.equal(searchPageContext("https://www.target.com/p/item/-/A-1011209279", Retailers), null);
});

test("catalog search reads exact IDs, titles, canonical URLs, and displayed prices from result cards", () => {
  const cases = [
    {
      url: "https://www.target.com/s?searchTerm=pokemon",
      html: `<main>
        <article data-test="@web/ProductCard/ProductCardVariantDefault">
          <a href="/p/pokemon-booster/-/A-1011209279?preselect=1011209279"><span data-test="product-title">Pokémon Booster Bundle</span></a>
          <span data-test="current-price">$34.99</span>
        </article>
      </main>`,
      expected: ["target:1011209279", "https://www.target.com/p/pokemon-booster/-/A-1011209279", 34.99]
    },
    {
      url: "https://www.walmart.com/search?q=pokemon",
      html: `<main>
        <div data-item-id="95163305">
          <a href="/ip/Pokemon-Collection/95163305?athbdg=L1100"><span data-automation-id="product-title">Pokémon Collection</span></a>
          <span data-automation-id="product-price">Now $31.97</span>
        </div>
      </main>`,
      expected: ["walmart:95163305", "https://www.walmart.com/ip/95163305", 31.97]
    },
    {
      url: "https://www.amazon.com/s?k=pokemon",
      html: `<main>
        <div data-component-type="s-search-result" data-asin="B0ABC12345">
          <h2><a href="/Pokemon-Box/dp/B0ABC12345/ref=sr_1_1"><span>Pokémon Trainer Box</span></a></h2>
          <span class="a-price"><span class="a-offscreen">$49.99</span></span>
        </div>
      </main>`,
      expected: ["amazon:B0ABC12345", "https://www.amazon.com/dp/B0ABC12345", 49.99]
    }
  ];

  for (const fixture of cases) {
    const dom = new JSDOM(fixture.html, { url: fixture.url });
    const capture = inspectSearchPage(dom.window.document, fixture.url, Retailers, Date.parse("2026-08-11T12:00:00Z"));
    assert.equal(capture.results.length, 1);
    assert.equal(capture.results[0].id, fixture.expected[0]);
    assert.equal(capture.results[0].productUrl, fixture.expected[1]);
    assert.equal(capture.results[0].price, fixture.expected[2]);
    assert.equal(capture.results[0].observedAt, "2026-08-11T12:00:00.000Z");
    dom.window.close();
  }
});

test("catalog search ignores hidden, duplicate, malformed, and non-result links", () => {
  const url = "https://www.amazon.com/s?k=pokemon";
  const dom = new JSDOM(`<style>.not-visible { display: none; }</style><main>
    <div data-component-type="s-search-result" class="not-visible">
      <h2><a href="/dp/B0HIDDEN01"><span>Hidden Box</span></a></h2>
    </div>
    <div data-component-type="s-search-result">
      <h2><a href="/dp/B0ABC12345"><span>Visible Box</span></a></h2>
      <span class="a-price"><span class="a-offscreen">Price unavailable</span></span>
    </div>
    <div data-component-type="s-search-result">
      <h2><a href="/other/dp/B0ABC12345"><span>Duplicate Box</span></a></h2>
    </div>
    <a href="/gp/help/customer/display.html">Help</a>
  </main>`, { url });
  const capture = inspectSearchPage(dom.window.document, url, Retailers);
  assert.equal(capture.results.length, 1);
  assert.equal(capture.results[0].title, "Visible Box");
  assert.equal(capture.results[0].price, null);
  dom.window.close();
});

test("catalog search caps each retailer capture at 20 rendered results", () => {
  const url = "https://www.target.com/s?searchTerm=cards";
  const cards = Array.from({ length: 24 }, (_, index) => {
    const sku = String(1011209000 + index);
    return `<article data-test="ProductCard"><a href="/p/card-${index}/-/A-${sku}"><span data-test="product-title">Card ${index}</span></a></article>`;
  }).join("");
  const dom = new JSDOM(`<main>${cards}</main>`, { url });
  assert.equal(inspectSearchPage(dom.window.document, url, Retailers).results.length, 20);
  dom.window.close();
});
