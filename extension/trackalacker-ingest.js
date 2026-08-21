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
  const MAX_HISTORY_ENTRIES = 50;
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

  function numericPrice(value) {
    if (value === null || value === undefined || value === "") return null;
    const price = Number(value);
    return Number.isFinite(price) && price > 0 && price <= 1_000_000
      ? Math.round(price * 100) / 100
      : null;
  }

  function parseMoney(value) {
    const match = String(value || "").replace(/\u00a0/g, " ")
      .match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (!match) return null;
    return numericPrice(match[1].replaceAll(",", ""));
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

  function reactPropsFor(doc, componentName) {
    const root = [...doc.querySelectorAll("[data-react-class][data-react-props]")]
      .find((candidate) => candidate.getAttribute("data-react-class") === componentName);
    if (!root) return { found: false, value: null };
    const raw = root.getAttribute("data-react-props") || "";
    if (!raw || raw.length > 5_000_000) return { found: true, value: null };
    try {
      const value = JSON.parse(raw);
      return { found: true, value: value && typeof value === "object" ? value : null };
    } catch {
      return { found: true, value: null };
    }
  }

  function parseFollowedPage(doc, pageUrl = FOLLOWED_URL) {
    const items = [];
    const seen = new Set();
    function addItem(value) {
      const sourceProductId = cleanText(value?.sourceProductId, 30);
      const sourceUrl = trackalackerUrl(value?.sourceUrl, pageUrl);
      const title = cleanText(value?.title, 80);
      if (!/^\d{1,20}$/.test(sourceProductId) || !sourceUrl || !title || seen.has(sourceProductId)) return;
      seen.add(sourceProductId);
      items.push({
        sourceProductId,
        sourceUrl,
        title,
        imageUrl: trackalackerImageUrl(value?.imageUrl, pageUrl),
        displayPrice: numericPrice(value?.displayPrice)
      });
    }

    const hydration = reactPropsFor(doc, "products/YourProductsApp");
    const searchResults = hydration.value?.searchResultsProps;
    for (const result of (Array.isArray(searchResults?.results) ? searchResults.results : []).slice(0, MAX_PRODUCTS)) {
      const photos = Array.isArray(result?.photo_items) ? result.photo_items : [];
      const minimum = numericPrice(result?.min_price);
      const maximum = numericPrice(result?.max_price);
      addItem({
        sourceProductId: result?.product_id ?? result?.id,
        sourceUrl: result?.show_path || (result?.slug ? `/products/showcase/${result.slug}` : ""),
        title: result?.name,
        imageUrl: photos[0]?.pad_300_300 || photos[0]?.pad_600_600 || result?.canonical_image_url,
        displayPrice: numericPrice(result?.default_price)
          ?? (minimum !== null && minimum === maximum ? minimum : null)
          ?? parseMoney(result?.display_price)
      });
    }

    for (const card of doc.querySelectorAll("div.mb-4.border-bottom.pb-4")) {
      const button = [...card.querySelectorAll("button")].find((candidate) => (
        /testing-track-all-false-product-\d+-button/.test(String(candidate.className || ""))
      ));
      const sourceProductId = String(button?.className || "")
        .match(/testing-track-all-false-product-(\d+)-button/)?.[1] || "";
      const anchor = sourceProductLink(card, pageUrl);
      const sourceUrl = trackalackerUrl(anchor?.getAttribute("href"), pageUrl);
      const title = cleanText(anchor?.textContent || anchor?.getAttribute("title"), 80);
      const image = card.querySelector("img[src], img[data-src]");
      addItem({
        sourceProductId,
        sourceUrl,
        title,
        imageUrl: trackalackerImageUrl(image?.currentSrc || image?.src || image?.getAttribute("data-src"), pageUrl),
        displayPrice: parseMoney(card.querySelector(".fs-7")?.textContent || card.textContent)
      });
    }

    const hydratedPages = Number(searchResults?.pagination?.total_pages);
    let totalPages = Number.isInteger(hydratedPages) && hydratedPages > 0
      ? Math.min(MAX_PAGES, hydratedPages)
      : 1;
    for (const anchor of doc.querySelectorAll("a[href*='/products/followed']")) {
      const href = trackalackerUrl(anchor.getAttribute("href"), pageUrl);
      if (!href) continue;
      const page = Number(new URL(href).searchParams.get("page") || 1);
      if (Number.isInteger(page) && page > totalPages) totalPages = Math.min(MAX_PAGES, page);
    }
    const pageText = cleanText(doc.body?.textContent, 2_000);
    const requiresChallenge = /\b(?:just a moment|performing security verification|verify you are human|checking your browser)\b/i.test(
      `${doc.title || ""} ${pageText}`
    );
    const requiresLogin = Boolean(doc.querySelector("input[type='password']"))
      || /\b(?:log in|sign in)\b/i.test(cleanText(doc.querySelector("main form")?.textContent, 400));
    const hydrationUnreadable = hydration.found && (
      !hydration.value || !Array.isArray(searchResults?.results)
    );
    return {
      items,
      totalPages,
      requiresLogin,
      requiresChallenge,
      dataUnreadable: hydrationUnreadable
    };
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
        status: listingStatus(row.textContent),
        currentPriceChangedAt: "",
        currentMsrpCode: "",
        currentAssessment: ""
      });
    }
    return {
      ...summary,
      title: cleanText(doc.querySelector("h1")?.textContent, 80) || summary.title,
      listings
    };
  }

  function retailerForUrl(value) {
    try {
      const host = new URL(String(value || "")).hostname.toLowerCase();
      if (host === "target.com" || host.endsWith(".target.com")) return "target";
      if (host === "walmart.com" || host.endsWith(".walmart.com")) return "walmart";
      if (host === "amazon.com" || host.endsWith(".amazon.com")) return "amazon";
      return "";
    } catch {
      return "";
    }
  }

  function parseProductPayload(payload, summary = {}) {
    const source = payload?.product && typeof payload.product === "object" ? payload.product : {};
    const listings = [];
    const seen = new Set();
    for (const raw of (Array.isArray(source.listings) ? source.listings : []).slice(0, MAX_LISTINGS)) {
      const listingId = cleanText(raw?.id, 30);
      if (!/^\d{1,20}$/.test(listingId) || seen.has(listingId)) continue;
      const candidates = [raw?.url, raw?.preferred_product_url, raw?.purchase_url, raw?.affiliate_url]
        .map((value) => cleanText(value, 2_048))
        .filter(Boolean);
      const provider = raw?.provider && typeof raw.provider === "object" ? raw.provider : {};
      const providerName = cleanText(provider.display_name || provider.short_display_name, 50);
      const retailer = retailerForStore(providerName)
        || candidates.map(retailerForUrl).find(Boolean)
        || "";
      const direct = candidates.find((candidate) => retailerForUrl(candidate) === retailer);
      const outboundUrl = direct || candidates[0] || "";
      const sourceUrl = String(summary.sourceUrl || "").replace(/\/$/, "");
      const historyUrl = trackalackerUrl(
        raw?.show_path || `${sourceUrl}/listings/${listingId}/${source.slug || "item"}`,
        summary.sourceUrl
      );
      if (!historyUrl) continue;
      seen.add(listingId);
      const current = raw?.current_status && typeof raw.current_status === "object" ? raw.current_status : {};
      const currentMsrp = current.msrp_state && typeof current.msrp_state === "object" ? current.msrp_state : {};
      const store = providerName || (retailer ? STORE_NAMES[retailer] : "Other store");
      listings.push({
        listingId,
        store: retailer ? STORE_NAMES[retailer] : store,
        retailer,
        outboundUrl,
        historyUrl,
        currentPrice: numericPrice(current.price ?? raw?.price),
        status: cleanText(current.short_stock_status_text || currentMsrp.short_text, 60),
        currentPriceChangedAt: parseUtcTimestamp(current.price_changed_at),
        currentMsrpCode: cleanText(currentMsrp.code_str, 40).toLowerCase(),
        currentAssessment: cleanText([currentMsrp.code_str, currentMsrp.full_text, currentMsrp.tooltip].filter(Boolean).join(" "), 500)
      });
    }
    return {
      ...summary,
      title: cleanText(source.name, 80) || summary.title,
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
    const hydration = reactPropsFor(doc, "products/listings/RecentChanges");
    const hydratedStatuses = hydration.value?.statuses;
    if (Array.isArray(hydratedStatuses)) {
      return hydratedStatuses.slice(0, MAX_HISTORY_ENTRIES).map((entry) => {
        const msrp = entry?.msrp_state && typeof entry.msrp_state === "object" ? entry.msrp_state : {};
        const historyEntry = {
          observedAt: parseUtcTimestamp(entry?.created_at || entry?.updated_at || entry?.price_changed_at),
          priceChangedAt: parseUtcTimestamp(entry?.price_changed_at),
          price: numericPrice(entry?.price),
          status: cleanText(entry?.short_stock_status_text, 60),
          msrpCode: cleanText(msrp.code_str, 40).toLowerCase(),
          assessment: cleanText([msrp.code_str, msrp.full_text, msrp.tooltip].filter(Boolean).join(" "), 500)
        };
        return { ...historyEntry, classification: classifyHistoryEntry(historyEntry) };
      });
    }
    const entries = [];
    for (const row of [...doc.querySelectorAll("table tbody tr")].slice(0, MAX_HISTORY_ENTRIES)) {
      const cells = [...row.querySelectorAll("th,td")];
      if (cells.length < 3) continue;
      const price = parseMoney(cells[1].textContent);
      const status = cleanText(cells[2].textContent, 60);
      const assessment = cleanText(cells[2].querySelector("[title]")?.getAttribute("title"), 500);
      const historyEntry = {
        observedAt: parseUtcTimestamp(cells[0].textContent),
        priceChangedAt: parseUtcTimestamp(cells[0].textContent),
        price,
        status,
        msrpCode: "",
        assessment
      };
      entries.push({ ...historyEntry, classification: classifyHistoryEntry(historyEntry) });
    }
    return entries;
  }

  function classifyHistoryEntry(entry) {
    const code = cleanText(entry?.msrpCode, 40).toLowerCase().replaceAll("-", "_");
    if (code === "price_surge") return "surge";
    if (["slightly_above", "above_msrp", "greater_than"].includes(code)) return "above";
    if (["equal_to", "less_than", "close_to", "below_msrp", "at_msrp"].includes(code)) return "normal";
    const signal = `${entry?.status || ""} ${entry?.assessment || ""}`.toLowerCase().replaceAll("_", " ");
    if (/price surge|scalper/.test(signal)) return "surge";
    if (/(?:slightly )?above msrp|higher than (?:the )?(?:original )?msrp/.test(signal)) return "above";
    if (/basically the same|same as (?:the )?(?:original )?msrp|equal to|at msrp|below (?:the )?(?:original )?msrp|under msrp|lower than/.test(signal)) return "normal";
    if (!entry?.assessment && /\b(?:in stock|out of stock|available|pre-?order|sale)\b/.test(signal)) return "normal";
    return "unknown";
  }

  function trustworthyHistoryEntry(entry) {
    if (!Number.isFinite(entry?.price) || entry.price <= 0) return false;
    return classifyHistoryEntry(entry) === "normal";
  }

  function historyTimestamp(entry) {
    const timestamp = new Date(entry?.observedAt || entry?.priceChangedAt || "").getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function analyzePriceHistory(entries = []) {
    const history = entries
      .map((entry, index) => ({
        observedAt: parseUtcTimestamp(entry?.observedAt),
        priceChangedAt: parseUtcTimestamp(entry?.priceChangedAt),
        price: numericPrice(entry?.price),
        status: cleanText(entry?.status, 60),
        msrpCode: cleanText(entry?.msrpCode, 40).toLowerCase(),
        assessment: cleanText(entry?.assessment, 500),
        classification: classifyHistoryEntry(entry),
        isCurrent: entry?.isCurrent === true,
        sourceIndex: index
      }))
      .filter((entry) => Number.isFinite(entry.price))
      .sort((left, right) => historyTimestamp(right) - historyTimestamp(left) || left.sourceIndex - right.sourceIndex)
      .slice(0, MAX_HISTORY_ENTRIES)
      // The long TrackaLacker explanation is used locally for classification,
      // then omitted so a worst-case three-store capture stays below the
      // desktop's bounded loopback request size.
      .map(({ sourceIndex, assessment, ...entry }) => entry);
    const latest = history[0] || null;
    // Classification happened while the full TrackaLacker explanation was
    // still present. Use that result after the prose is stripped for capture.
    const trusted = history.filter((entry) => entry.classification === "normal");
    const reference = trusted[0] || null;
    let previous = latest
      ? history.slice(1).find((entry) => Math.round(entry.price * 100) !== Math.round(latest.price * 100)) || null
      : null;
    if (!previous && history.length > 1) previous = history[1];
    const prices = history.map((entry) => entry.price);
    const normalPrices = trusted.map((entry) => entry.price);
    const changeAmount = latest && previous ? Math.round((latest.price - previous.price) * 100) / 100 : null;
    const trend = changeAmount === null ? "unknown" : changeAmount > 0 ? "up" : changeAmount < 0 ? "down" : "steady";
    return {
      history,
      reference,
      summary: history.length ? {
        sampleCount: history.length,
        trustedSamples: trusted.length,
        surgeSamples: history.filter((entry) => entry.classification === "surge").length,
        aboveSamples: history.filter((entry) => entry.classification === "above").length,
        latestPrice: latest.price,
        latestObservedAt: latest.observedAt,
        latestPriceChangedAt: latest.priceChangedAt,
        latestClassification: latest.classification,
        lowestPrice: Math.min(...prices),
        highestPrice: Math.max(...prices),
        normalLowPrice: normalPrices.length ? Math.min(...normalPrices) : null,
        normalHighPrice: normalPrices.length ? Math.max(...normalPrices) : null,
        referencePrice: reference?.price ?? null,
        referenceObservedAt: reference?.observedAt || "",
        referencePriceChangedAt: reference?.priceChangedAt || "",
        previousPrice: previous?.price ?? null,
        changeAmount,
        trend
      } : null
    };
  }

  function estimateHistoryPrice(entries = []) {
    const analysis = analyzePriceHistory(entries);
    if (!analysis.reference) return null;
    return {
      price: analysis.reference.price,
      confidence: "history",
      samples: analysis.summary.trustedSamples,
      observedAt: analysis.reference.priceChangedAt || analysis.reference.observedAt,
      priceChangedAt: analysis.reference.priceChangedAt
    };
  }

  function listingScore(listing) {
    return (listing.priceConfidence === "history" ? 100 : listing.priceConfidence === "product" ? 25 : 0)
      + Math.min(10, Number(listing.historySamples) || 0)
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
        || new Date(right.priceHistorySummary?.latestPriceChangedAt || right.priceHistorySummary?.latestObservedAt || 0).getTime()
          - new Date(left.priceHistorySummary?.latestPriceChangedAt || left.priceHistorySummary?.latestObservedAt || 0).getTime()
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
        priceHistory: chosen.priceHistory || [],
        priceHistorySummary: chosen.priceHistorySummary || null,
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

  async function fetchJson(url, attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        credentials: "include",
        redirect: "follow",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`TrackaLacker returned HTTP ${response.status}.`);
      const data = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("TrackaLacker returned unreadable product data.");
      }
      return { data, url: response.url };
    } catch (error) {
      if (attempt >= FETCH_RETRIES) throw error;
      await delay(500 * (attempt + 1));
      return fetchJson(url, attempt + 1);
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

  function mergeCurrentPriceHistory(entries, listing, observedAt = new Date().toISOString()) {
    const history = [...(Array.isArray(entries) ? entries : [])];
    if (!Number.isFinite(listing?.currentPrice)) return history;
    const currentEntry = {
      observedAt: parseUtcTimestamp(observedAt),
      priceChangedAt: parseUtcTimestamp(listing.currentPriceChangedAt),
      price: listing.currentPrice,
      status: listing.status,
      msrpCode: listing.currentMsrpCode || "",
      assessment: listing.currentAssessment || "",
      isCurrent: true
    };
    currentEntry.classification = classifyHistoryEntry(currentEntry);
    const matchingIndex = history.findIndex((entry, index) => (
      Math.round(entry.price * 100) === Math.round(currentEntry.price * 100)
      && (
        currentEntry.priceChangedAt
          ? parseUtcTimestamp(entry.priceChangedAt) === currentEntry.priceChangedAt
          : index === 0 && entry.status === currentEntry.status
      )
    ));
    if (matchingIndex >= 0) history[matchingIndex] = { ...history[matchingIndex], ...currentEntry };
    else history.unshift(currentEntry);
    return history;
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
      if (parsed.requiresChallenge) {
        throw new Error("Complete TrackaLacker's browser security verification, then start the scan again.");
      }
      if (parsed.requiresLogin || /\/(?:login|sign[_-]?in)(?:\/|$)/i.test(new URL(fetched.url).pathname)) {
        throw new Error("Sign in to TrackaLacker in this browser, then start the scan again.");
      }
      if (parsed.dataUnreadable) {
        throw new Error("TrackaLacker's followed-product data could not be read. Refresh the page, then start the scan again.");
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
    if (!items.length) {
      throw new Error("No followed products were available to import. Refresh the followed-products page and confirm it shows your products, then start the scan again.");
    }
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
    let priceHistory = [];
    let priceHistorySummary = null;
    try {
      const history = await fetchDocument(listing.historyUrl);
      const entries = mergeCurrentPriceHistory(parseHistoryPage(history.doc), listing);
      const analysis = analyzePriceHistory(entries);
      priceHistory = analysis.history;
      priceHistorySummary = analysis.summary;
      historyEstimate = analysis.reference ? {
        price: analysis.reference.price,
        confidence: "history",
        samples: analysis.summary.trustedSamples,
        observedAt: analysis.reference.priceChangedAt || analysis.reference.observedAt,
        priceChangedAt: analysis.reference.priceChangedAt
      } : null;
    } catch {
      // The exact retailer route is still useful; the product fallback remains
      // review-only if its history page cannot be read.
    }
    return {
      ...listing,
      productUrl: resolved.productUrl,
      sku: resolved.sku,
      historyEstimate,
      priceHistory,
      priceHistorySummary
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
          const detailUrl = `${summary.sourceUrl.replace(/\/$/, "")}.json`;
          const detail = await fetchJson(detailUrl);
          const product = parseProductPayload(detail.data, summary);
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
    let handledPushEnrollmentNonce = "";
    async function check() {
      if (runningImportId) return;
      const configResult = await runtimeMessage({ type: "CART_CONFIRM_GET_CONFIG", force: true });
      const pushConfig = configResult?.config?.trackalackerPush;
      if (pushConfig?.enabled === true) {
        const nonce = String(pushConfig.enrollmentNonce || "").slice(0, 80);
        if (nonce && nonce !== handledPushEnrollmentNonce) {
          handledPushEnrollmentNonce = nonce;
          await runtimeMessage({ type: "CART_CONFIRM_TRACKALACKER_PUSH_PAGE_READY" });
        }
      } else {
        handledPushEnrollmentNonce = "";
      }
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
    analyzePriceHistory,
    chooseStoreListings,
    classifyHistoryEntry,
    cleanText,
    estimateHistoryPrice,
    install,
    mergeCurrentPriceHistory,
    parseFollowedPage,
    parseHistoryPage,
    parseMoney,
    parseProductPage,
    parseProductPayload,
    retailerForStore,
    trustworthyHistoryEntry
  });
});
