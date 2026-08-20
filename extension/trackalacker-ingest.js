"use strict";

(function exposeTrackalackerIngest(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CartConfirmTrackalackerIngest = api;
  if (root?.chrome?.runtime?.sendMessage && root?.document) api.install(root);
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const FOLLOWED_URL = "https://www.trackalacker.com/products/followed";
  const SUPPORTED_RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
  const MAX_PAGES = 50;
  const MAX_PRODUCTS = 500;
  const MAX_LISTINGS = 24;
  const FETCH_RETRIES = 2;
  const FETCH_TIMEOUT_MS = 12_000;
  const STORE_NAMES = Object.freeze({
    target: "Target",
    walmart: "Walmart",
    amazon: "Amazon"
  });

  function cleanText(value, maximum = 120) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function parseMoney(value) {
    const match = String(value || "").replace(/\u00a0/g, " ")
      .match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (!match) return null;
    const price = Number(match[1].replaceAll(",", ""));
    return Number.isFinite(price) && price > 0 && price <= 1_000_000
      ? Math.round(price * 100) / 100
      : null;
  }

  function trackalackerUrl(value, base = FOLLOWED_URL) {
    try {
      const url = new URL(String(value || ""), base);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:"
        || url.username
        || url.password
        || !["trackalacker.com", "www.trackalacker.com"].includes(host)
      ) return "";
      url.hostname = "www.trackalacker.com";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function trackalackerImageUrl(value, base = FOLLOWED_URL) {
    try {
      const url = new URL(String(value || ""), base);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:"
        || url.username
        || url.password
        || !(host === "trackalacker.com" || host.endsWith(".trackalacker.com"))
      ) return "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function sourceProductLink(card, pageUrl) {
    let fallback = null;
    for (const anchor of card.querySelectorAll("a[href]")) {
      const href = trackalackerUrl(anchor.getAttribute("href"), pageUrl);
      if (!href) continue;
      try {
        if (!/^\/products\/showcase\/[a-z0-9][a-z0-9-]*\/?$/i.test(new URL(href).pathname)) continue;
        if (cleanText(anchor.textContent, 80)) return anchor;
        fallback ||= anchor;
      } catch {
        // Ignore malformed candidates.
      }
    }
    return fallback;
  }

  function parseFollowedPage(doc, pageUrl = FOLLOWED_URL) {
    const items = [];
    const seen = new Set();
    for (const card of doc.querySelectorAll("div.mb-4.border-bottom.pb-4")) {
      const button = [...card.querySelectorAll("button")].find((candidate) => (
        /testing-track-all-false-product-\d+-button/.test(String(candidate.className || ""))
      ));
      const sourceProductId = String(button?.className || "")
        .match(/testing-track-all-false-product-(\d+)-button/)?.[1] || "";
      const anchor = sourceProductLink(card, pageUrl);
      const sourceUrl = trackalackerUrl(anchor?.getAttribute("href"), pageUrl);
      const title = cleanText(anchor?.textContent || anchor?.getAttribute("title"), 80);
      if (!sourceProductId || !sourceUrl || !title || seen.has(sourceProductId)) continue;
      seen.add(sourceProductId);
      const image = card.querySelector("img[src], img[data-src]");
      items.push({
        sourceProductId,
        sourceUrl,
        title,
        imageUrl: trackalackerImageUrl(image?.currentSrc || image?.src || image?.getAttribute("data-src"), pageUrl),
        displayPrice: parseMoney(card.querySelector(".fs-7")?.textContent || card.textContent)
      });
    }

    let totalPages = 1;
    for (const anchor of doc.querySelectorAll("a[href*='/products/followed']")) {
      const href = trackalackerUrl(anchor.getAttribute("href"), pageUrl);
      if (!href) continue;
      const page = Number(new URL(href).searchParams.get("page") || 1);
      if (Number.isInteger(page) && page > totalPages) totalPages = Math.min(MAX_PAGES, page);
    }
    const requiresLogin = Boolean(doc.querySelector("input[type='password']"))
      || /\b(?:log in|sign in)\b/i.test(cleanText(doc.querySelector("main form")?.textContent, 400));
    return { items, totalPages, requiresLogin };
  }

  function retailerForStore(value) {
    const normalized = cleanText(value, 60).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (/\btarget\b/.test(normalized)) return "target";
    if (/\bwalmart\b/.test(normalized)) return "walmart";
    if (/\bamazon\b/.test(normalized)) return "amazon";
    return "";
  }

  function listingStatus(value) {
    const text = cleanText(value, 1_000);
    const match = text.match(/\b(price surge|pre-?order(?:\s*\(above msrp\))?|in stock|out of stock|available|unavailable|sale)\b/i);
    return cleanText(match?.[1], 60);
  }

  function parseProductPage(doc, summary = {}) {
    const listings = [];
    const seen = new Set();
    for (const row of [...doc.querySelectorAll(".testing-product-listing-row")].slice(0, MAX_LISTINGS)) {
      const history = row.querySelector("a[data-testing^='listing-'][data-testing$='-details'][href]")
        || [...row.querySelectorAll("a[href]")].find((anchor) => /^history$/i.test(cleanText(anchor.textContent, 30)));
      const listingId = String(history?.getAttribute("data-testing") || "").match(/listing-(\d+)-details/)?.[1]
        || String(history?.getAttribute("href") || "").match(/\/listings\/(\d+)\//)?.[1]
        || String(row.querySelector("button[class*='testing-track-button-']")?.className || "")
          .match(/testing-track-button-(\d+)/)?.[1]
        || "";
      if (!listingId || seen.has(listingId)) continue;
      const outbound = row.querySelector("a.gtm-click-trigger[href]")
        || [...row.querySelectorAll("a[href]")].find((anchor) => {
          try { return !new URL(anchor.href).hostname.endsWith("trackalacker.com"); } catch { return false; }
        });
      const storeAnchor = [...row.querySelectorAll("a[href]")].find((anchor) => (
        retailerForStore(anchor.textContent)
      ));
      const store = cleanText(storeAnchor?.textContent || outbound?.getAttribute("aria-label"), 50)
        || cleanText([...row.querySelectorAll("a")].map((anchor) => anchor.textContent).find(Boolean), 50)
        || "Other store";
      const retailer = retailerForStore(store);
      const historyUrl = trackalackerUrl(history?.getAttribute("href"), summary.sourceUrl);
      if (!historyUrl) continue;
      seen.add(listingId);
      listings.push({
        listingId,
        store: retailer ? STORE_NAMES[retailer] : store,
        retailer,
        outboundUrl: cleanText(outbound?.href || outbound?.getAttribute("href"), 2_048),
        historyUrl,
        currentPrice: parseMoney(row.textContent),
        status: listingStatus(row.textContent)
      });
    }
    return {
      ...summary,
      title: cleanText(doc.querySelector("h1")?.textContent, 80) || summary.title,
      listings
    };
  }

  function parseUtcTimestamp(value) {
    const text = cleanText(value, 80);
    if (!text) return "";
    const timestamp = new Date(/(?:z|utc|[+-]\d\d:?\d\d)$/i.test(text) ? text : `${text} UTC`);
    return Number.isNaN(timestamp.getTime()) ? "" : timestamp.toISOString();
  }

  function parseHistoryPage(doc) {
    const entries = [];
    for (const row of [...doc.querySelectorAll("table tbody tr")].slice(0, 50)) {
      const cells = [...row.querySelectorAll("th,td")];
      if (cells.length < 3) continue;
      const price = parseMoney(cells[1].textContent);
      const status = cleanText(cells[2].textContent, 60);
      const assessment = cleanText(cells[2].querySelector("[title]")?.getAttribute("title"), 500);
      entries.push({
        observedAt: parseUtcTimestamp(cells[0].textContent),
        price,
        status,
        assessment
      });
    }
    return entries;
  }

  function trustworthyHistoryEntry(entry) {
    if (!Number.isFinite(entry?.price) || entry.price <= 0) return false;
    const signal = `${entry.status || ""} ${entry.assessment || ""}`.toLowerCase();
    if (/price surge|above msrp|higher than (?:the )?(?:original )?msrp|scalper/.test(signal)) return false;
    if (/basically the same|same as (?:the )?(?:original )?msrp|below (?:the )?(?:original )?msrp|lower than/.test(signal)) return true;
    return !entry.assessment && /\b(?:in stock|out of stock|available|pre-?order|sale)\b/.test(signal);
  }

  function estimateHistoryPrice(entries = []) {
    const candidates = entries.filter(trustworthyHistoryEntry);
    if (!candidates.length) return null;
    const byCents = new Map();
    candidates.forEach((entry, index) => {
      const cents = Math.round(entry.price * 100);
      const current = byCents.get(cents) || { cents, count: 0, firstIndex: index, observedAt: entry.observedAt || "" };
      current.count += 1;
      byCents.set(cents, current);
    });
    const winner = [...byCents.values()].sort((left, right) => (
      right.count - left.count || left.firstIndex - right.firstIndex || left.cents - right.cents
    ))[0];
    return {
      price: winner.cents / 100,
      confidence: "history",
      samples: candidates.length,
      observedAt: winner.observedAt
    };
  }

  function listingScore(listing) {
    return (listing.priceConfidence === "history" ? 100 : listing.priceConfidence === "product" ? 25 : 0)
      + (listing.status && !/surge|above msrp/i.test(listing.status) ? 5 : 0)
      + (listing.productUrl ? 10 : 0);
  }

  function chooseStoreListings(listings = [], displayPrice = null) {
    const stores = [];
    for (const retailer of SUPPORTED_RETAILERS) {
      const candidates = listings.filter((listing) => listing.retailer === retailer && listing.productUrl);
      if (!candidates.length) continue;
      for (const listing of candidates) {
        const estimate = listing.historyEstimate;
        listing.expectedPrice = estimate?.price ?? displayPrice ?? null;
        listing.priceConfidence = estimate ? "history" : Number.isFinite(displayPrice) ? "product" : "unavailable";
        listing.historySamples = estimate?.samples || 0;
        listing.historyObservedAt = estimate?.observedAt || "";
      }
      candidates.sort((left, right) => listingScore(right) - listingScore(left)
        || Number(left.listingId) - Number(right.listingId));
      const chosen = candidates[0];
      stores.push({
        retailer,
        sku: chosen.sku,
        listingId: chosen.listingId,
        productUrl: chosen.productUrl,
        historyUrl: chosen.historyUrl,
        currentPrice: chosen.currentPrice,
        expectedPrice: chosen.expectedPrice,
        priceConfidence: chosen.priceConfidence,
        historySamples: chosen.historySamples,
        historyObservedAt: chosen.historyObservedAt,
        status: chosen.status,
        alternateCount: candidates.length - 1
      });
    }
    return stores;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function runtimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      return { ok: false, reason: error?.message || "extension-message-failed" };
    }
  }

  async function fetchDocument(url, attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: "include",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`TrackaLacker returned HTTP ${response.status}.`);
      const html = await response.text();
      return {
        doc: new DOMParser().parseFromString(html, "text/html"),
        url: response.url
      };
    } catch (error) {
      if (attempt >= FETCH_RETRIES) throw error;
      await delay(500 * (attempt + 1));
      return fetchDocument(url, attempt + 1);
    } finally {
      clearTimeout(timer);
    }
  }

  async function postCapture(importId, payload) {
    const result = await runtimeMessage({
      type: "CART_CONFIRM_TRACKALACKER_CAPTURE",
      capture: { ...payload, importId }
    });
    if (!result?.ok) {
      throw new Error(result?.error || "The desktop app rejected the TrackaLacker capture.");
    }
    return result;
  }

  async function importStillActive(importId) {
    const result = await runtimeMessage({ type: "CART_CONFIRM_GET_CONFIG", force: true });
    if (!result?.ok || result.config?.trackalackerImport?.id !== importId) return false;
    const claim = await runtimeMessage({ type: "CART_CONFIRM_CLAIM_TRACKALACKER_IMPORT", importId });
    return Boolean(claim?.ok && claim.claimed);
  }

  async function discoverFollowedProducts(importId) {
    const items = [];
    const seen = new Set();
    let pages = 1;
    for (let page = 1; page <= pages && page <= MAX_PAGES && items.length < MAX_PRODUCTS; page += 1) {
      if (!await importStillActive(importId)) throw new Error("TrackaLacker scan cancelled.");
      const url = page === 1 ? FOLLOWED_URL : `${FOLLOWED_URL}?page=${page}`;
      const fetched = await fetchDocument(url);
      const parsed = parseFollowedPage(fetched.doc, fetched.url);
      if (parsed.requiresLogin || /\/(?:login|sign[_-]?in)(?:\/|$)/i.test(new URL(fetched.url).pathname)) {
        throw new Error("Sign in to TrackaLacker in this browser, then start the scan again.");
      }
      pages = Math.min(MAX_PAGES, Math.max(pages, parsed.totalPages));
      for (const item of parsed.items) {
        if (seen.has(item.sourceProductId) || items.length >= MAX_PRODUCTS) continue;
        seen.add(item.sourceProductId);
        items.push(item);
      }
      await postCapture(importId, {
        phase: "inventory",
        page,
        pages,
        discovered: items.length,
        message: `Found ${items.length} followed product${items.length === 1 ? "" : "s"} across ${page} of ${pages} page${pages === 1 ? "" : "s"}.`
      });
      await delay(175);
    }
    if (!items.length) throw new Error("No followed products were found. Confirm that this browser is signed in to TrackaLacker.");
    return { items, pages };
  }

  async function enrichListing(listing, importId) {
    if (!listing.retailer || !listing.outboundUrl) return listing;
    if (!await importStillActive(importId)) throw new Error("TrackaLacker scan cancelled.");
    const resolved = await runtimeMessage({
      type: "CART_CONFIRM_RESOLVE_TRACKALACKER_LINK",
      retailer: listing.retailer,
      url: listing.outboundUrl
    });
    if (!resolved?.ok) return { ...listing, resolutionError: resolved?.reason || "link-unresolved" };
    let historyEstimate = null;
    try {
      const history = await fetchDocument(listing.historyUrl);
      historyEstimate = estimateHistoryPrice(parseHistoryPage(history.doc));
    } catch {
      // The exact retailer route is still useful; the product fallback remains
      // review-only if its history page cannot be read.
    }
    return {
      ...listing,
      productUrl: resolved.productUrl,
      sku: resolved.sku,
      historyEstimate
    };
  }

  async function runImport(session) {
    const importId = session.id;
    let processed = 0;
    let captured = 0;
    let failed = 0;
    try {
      await postCapture(importId, {
        phase: "started",
        message: "Reading followed-product pages from your signed-in TrackaLacker session…"
      });
      const inventory = await discoverFollowedProducts(importId);
      for (const summary of inventory.items) {
        if (!await importStillActive(importId)) throw new Error("TrackaLacker scan cancelled.");
        await postCapture(importId, {
          phase: "progress",
          pages: inventory.pages,
          discovered: inventory.items.length,
          processed,
          captured,
          failed,
          currentTitle: summary.title,
          message: `Reading store links and price history for ${summary.title}…`
        });
        try {
          const detail = await fetchDocument(summary.sourceUrl);
          const product = parseProductPage(detail.doc, summary);
          const enriched = [];
          for (const listing of product.listings) {
            if (!listing.retailer) continue;
            enriched.push(await enrichListing(listing, importId));
            await delay(125);
          }
          const stores = chooseStoreListings(enriched, summary.displayPrice);
          const otherStores = product.listings
            .filter((listing) => !listing.retailer)
            .slice(0, 12)
            .map((listing) => ({
              store: listing.store,
              listingId: listing.listingId,
              historyUrl: listing.historyUrl
            }));
          processed += 1;
          captured += 1;
          await postCapture(importId, {
            phase: "product",
            pages: inventory.pages,
            discovered: inventory.items.length,
            processed,
            captured,
            failed,
            currentTitle: summary.title,
            item: {
              sourceProductId: summary.sourceProductId,
              sourceUrl: summary.sourceUrl,
              title: product.title || summary.title,
              imageUrl: summary.imageUrl,
              displayPrice: summary.displayPrice,
              stores,
              otherStores,
              capturedAt: new Date().toISOString()
            },
            message: `Captured ${captured} of ${inventory.items.length} followed products.`
          });
        } catch {
          processed += 1;
          failed += 1;
          await postCapture(importId, {
            phase: "progress",
            pages: inventory.pages,
            discovered: inventory.items.length,
            processed,
            captured,
            failed,
            currentTitle: summary.title,
            message: `Skipped one unreadable product; continuing (${processed} of ${inventory.items.length}).`
          });
        }
        await delay(200);
      }
      await postCapture(importId, {
        phase: "complete",
        pages: inventory.pages,
        discovered: inventory.items.length,
        processed,
        captured,
        failed,
        message: `Captured ${captured} followed product${captured === 1 ? "" : "s"}${failed ? `; ${failed} could not be read` : ""}. Review store toggles and expected prices in Cart Confirm.`
      });
    } catch (error) {
      if (await importStillActive(importId)) {
        await postCapture(importId, {
          phase: "error",
          processed,
          captured,
          failed,
          error: cleanText(error?.message, 240) || "The TrackaLacker scan failed."
        }).catch(() => {});
      }
    } finally {
      await runtimeMessage({ type: "CART_CONFIRM_RELEASE_TRACKALACKER_IMPORT", importId });
    }
  }

  function install(scope) {
    let runningImportId = "";
    async function check() {
      if (runningImportId) return;
      const configResult = await runtimeMessage({ type: "CART_CONFIRM_GET_CONFIG", force: true });
      const session = configResult?.config?.trackalackerImport;
      if (!session?.id) return;
      const claim = await runtimeMessage({ type: "CART_CONFIRM_CLAIM_TRACKALACKER_IMPORT", importId: session.id });
      if (!claim?.ok || !claim.claimed) return;
      runningImportId = session.id;
      await runImport(session);
      runningImportId = "";
    }
    void check();
    scope.setInterval(() => void check(), 4_000);
    scope.document.addEventListener("visibilitychange", () => {
      if (scope.document.visibilityState === "visible") void check();
    });
  }

  return Object.freeze({
    FOLLOWED_URL,
    MAX_PAGES,
    MAX_PRODUCTS,
    chooseStoreListings,
    cleanText,
    estimateHistoryPrice,
    install,
    parseFollowedPage,
    parseHistoryPage,
    parseMoney,
    parseProductPage,
    retailerForStore,
    trustworthyHistoryEntry
  });
});
