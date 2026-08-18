"use strict";

(() => {
  const STORE_CONFIG = Object.freeze({
    target: Object.freeze({
      label: "Target",
      hosts: ["target.com", "www.target.com"],
      cartUrl: "https://www.target.com/cart",
      firstPartyPattern: /sold(?:\s+(?:and|&)\s+shipped)?\s+by\s+target(?:\.com)?/i
    }),
    walmart: Object.freeze({
      label: "Walmart",
      hosts: ["walmart.com", "www.walmart.com"],
      cartUrl: "https://www.walmart.com/cart",
      firstPartyPattern: /sold\s+and\s+shipped\s+by\s+walmart(?:\.com)?|sold\s+by\s+walmart(?:\.com)?\s*(?:and|\|)\s*(?:shipped|fulfilled)\s+by\s+walmart/i
    }),
    amazon: Object.freeze({
      label: "Amazon",
      hosts: ["amazon.com", "www.amazon.com"],
      cartUrl: "https://www.amazon.com/gp/cart/view.html",
      firstPartyPattern: /ships\s+from\s+amazon(?:\.com)?[\s\S]{0,100}sold\s+by\s+amazon(?:\.com)?|sold\s+by\s+amazon(?:\.com)?[\s\S]{0,100}ships\s+from\s+amazon(?:\.com)?/i
    })
  });

  function textOf(element) {
    return String(element?.textContent || element?.value || "").replace(/\s+/g, " ").trim();
  }

  function computedStyleOf(element) {
    try {
      return element?.ownerDocument?.defaultView?.getComputedStyle?.(element)
        || globalThis.getComputedStyle?.(element)
        || null;
    } catch {
      return null;
    }
  }

  function isVisibleEvidence(element) {
    if (!element) return false;
    for (let current = element; current?.nodeType === 1; current = current.parentElement) {
      if (
        current.hidden
        || current.getAttribute?.("aria-hidden") === "true"
        || current.hasAttribute?.("inert")
      ) return false;
      const style = computedStyleOf(current);
      if (
        style?.display === "none"
        || ["hidden", "collapse"].includes(style?.visibility)
        || (style?.opacity !== "" && Number(style?.opacity) === 0)
      ) return false;
    }
    return true;
  }

  function visibleTextOf(root, maxLength = 100_000) {
    if (!root || !isVisibleEvidence(root)) return "";
    const doc = root.ownerDocument;
    const showText = doc?.defaultView?.NodeFilter?.SHOW_TEXT || 4;
    const walker = doc?.createTreeWalker?.(root, showText);
    if (!walker) return textOf(root).slice(0, maxLength);
    const values = [];
    let length = 0;
    for (let node = walker.nextNode(); node && length < maxLength; node = walker.nextNode()) {
      if (!isVisibleEvidence(node.parentElement)) continue;
      const value = String(node.nodeValue || "");
      values.push(value);
      length += value.length + 1;
    }
    return values.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function pageText(doc, maxLength = 300_000) {
    return String(doc?.body?.innerText || doc?.body?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function query(doc, selectors) {
    for (const selector of selectors) {
      try {
        const element = doc?.querySelector?.(selector);
        if (element) return element;
      } catch {
        // Ignore a selector if a retailer ships temporarily invalid markup.
      }
    }
    return null;
  }

  function queryAll(doc, selectors) {
    const elements = [];
    for (const selector of selectors) {
      try {
        elements.push(...(doc?.querySelectorAll?.(selector) || []));
      } catch {
        // Ignore a selector if a retailer ships temporarily invalid markup.
      }
    }
    return [...new Set(elements)];
  }

  function isActionable(element) {
    if (!element || element.disabled || element.getAttribute?.("aria-disabled") === "true") return false;
    return isVisibleEvidence(element);
  }

  function findAction(doc, selectors, labelPattern) {
    const direct = query(doc, selectors);
    if (direct && isActionable(direct)) return direct;
    const candidates = queryAll(doc, ["button", "input[type='submit']", "input[type='button']", "a[role='button']"]);
    for (const candidate of candidates.slice(0, 800)) {
      const label = `${candidate.getAttribute?.("aria-label") || ""} ${candidate.getAttribute?.("value") || ""} ${textOf(candidate)}`;
      if (labelPattern.test(label) && isActionable(candidate)) return candidate;
    }
    return null;
  }

  function parsePrice(value) {
    const text = String(value || "").replace(/\s+/g, " ");
    if (/\b(?:CAD|AUD|NZD|MXN|SGD|HKD|TWD)\b/i.test(text)) return null;
    if (/\b(?!US(?:D)?\b)[A-Z]{1,3}\s*\$/.test(text)) return null;
    const match = text.match(/(?:US\s*)?\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (!match) return null;
    const price = Number(match[1].replaceAll(",", ""));
    return Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null;
  }

  function readPrice(doc, selectors) {
    for (const element of queryAll(doc, selectors)) {
      const raw = element.getAttribute?.("content")
        || element.getAttribute?.("data-price")
        || element.getAttribute?.("value")
        || textOf(element);
      const direct = Number(raw);
      if (raw !== "" && Number.isFinite(direct) && direct >= 0) return Math.round(direct * 100) / 100;
      const parsed = parsePrice(raw);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function detectRetailer(url) {
    try {
      const host = new URL(String(url || "")).hostname.toLowerCase();
      return Object.values(STORE_CONFIG).find((store) => store.hosts.includes(host))?.label.toLowerCase() || "";
    } catch {
      return "";
    }
  }

  function parseMaybeJson(value) {
    if (value && typeof value === "object") return value;
    try {
      return JSON.parse(String(value || ""));
    } catch {
      return null;
    }
  }

  function parseWalmartQueue(value) {
    try {
      const url = new URL(String(value || ""));
      if (!["walmart.com", "www.walmart.com"].includes(url.hostname.toLowerCase()) || url.pathname !== "/qp") return null;
      const payload = parseMaybeJson(url.searchParams.get("qpdata"));
      const metadata = parseMaybeJson(payload?.customMetadata) || {};
      const item = parseMaybeJson(metadata.item) || {};
      const itemId = normalizedEmbeddedSku("walmart", item.itemID || item.itemId);
      const refreshSeconds = Number(metadata.nextRefreshRelativeTime);
      return {
        itemId,
        identityVerified: Boolean(itemId),
        queued: payload?.queued === true,
        state: String(metadata.state || "pending").toLowerCase().slice(0, 40),
        soldOut: metadata.soldOut === true,
        expectedTurn: String(metadata.expectedTurn || "").slice(0, 80),
        nextRefreshSeconds: Number.isFinite(refreshSeconds) && refreshSeconds >= 0
          ? Math.min(3600, refreshSeconds)
          : null
      };
    } catch {
      return null;
    }
  }

  function walmartHoldingQueue(doc, url, product) {
    let parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch {
      return null;
    }
    if (!["walmart.com", "www.walmart.com"].includes(parsed.hostname.toLowerCase())) return null;
    const itemId = extractSkuFromUrl("walmart", parsed.href);
    if (!itemId || itemId !== String(product?.sku || "")) return null;

    const marker = queryAll(doc, [
      "[data-testid*='waiting-room' i]",
      "[data-automation-id*='waiting-room' i]",
      "[data-testid*='purchase-queue' i]",
      "[data-automation-id*='purchase-queue' i]",
      "[data-testid*='queue-page' i]",
      "[data-automation-id*='queue-page' i]"
    ]).find(isVisibleEvidence) || null;
    const text = visibleTextOf(doc?.body, 40_000);
    const explicitWaitingRoom = /\b(?:waiting room|virtual queue|purchase queue|you(?:'|’)re in line|your place in line)\b/i.test(text);
    const pairedDemandWait = /\b(?:high|heavy) demand\b/i.test(text)
      && /\b(?:please wait|wait here|stay on this page|place in line|join(?:ed)? the (?:line|queue))\b/i.test(text);
    if (!marker && !explicitWaitingRoom && !pairedDemandWait) return null;
    if (/\b(?:sold out|out of stock|no longer available)\b/i.test(text)) {
      return { itemId, queued: true, state: "holding", soldOut: true };
    }
    return { itemId, queued: true, state: "holding", soldOut: false };
  }

  // Retailer pages embed schema.org Product JSON-LD tied to the exact item.
  // It is the fallback when the visible price element cannot be located from
  // the buy box (e.g. Target's "$35 orders" shipping blurb satisfies the
  // dollar-amount climb before the real price is reached).
  function structuredProductNodes(doc) {
    const nodes = [];
    for (const script of queryAll(doc, ["script[type='application/ld+json']"]).slice(0, 25)) {
      const stack = [[parseMaybeJson(script.textContent), 0]];
      while (stack.length) {
        const [node, depth] = stack.pop();
        if (!node || typeof node !== "object" || depth > 6) continue;
        if (Array.isArray(node)) {
          for (const item of node.slice(0, 50)) stack.push([item, depth + 1]);
          continue;
        }
        const types = [node["@type"]].flat().map((type) => String(type || "").toLowerCase());
        if (types.includes("product")) nodes.push(node);
        for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
          if (node[key]) stack.push([node[key], depth + 1]);
        }
      }
    }
    return nodes;
  }

  function offerPrice(offers, depth = 0) {
    if (depth > 3) return null;
    for (const offer of [offers].flat().filter(Boolean).slice(0, 10)) {
      if (typeof offer !== "object") continue;
      for (const raw of [offer.price, offer.lowPrice]) {
        const price = Number(raw);
        if (raw !== undefined && raw !== null && raw !== "" && Number.isFinite(price) && price >= 0 && price <= 1_000_000) {
          return Math.round(price * 100) / 100;
        }
      }
      if (offer.offers) {
        const nested = offerPrice(offer.offers, depth + 1);
        if (nested !== null) return nested;
      }
    }
    return null;
  }

  function structuredPrice(doc, retailer, sku) {
    const wanted = String(sku || "");
    const nodes = structuredProductNodes(doc);
    const matching = nodes.filter((node) => {
      const nodeSku = String(node.sku || node.productID || "").trim();
      const url = String(node.url || node["@id"] || "");
      return wanted && (nodeSku === wanted || extractSkuFromUrl(retailer, url) === wanted);
    });
    // Only fall back to an unkeyed node when it is the page's single product.
    const usable = matching.length ? matching : (nodes.length === 1 ? nodes : []);
    for (const node of usable) {
      const price = offerPrice(node.offers);
      if (price !== null) return price;
    }
    return null;
  }

  function extractSkuFromUrl(retailer, value) {
    const text = String(value || "");
    const patterns = {
      target: /(?:\/|-)A-(\d{6,12})(?:[/?#]|$)/i,
      walmart: /\/ip\/(?:[^/?#]+\/)?(\d{5,20})(?:[/?#]|$)|[?&]items=(\d{5,20})(?:&|$)/i,
      amazon: /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)|[?&]asin(?:\.1)?=([A-Z0-9]{10})(?:&|$)/i
    };
    if (retailer === "walmart") {
      const queued = parseWalmartQueue(text);
      if (queued) return queued.itemId;
    }
    const match = text.match(patterns[retailer]);
    if (!match) return "";
    const sku = match[1] || match[2] || "";
    return retailer === "amazon" ? sku.toUpperCase() : sku;
  }

  function isFirstPartyText(retailer, value) {
    return Boolean(STORE_CONFIG[retailer]?.firstPartyPattern.test(String(value || "")));
  }

  // Target labels marketplace (Target Plus) offers explicitly and renders no
  // seller text at all for items it sells itself. When no seller label exists,
  // the absence of every marketplace marker is the first-party signal; any
  // marker in scope fails closed. Walmart and Amazon keep the strict labels.
  const TARGET_MARKETPLACE_PATTERN = /sold\s+(?:and|&)\s+shipped\s+by\s+(?!target\b)|sold\s+by\s+(?!target\b)|target\s*plus|marketplace\s+seller/i;

  function targetFirstPartyByAbsence(scopeText) {
    return !TARGET_MARKETPLACE_PATTERN.test(String(scopeText || ""));
  }

  function sellerRegion(doc, selectors) {
    const direct = query(doc, selectors);
    if (direct) return textOf(direct).slice(0, 240);
    const candidates = queryAll(doc, [
      "[class*='seller' i]",
      "[id*='seller' i]",
      "[data-testid*='seller' i]",
      "[data-automation-id*='seller' i]",
      "[class*='fulfill' i]"
    ]);
    for (const candidate of candidates.slice(0, 100)) {
      const text = textOf(candidate);
      if (/sold|seller|ships from|shipped by|fulfilled by/i.test(text)) return text.slice(0, 240);
    }
    return "";
  }

  function cssEscape(value) {
    return globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&");
  }

  function closestLineContainer(element) {
    let current = element;
    let best = null;
    for (let depth = 0; depth < 10 && current; depth += 1) {
      const hasControls = Boolean(current.querySelector?.(
        "select, input[aria-label*='quantity' i], button[aria-label*='quantity' i], button[aria-label*='remove' i], [data-action*='delete' i], [data-testid*='remove' i]"
      ));
      const text = textOf(current);
      if (/\$\s*\d/.test(text) && text.length < 12_000) best = current;
      if (hasControls && text.length < 30_000) return current;
      current = current.parentElement;
    }
    return best || element?.parentElement || null;
  }

  function closestOfferContainer(element) {
    let current = element?.parentElement || null;
    let priceRoot = null;
    for (let depth = 0; depth < 12 && current; depth += 1) {
      const text = textOf(current);
      const hasPrice = /\$\s*\d/.test(text);
      const hasSeller = /sold|seller|ships from|shipped by/i.test(text);
      if (hasPrice && text.length < 40_000) priceRoot ||= current;
      if (hasPrice && hasSeller && text.length < 60_000) return current;
      current = current.parentElement;
    }
    return priceRoot;
  }

  function readQuantity(container) {
    const hinted = query(container, [
      "select[aria-label*='quantity' i]",
      "select[name*='quantity' i]",
      "select[data-test*='quantity' i]",
      "select[data-testid*='quantity' i]",
      "input[aria-label*='quantity' i]",
      "input[name*='quantity' i]"
    ]);
    const hintedRaw = hinted?.value || hinted?.getAttribute?.("aria-valuenow") || "";
    const hintedValue = Number.parseInt(hintedRaw, 10);
    if (Number.isInteger(hintedValue) && hintedValue > 0) return hintedValue;
    // A generic select only counts when its whole value is a small number —
    // "2-year-plan" style add-on options must not parse as quantity 2.
    const generic = query(container, ["select"]);
    const genericRaw = String(generic?.value || "");
    if (/^\d{1,2}$/.test(genericRaw)) return Number(genericRaw);
    const match = textOf(container).match(/(?:qty|quantity)\s*[: ]\s*(\d{1,2})/i);
    if (match) return Number(match[1]);
    const stepper = query(container, [
      "[role='spinbutton'][aria-valuenow]",
      "[aria-label*='quantity' i][aria-valuenow]"
    ]);
    const stepperValue = Number.parseInt(stepper?.getAttribute?.("aria-valuenow") || "", 10);
    if (Number.isInteger(stepperValue) && stepperValue > 0) return stepperValue;
    return null;
  }

  function quantityControls(container) {
    return {
      select: query(container, ["select[aria-label*='quantity' i]", "select[name*='quantity' i]", "select"]),
      input: query(container, ["input[aria-label*='quantity' i]", "input[name*='quantity' i]"]),
      increase: findAction(container, [
        "button[aria-label*='increase quantity' i]",
        "button[data-testid*='increment' i]",
        "button[data-automation-id*='increment' i]"
      ], /increase|increment|add one/i),
      decrease: findAction(container, [
        "button[aria-label*='decrease quantity' i]",
        "button[data-testid*='decrement' i]",
        "button[data-automation-id*='decrement' i]"
      ], /decrease|decrement|remove one/i)
    };
  }

  function lineResult(retailer, container) {
    if (!container) return null;
    const configs = {
      target: {
        seller: ["[data-test*='seller' i]", "[data-test*='fulfill' i]"],
        price: ["[data-test*='price' i]", "[itemprop='price']"]
      },
      walmart: {
        seller: ["[data-testid*='seller' i]", "[data-automation-id*='seller' i]", "[data-testid*='fulfill' i]"],
        price: ["[data-automation-id*='price' i]", "[data-testid*='price' i]", "[itemprop='price']"]
      },
      amazon: {
        seller: ["[data-feature-id*='seller' i]", ".sc-product-seller", "[class*='seller' i]"],
        price: [".sc-product-price", ".a-price .a-offscreen", "[data-a-color='price'] .a-offscreen"]
      }
    };
    const seller = sellerRegion(container, configs[retailer].seller);
    let firstParty = isFirstPartyText(retailer, seller || textOf(container));
    if (!firstParty && retailer === "target") {
      firstParty = targetFirstPartyByAbsence(textOf(container));
    }
    return {
      container,
      // Fulfillment/radio copy caught by the region scan is not a seller name.
      seller: /sold|seller/i.test(seller) ? seller : "",
      firstParty,
      price: readPrice(container, configs[retailer].price),
      quantity: readQuantity(container),
      controls: quantityControls(container)
    };
  }

  function findLineResult(doc, retailer, selectors, options = {}) {
    let fallback = null;
    for (const candidate of queryAll(doc, selectors)) {
      const container = candidate.matches?.("[data-asin]") ? candidate : closestLineContainer(candidate);
      const result = lineResult(retailer, container);
      if (!result) continue;
      const hasLineControl = hasLineControls(container);
      const explicitCartLine = Boolean(candidate.closest?.([
        "[data-tcin]",
        "[data-test='cart-item']",
        "[data-test='cartItem']",
        "[data-testid='cart-item']",
        "[data-test^='cart-item-']",
        "[data-test^='cartItem-']"
      ].join(",")));
      if (hasLineControl || explicitCartLine) return result;
      fallback ||= result;
    }
    return options.requireLineEvidence === true ? null : fallback;
  }

  function cartIdsFromLinks(doc, retailer, selectors) {
    const ids = [];
    for (const link of queryAll(doc, selectors)) {
      const container = closestLineContainer(link);
      const hasLineControl = Boolean(container?.querySelector?.(
        "select, input[aria-label*='quantity' i], button[aria-label*='quantity' i], button[aria-label*='remove' i], [data-action*='delete' i], [data-testid*='remove' i]"
      ));
      if (hasLineControl) ids.push(extractSkuFromUrl(retailer, link.href));
    }
    return unique(ids);
  }

  function normalizedEmbeddedSku(retailer, value) {
    const text = String(value || "").trim().toUpperCase();
    if (retailer === "amazon") return /^[A-Z0-9]{10}$/.test(text) ? text : "";
    return /^\d{5,20}$/.test(text) ? text : "";
  }

  function skuFromContainer(container, retailer) {
    const attributeNames = {
      target: ["data-tcin"],
      walmart: ["data-us-item-id", "data-item-id"],
      amazon: ["data-asin"]
    }[retailer] || [];
    const ids = [];
    const elements = [container, ...queryAll(container, attributeNames.map((name) => `[${name}]`))];
    for (const element of elements) {
      for (const name of attributeNames) {
        ids.push(normalizedEmbeddedSku(retailer, element?.getAttribute?.(name)));
      }
    }
    for (const link of queryAll(container, ["a[href]"])) {
      ids.push(extractSkuFromUrl(retailer, link.href || link.getAttribute?.("href")));
    }
    const found = unique(ids);
    return found.length === 1 ? found[0] : "";
  }

  function hasLineControls(container) {
    return Boolean(container?.querySelector?.(
      "select, input[aria-label*='quantity' i], button[aria-label*='quantity' i], button[aria-label*='remove' i], [data-action*='delete' i], [data-testid*='remove' i]"
    ));
  }

  function removalLineContainers(doc) {
    return uniqueElements(queryAll(doc, [
      "button[aria-label*='remove item' i]",
      "button[title*='remove item' i]",
      "input[name*='delete' i]",
      "[data-testid*='remove-item' i]",
      "[data-automation-id*='remove-item' i]",
      "[data-action*='delete-item' i]"
    ]).map((control) => closestLineContainer(control)).filter(Boolean));
  }

  function summaryLineContainers(doc, retailer) {
    // These selectors already identify a summary line. Do not climb toward a
    // parent with unrelated quantity controls: an unknown extra summary line
    // with no remove button must still make the independent count disagree.
    return uniqueElements(queryAll(doc, [
      "[data-testid*='order-item' i]",
      "[data-automation-id*='order-item' i]",
      "[data-test*='order-item' i]",
      "[data-testid*='summary-item' i]",
      "[data-automation-id*='summary-item' i]",
      "[data-test*='summary-item' i]"
    ]).map((element) => {
      if (skuFromContainer(element, retailer) || hasLineControls(element)) return element;
      const line = closestLineContainer(element);
      const recognizedItemContainer = line?.matches?.([
        "[data-tcin]",
        "[data-us-item-id]",
        "[data-item-id]",
        "[data-asin]",
        "[data-test*='cart-item' i]",
        "[data-testid*='cart-item' i]",
        "[data-automation-id*='cart-item' i]"
      ].join(","));
      return recognizedItemContainer && skuFromContainer(line, retailer) ? line : element;
    }));
  }

  function uniqueElements(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function cartInventory(doc, retailer, selectors) {
    const removalContainers = removalLineContainers(doc);
    const summaryContainers = summaryLineContainers(doc, retailer);
    const retailerContainers = queryAll(doc, selectors).filter((container) => (
      hasLineControls(container)
      || Boolean(container.querySelector?.("a[href]"))
      || Boolean(skuFromContainer(container, retailer))
    ));
    const candidates = uniqueElements([
      ...retailerContainers,
      ...removalContainers,
      ...summaryContainers
    ]);
    const containers = candidates.filter((candidate) => !candidates.some((other) => (
      other !== candidate && candidate.contains?.(other)
    )));
    const items = containers.map((container) => ({
      sku: skuFromContainer(container, retailer),
      container
    }));
    const independentCandidates = uniqueElements([...removalContainers, ...summaryContainers]);
    const independentContainers = independentCandidates.filter((candidate) => !independentCandidates.some((other) => (
      other !== candidate && candidate.contains?.(other)
    )));
    const independentLineCount = independentContainers.length;
    const independentSkus = independentContainers.map((container) => skuFromContainer(container, retailer)).filter(Boolean);
    const independentlyCounted = independentLineCount > 0
      && independentLineCount === items.length
      && independentSkus.length === independentLineCount
      && independentSkus.sort().join("|") === items.map((item) => item.sku).filter(Boolean).sort().join("|");
    return {
      complete: items.length > 0 && items.every((item) => Boolean(item.sku)) && independentlyCounted,
      independentlyCounted,
      independentLineCount,
      removalLineCount: removalContainers.length,
      ids: items.map((item) => item.sku).filter(Boolean),
      items
    };
  }

  function readOrderTotal(doc, selectors) {
    for (const element of queryAll(doc, selectors)) {
      const raw = element.getAttribute?.("content")
        || element.getAttribute?.("data-price")
        || element.getAttribute?.("value")
        || textOf(element);
      const total = parsePrice(raw);
      if (total !== null) return total;
    }
    return null;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function securityChallenge(doc) {
    const text = pageText(doc, 80_000);
    return /captcha|robot check|verify (?:that )?you(?:'|’)re human|verify you are (?:a )?human|press and hold|unusual traffic|security challenge/i.test(text);
  }

  function unrecognizedHighDemand(doc) {
    const text = pageText(doc, 120_000);
    const demandOrQueue = /\b(?:(?:high|heavy) demand|virtual (?:queue|line)|waiting room|you(?:'|’)re in line|your place in line|almost your turn)\b/i.test(text);
    const instructionOrState = /\b(?:stay on this page|please wait|wait here|checking availability|virtual (?:queue|line)|waiting room|your place in line|almost your turn)\b/i.test(text);
    return demandOrQueue && instructionOrState;
  }

  function interactivePageState(doc) {
    if (securityChallenge(doc)) return "challenge";
    const visibleText = pageText(doc, 120_000);
    const visibleControls = queryAll(doc, [
      "input:not([type='hidden'])",
      "button",
      "[role='dialog']",
      "[role='alertdialog']",
      "[aria-modal='true']"
    ]).filter(isVisibleEvidence);
    const controlText = visibleControls.map((element) => (
      `${element.getAttribute?.("name") || ""} ${element.getAttribute?.("type") || ""} ${element.getAttribute?.("placeholder") || ""} ${element.getAttribute?.("aria-label") || ""} ${textOf(element)}`
    )).join(" ").slice(0, 50_000);
    const text = `${controlText} ${visibleText}`;
    if (/\b(?:one[- ]time (?:passcode|password|code)|verification code|security code|enter (?:the )?(?:code|otp)|two[- ](?:step|factor)|2fa|mfa|code (?:we|was) sent)\b/i.test(text)) return "mfa";
    if (/\b(?:select|choose|confirm|verify|set|change) (?:a |your )?(?:pickup )?(?:store|location)|enter (?:a |your )?(?:zip|zipcode|zip code|postal code)|use my location\b/i.test(text)) return "location";
    if (/\b(?:join|start|activate|continue with|try) (?:a |your )?(?:membership|free trial|walmart\+|prime|target circle 360)|membership (?:is )?(?:required|needed)|invitation[- ]only|invite required|early access (?:for|requires)\b/i.test(text)) return "membership";
    const authPattern = /\b(?:sign in|log in|create (?:an )?account|forgot password|enter (?:your )?(?:email|password))\b/i;
    const credentialControls = queryAll(doc, [
      "input[type='password']",
      "input[autocomplete='username' i]",
      "input[autocomplete='current-password' i]",
      "input[name*='password' i]"
    ]).filter(isVisibleEvidence);
    const authHeadings = queryAll(doc, ["main h1", "main h2", "main h3", "main [role='heading']"])
      .filter(isVisibleEvidence)
      .some((element) => /^(?:sign in|log in|create (?:an )?account|welcome back)\b/i.test(textOf(element)));
    const authModal = queryAll(doc, ["[role='dialog']", "[role='alertdialog']", "[aria-modal='true']"])
      .filter(isVisibleEvidence)
      .some((root) => authPattern.test(visibleTextOf(root, 20_000)));
    // Retail product pages commonly include unrelated "sign in to favorite",
    // registry, and review controls. Only a credential prompt, explicit auth
    // heading, or modal is an authentication wall.
    if (credentialControls.length || authHeadings || authModal) return "auth";
    return "";
  }

  function orderConfirmed(doc, selectors) {
    const roots = queryAll(doc, selectors || []).filter(isVisibleEvidence);
    if (!roots.length) return false;
    const text = roots.map((root) => visibleTextOf(root)).join(" ").slice(0, 100_000);
    return /thanks for your order|thank you for your (?:order|purchase)|your order (?:is|has been) placed|we(?:'|’)ve received your order/i.test(text)
      && /order (?:number|#)|confirmation (?:email|number)|order details/i.test(text);
  }

  function classifyStoreErrorText(text) {
    if (/too many requests|temporarily unavailable|service unavailable|site (?:is )?(?:busy|overloaded)|experiencing (?:high|heavy) (?:traffic|demand)|unusual traffic|please try again later|bad gateway|gateway time-?out/i.test(text)) {
      return "traffic-overload";
    }
    if (/item (?:is|was|has become) out of stock|no longer available|sold out|unavailable for purchase|removed from (?:your )?cart/i.test(text)) {
      return "out-of-stock";
    }
    if (/something went wrong|sorry, we couldn(?:'|’)t|try again|unable to process|technical (?:issue|problem)/i.test(text)) {
      return "store-error";
    }
    return "";
  }

  function storeError(doc) {
    return classifyStoreErrorText(pageText(doc, 160_000));
  }

  function storeErrorDismissButton(doc) {
    const roots = queryAll(doc, [
      "[role='alertdialog']",
      "[role='dialog']",
      "[aria-live='assertive']",
      "[data-test*='modal' i]",
      "[data-testid*='modal' i]",
      "[data-test*='error' i]",
      "[data-testid*='error' i]"
    ]).filter((root) => (
      isVisibleEvidence(root)
      && classifyStoreErrorText(textOf(root))
      && !/captcha|robot check|verify (?:that )?you(?:'|’)re human|press and hold|security challenge/i.test(textOf(root))
    ));
    for (const root of roots.slice(0, 40)) {
      for (const button of queryAll(root, ["button", "input[type='button']", "input[type='submit']", "a[role='button']"]).slice(0, 30)) {
        const labels = [button.getAttribute?.("aria-label"), button.getAttribute?.("value"), textOf(button)]
          .map((value) => String(value || "").replace(/\s+/g, " ").trim())
          .filter(Boolean);
        if (labels.some((label) => /^(?:ok(?:ay)?|try again|close|dismiss|got it|continue shopping)$/i.test(label)) && isActionable(button)) {
          return button;
        }
      }
    }
    return null;
  }

  function submissionFailure(doc) {
    const errorRoots = queryAll(doc, [
      "[role='alert']",
      "[aria-live='assertive']",
      "[data-testid*='error' i]",
      "[data-automation-id*='error' i]",
      "[id*='error' i]",
      "[class*='error' i]"
    ]).filter(isVisibleEvidence);
    const page = visibleTextOf(doc?.body, 160_000);
    const text = errorRoots.length
      ? errorRoots.map((root) => visibleTextOf(root)).join(" ").slice(0, 40_000)
      : page.length <= 5_000 ? page : "";
    return /\b(?:your\s+)?order\s+(?:was\s+)?not\s+(?:placed|submitted|processed|completed)\b/i.test(text)
      || /\b(?:unable|could not|couldn(?:'|’)t|weren(?:'|’)t able)\s+to\s+(?:place|submit|process|complete)\s+(?:your\s+)?order\b/i.test(text)
      || /\b(?:payment|card|payment method)\s+(?:was\s+|has been\s+)?(?:declined|rejected|not authorized)\b/i.test(text);
  }

  function unsafeOrderChoices(doc) {
    const pattern = /subscribe|recurring|auto.?deliver|protection plan|warranty|insurance|monthly payments?|installments?|tip|donation|charity|gift wrap/i;
    const choices = [];
    for (const control of queryAll(doc, [
      "input:checked",
      "option:checked",
      "[aria-checked='true']",
      "[aria-pressed='true']"
    ]).slice(0, 200)) {
      const region = control.closest?.("label, fieldset, [role='radio'], [role='checkbox'], [data-testid], [data-automation-id]") || control.parentElement || control;
      const text = `${control.getAttribute?.("name") || ""} ${control.getAttribute?.("value") || ""} ${textOf(region)}`;
      if (pattern.test(text)) choices.push(text.replace(/\s+/g, " ").trim().slice(0, 160));
    }
    return unique(choices);
  }

  function fulfillmentMode(doc) {
    const selected = queryAll(doc, [
      "input:checked",
      "[aria-checked='true']",
      "[aria-selected='true']",
      "[data-selected='true']"
    ]).slice(0, 200);
    const modes = new Set();
    for (const control of selected) {
      const region = control.closest?.("label, fieldset, [role='radio'], [data-testid], [data-automation-id]") || control.parentElement || control;
      const text = `${control.getAttribute?.("name") || ""} ${control.getAttribute?.("value") || ""} ${textOf(region)}`;
      if (/pickup|pick up|collect|curbside/i.test(text)) modes.add("pickup");
      if (/shipping|ship to|delivery|deliver to/i.test(text)) modes.add("shipping");
    }
    return modes.size === 1 ? [...modes][0] : "";
  }

  // The mission's configured fulfillment METHOD (shipping vs pickup) may be
  // selected automatically when the retailer shows a method toggle, because it
  // only switches between options the account already holds. Choosing WHICH
  // store, entering a zip, or sharing a location stays strictly manual, so any
  // control whose own label is a store/location chooser is never returned.
  const STORE_CHOICE_PATTERN = /\b(?:select|choose|change|find|set|pick) (?:a |your |my )?store\b|\bzip(?: ?code)?\b|\bpostal code\b|use my location|store locator/i;
  // Trailing \b is deliberately omitted where nested markup can glue words
  // together ("Shipping<br>Arrives" reads as "ShippingArrives").
  const PICKUP_METHOD_PATTERN = /\bpick ?up|\bcurbside/i;
  const SHIPPING_METHOD_PATTERN = /\bshipping|\bship (?:it|to|this)\b/i;
  // "Delivery" (Target Shipt, same-day services) is never clicked for either
  // mode: it can carry memberships and fees the operator did not configure.
  const PICKUP_VETO_PATTERN = /\bshipping|\bship (?:it|to|this)\b|\bshipt\b|deliver/i;
  const SHIPPING_VETO_PATTERN = /\bpick ?up|\bcurbside|\bcollect\b|\bshipt\b|deliver/i;

  function fulfillmentOptionControl(doc, desiredMode) {
    if (!["shipping", "pickup"].includes(desiredMode)) return null;
    const desiredPattern = desiredMode === "pickup" ? PICKUP_METHOD_PATTERN : SHIPPING_METHOD_PATTERN;
    const otherPattern = desiredMode === "pickup" ? PICKUP_VETO_PATTERN : SHIPPING_VETO_PATTERN;
    for (const control of queryAll(doc, [
      "input[type='radio']",
      "[role='radio']",
      "[role='tab']",
      "button"
    ]).slice(0, 300)) {
      if (!isActionable(control)) continue;
      if (control.matches?.("input:checked, [aria-checked='true'], [aria-selected='true'], [data-selected='true'], [aria-pressed='true']")) continue;
      const ownText = `${control.getAttribute?.("aria-label") || ""} ${control.getAttribute?.("value") || ""} ${textOf(control)}`.replace(/\s+/g, " ").slice(0, 500);
      const region = control.closest?.("label, fieldset, [role='radio'], [data-testid], [data-automation-id], [data-test]") || control.parentElement || control;
      const regionText = `${control.getAttribute?.("name") || ""} ${textOf(region)}`.replace(/\s+/g, " ").slice(0, 500);
      const text = desiredPattern.test(ownText) ? ownText : desiredPattern.test(regionText) ? regionText : "";
      if (!text) continue;
      if (otherPattern.test(text)) continue;
      if (STORE_CHOICE_PATTERN.test(ownText) || (text === regionText && STORE_CHOICE_PATTERN.test(regionText))) continue;
      return control;
    }
    return null;
  }

  function visibleSelectedRegions(doc, selectors) {
    return unique(queryAll(doc, selectors).filter((element) => (
      isVisibleEvidence(element)
      && element.matches?.("input:checked, option:checked, [aria-checked='true'], [aria-selected='true'], [data-selected='true'], [data-selected='selected']")
    )).map((element) => {
      const region = element.closest?.("label, fieldset, article, [role='radio'], [role='checkbox'], [data-testid], [data-automation-id], [data-test]")
        || element.parentElement
        || element;
      return textOf(region).slice(0, 500);
    }).filter(Boolean));
  }

  function destinationEvidence(doc, mode) {
    const selectors = mode === "pickup"
      ? [
          "[data-testid*='pickup' i][data-selected='true']",
          "[data-automation-id*='pickup' i][data-selected='true']",
          "[data-test*='pickup' i][data-selected='true']",
          "input:checked[name*='pickup' i]",
          "[aria-checked='true'][aria-label*='pickup' i]"
        ]
      : [
          "[data-testid*='address' i][data-selected='true']",
          "[data-automation-id*='address' i][data-selected='true']",
          "[data-test*='address' i][data-selected='true']",
          "input:checked[name*='address' i]",
          "[aria-checked='true'][aria-label*='deliver' i]",
          "[aria-selected='true'][aria-label*='ship' i]"
        ];
    return visibleSelectedRegions(doc, selectors);
  }

  function paymentInstrumentEvidence(doc) {
    return visibleSelectedRegions(doc, [
      "input:checked[name*='payment' i]",
      "input:checked[name*='card' i]",
      "[aria-checked='true'][data-testid*='payment' i]",
      "[aria-checked='true'][data-automation-id*='payment' i]",
      "[aria-selected='true'][data-testid*='payment' i]",
      "[data-selected='true'][data-testid*='payment' i]",
      "[data-selected='true'][data-automation-id*='payment' i]"
    ]);
  }

  function substitutionState(doc, product) {
    const sku = String(product?.sku || "");
    const line = sku ? query(doc, [
      `[data-tcin='${cssEscape(sku)}']`,
      `[data-us-item-id='${cssEscape(sku)}']`,
      `[data-item-id='${cssEscape(sku)}']`,
      `[data-asin='${cssEscape(sku)}']`,
      `a[href*='${cssEscape(sku)}']`
    ]) : null;
    const root = line ? closestLineContainer(line) : null;
    if (!root) return "unknown";
    const controls = queryAll(root, [
      "input[name*='substitut' i]",
      "[role='checkbox'][aria-label*='substitut' i]",
      "[data-testid*='substitut' i] input",
      "[data-automation-id*='substitut' i] input"
    ]).filter(isVisibleEvidence);
    if (!controls.length) {
      const text = visibleTextOf(root, 8_000);
      if (/\b(?:substitutions?|replacements?)\s+(?:are\s+)?(?:not available|not offered|not applicable|unavailable|ineligible)\b|\b(?:cannot|can(?:'|’)t)\s+be\s+substituted\b/i.test(text)) {
        return "not-applicable";
      }
      if (/\b(?:no substitutions?|do not substitute|decline substitutions?)\b/i.test(text)) return "disabled";
      return "unknown";
    }
    for (const control of controls) {
      const region = control.closest?.("label, [role='checkbox'], [data-testid], [data-automation-id]") || control.parentElement || control;
      const text = `${control.getAttribute?.("name") || ""} ${control.getAttribute?.("value") || ""} ${textOf(region)}`;
      const selected = control.checked === true || control.getAttribute?.("aria-checked") === "true";
      if (selected && !/no substitutions?|do not substitute|decline substitutions?/i.test(text)) return "enabled";
      if (selected && /no substitutions?|do not substitute|decline substitutions?/i.test(text)) return "disabled";
      if (!selected && /allow substitutions?|accept replacements?/i.test(text)) return "disabled";
    }
    return "unknown";
  }

  function visibleQuantityLimit(doc, product) {
    const line = product ? adapters?.[product.retailer]?.findLine?.(doc, product) : null;
    const selectors = [
      "[role='alert']",
      "[aria-live='assertive']",
      "[data-test*='limit' i]",
      "[data-testid*='limit' i]",
      "[data-automation-id*='limit' i]"
    ];
    if (product?.retailer === "target") {
      selectors.push("[data-test*='ProductDetailPageHighlights' i]");
    }
    const roots = [...new Set([line?.container, ...queryAll(doc, selectors)])]
      .filter((root) => root && isVisibleEvidence(root));
    const limits = [];
    for (const root of roots.slice(0, 50)) {
      const text = visibleTextOf(root, 5000);
      const match = text.match(/(?:limit|max(?:imum)?|up to|only)\s+(?:of\s+)?(\d{1,2})\s+(?:per (?:customer|guest|order|household)|item|unit|allowed)/i)
        || text.match(/(?:per (?:customer|guest|order|household))\s*[:\-]?\s*(\d{1,2})/i);
      if (match) {
        const limit = Number(match[1]);
        if (Number.isInteger(limit) && limit > 0 && limit <= 99) limits.push(limit);
      }
    }
    return limits.length ? Math.min(...limits) : null;
  }

  function targetAddControlExcluded(element) {
    return Boolean(element?.closest?.([
      "[data-test*='recommend' i]",
      "[data-testid*='recommend' i]",
      "[data-automation-id*='recommend' i]",
      "[data-test*='carousel' i]",
      "[data-testid*='carousel' i]",
      "[data-test*='related' i]",
      "[data-testid*='related' i]",
      "[data-test*='similar' i]",
      "[data-testid*='similar' i]",
      "[data-test*='sponsored' i]",
      "[data-testid*='sponsored' i]",
      "[data-test*='product-card' i]",
      "[data-testid*='product-card' i]"
    ].join(",")));
  }

  function targetAddControlMatchesProduct(doc, element, product) {
    if (!element || targetAddControlExcluded(element)) return false;
    const sku = String(product?.sku || "");
    if (!sku || extractSkuFromUrl("target", doc?.location?.href) !== sku) return false;
    const identity = `${element.id || ""} ${element.getAttribute?.("data-tcin") || ""}`;
    if (new RegExp(`(?:^|\\D)${sku}(?:\\D|$)`).test(identity)) return true;
    const tcinContainer = element.closest?.("[data-tcin]");
    if (normalizedEmbeddedSku("target", tcinContainer?.getAttribute?.("data-tcin")) === sku) return true;
    return Boolean(element.closest?.([
      "[data-test*='ProductDetailPage' i]",
      "[data-testid*='ProductDetailPage' i]",
      "[data-automation-id*='ProductDetailPage' i]"
    ].join(",")));
  }

  function targetAddButton(doc, product) {
    const sku = cssEscape(product.sku);
    const candidates = queryAll(doc, [
      `#addToCartButtonOrTextIdFor${sku}`,
      `button[id$='${sku}'][aria-label*='add to cart' i]`,
      `[data-tcin='${sku}'] button[data-test='shipItButton']`,
      `[data-tcin='${sku}'] button[data-test*='addToCart' i]`,
      "button[data-test='shipItButton']",
      "button[data-test*='addToCart' i]",
      "button[aria-label*='add to cart' i]"
    ]);
    return candidates.find((candidate) => targetAddControlMatchesProduct(doc, candidate, product)) || null;
  }

  function targetCartItemCount(doc) {
    for (const element of queryAll(doc, [
      "a[data-test='@web/CartLink'][aria-label]",
      "a[href^='/cart'][aria-label*='cart' i]",
      "a[href*='target.com/cart'][aria-label*='cart' i]"
    ])) {
      const label = String(element.getAttribute?.("aria-label") || "");
      const match = label.match(/\bcart\s+(\d{1,3})\s+items?\b/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  const adapters = {
    target: {
      ...STORE_CONFIG.target,
      confirmationSelectors: [
        "[data-test*='order-confirmation' i]",
        "[data-testid*='order-confirmation' i]",
        "[aria-label*='order confirmation' i]"
      ],
      productMatches(product, url) {
        return extractSkuFromUrl("target", url) === product.sku;
      },
      pageKind(url) {
        const path = new URL(url).pathname.toLowerCase();
        if (/order-confirm|thank.?you|confirmation/.test(path)) return "confirmation";
        if (/\/(?:login|signin|sign-in|verify|challenge|mfa|otp)(?:\/|$)|\/account(?:\/|$)|\/co-(?:login|signin)(?:\/|$)/.test(path)) return "auth";
        if (/checkout|co-(?:delivery|fulfillment|pickup|payment|review)/.test(path)) return "checkout";
        if (/\/(?:cart|co-cart)(?:\/|$)/.test(path)) return "cart";
        return extractSkuFromUrl("target", url) ? "product" : "other";
      },
      offer(doc, product) {
        // Target error/404 pages can render recommendation cards with their
        // own generic Add buttons. Only a control bound to this page's exact
        // TCIN or its explicit product-detail surface may qualify the mission.
        const addButton = targetAddButton(doc, product);
        const offerRoot = closestOfferContainer(addButton);
        const seller = sellerRegion(offerRoot, ["[data-test*='sold-by' i]", "[data-test*='seller' i]", "[data-test*='fulfillment' i]"]);
        // The climb can stop at a fulfillment blurb whose "$35 orders" text
        // looks like a price region; the JSON-LD product record keyed to the
        // exact TCIN is the fallback, then the page-level price element.
        const price = readPrice(offerRoot, ["[data-test='product-price']", "[data-test*='current-price' i]", "meta[itemprop='price']", "[itemprop='price']"])
          ?? structuredPrice(doc, "target", product.sku)
          ?? readPrice(doc, ["[data-test='product-price']", "meta[itemprop='price']"]);
        return {
          // Fulfillment copy ("Ships free with … orders") is not a seller name.
          seller: /sold|seller/i.test(seller) ? seller : "",
          firstParty: isFirstPartyText("target", seller)
            || targetFirstPartyByAbsence(pageText(doc, 200_000)),
          price,
          available: isActionable(addButton) && !/sold out|out of stock|unavailable/i.test(textOf(addButton)),
          addButton
        };
      },
      findLine(doc, product) {
        return findLineResult(doc, "target", [
          `[data-tcin='${cssEscape(product.sku)}']`,
          `[data-test='cart-item'] a[href*='A-${cssEscape(product.sku)}']`,
          `[data-test='cartItem'] a[href*='A-${cssEscape(product.sku)}']`,
          `[data-testid='cart-item'] a[href*='A-${cssEscape(product.sku)}']`,
          `[data-test^='cart-item-'] a[href*='A-${cssEscape(product.sku)}']`,
          `[data-test^='cartItem-'] a[href*='A-${cssEscape(product.sku)}']`
        ], { requireLineEvidence: true });
      },
      cartProductIds(doc) {
        return this.cartInventory(doc).ids;
      },
      cartInventory(doc) {
        return cartInventory(doc, "target", [
          "[data-test='cart-item']",
          "[data-test='cartItem']",
          "[data-testid='cart-item']",
          "[data-test^='cart-item-']",
          "[data-test^='cartItem-']"
        ]);
      },
      cartItemCount(doc) {
        return targetCartItemCount(doc);
      },
      orderTotal(doc) {
        return readOrderTotal(doc, [
          "[data-test='order-summary-total']",
          "[data-test='orderTotal']",
          "[data-test='grand-total']",
          "[data-testid='order-total']"
        ]);
      },
      checkoutButton(doc) {
        return findAction(doc, ["button[data-test*='checkout' i]", "a[data-test*='checkout' i]"], /(?:ready to |proceed to )?check\s*out/i);
      },
      submitButton(doc) {
        return findAction(doc, ["button[data-test*='placeOrder' i]", "button[id*='placeOrder' i]"], /place (?:my |your )?order/i);
      }
    },
    walmart: {
      ...STORE_CONFIG.walmart,
      confirmationSelectors: [
        "[data-automation-id*='order-confirmation' i]",
        "[data-testid*='order-confirmation' i]",
        "[aria-label*='order confirmation' i]"
      ],
      productMatches(product, url) {
        return extractSkuFromUrl("walmart", url) === product.sku;
      },
      pageKind(url, doc, product) {
        const path = new URL(url).pathname.toLowerCase();
        if (parseWalmartQueue(url) || walmartHoldingQueue(doc, url, product)) return "queue";
        if (/thank.?you|order-confirm|confirmation/.test(path)) return "confirmation";
        if (/\/(?:account\/)?(?:login|signin|sign-in|auth|verify|challenge|mfa|otp)(?:\/|$)|\/account\/challenge(?:\/|$)/.test(path)) return "auth";
        if (path.includes("/checkout")) return "checkout";
        if (path.includes("/cart")) return "cart";
        return extractSkuFromUrl("walmart", url) ? "product" : "other";
      },
      offer(doc, product) {
        const addButton = query(doc, ["button[data-automation-id='add-to-cart']", "button[data-testid*='add-to-cart' i]"])
          || findAction(doc, [], /add to cart/i);
        const offerRoot = closestOfferContainer(addButton);
        const seller = sellerRegion(offerRoot, ["[data-testid*='seller-fulfilled' i]", "[data-testid*='seller' i]", "[data-automation-id*='seller' i]"]);
        return {
          seller,
          firstParty: isFirstPartyText("walmart", seller),
          price: readPrice(offerRoot, ["[data-automation-id='product-price']", "[data-testid='price-wrap'] [itemprop='price']", "meta[itemprop='price']", "[itemprop='price']"])
            ?? structuredPrice(doc, "walmart", product?.sku),
          available: isActionable(addButton) && !/sold out|out of stock|unavailable/i.test(textOf(addButton)),
          addButton
        };
      },
      findLine(doc, product) {
        return findLineResult(doc, "walmart", [
          `[data-testid*='cart-item' i] a[href*='/ip/'][href*='${cssEscape(product.sku)}']`,
          `[data-automation-id*='cart-item' i] a[href*='/ip/'][href*='${cssEscape(product.sku)}']`,
          `a[href*='/ip/'][href*='${cssEscape(product.sku)}']`
        ]);
      },
      cartProductIds(doc) {
        return this.cartInventory(doc).ids;
      },
      cartInventory(doc) {
        return cartInventory(doc, "walmart", [
          "[data-testid='cart-item']",
          "[data-automation-id='cart-item']",
          "[data-testid^='cart-item-']",
          "[data-automation-id^='cart-item-']"
        ]);
      },
      orderTotal(doc) {
        return readOrderTotal(doc, [
          "[data-automation-id='order-total']",
          "[data-testid='order-total']",
          "[data-automation-id='summary-grand-total']",
          "[data-testid='grand-total']"
        ]);
      },
      checkoutButton(doc) {
        return findAction(doc, ["button[data-automation-id*='checkout' i]", "button[data-testid*='checkout' i]"], /(?:continue|proceed)?\s*(?:to )?checkout/i);
      },
      submitButton(doc) {
        return findAction(doc, ["button[data-automation-id*='place-order' i]", "button[data-testid*='place-order' i]"], /place (?:my |your )?order/i);
      },
      queueState(url, doc, product) {
        return parseWalmartQueue(url) || walmartHoldingQueue(doc, url, product);
      }
    },
    amazon: {
      ...STORE_CONFIG.amazon,
      confirmationSelectors: [
        "#widget-purchaseConfirmationStatus",
        "#thank-you",
        "[data-testid*='order-confirmation' i]",
        "[aria-label*='order confirmation' i]"
      ],
      productMatches(product, url) {
        return extractSkuFromUrl("amazon", url) === product.sku;
      },
      pageKind(url) {
        const path = new URL(url).pathname.toLowerCase();
        if (/thank.?you|order-confirm/.test(path)) return "confirmation";
        if (/\/(?:ap\/)?(?:signin|sign-in|login|auth|challenge|verify|otp)(?:\/|$)|\/ap\/(?:cvf|mfa|signin)/.test(path)) return "auth";
        if (/\/gp\/buy|\/checkout/.test(path)) return "checkout";
        if (/\/gp\/cart|\/cart/.test(path)) return "cart";
        return extractSkuFromUrl("amazon", url) ? "product" : "other";
      },
      offer(doc) {
        const addButton = query(doc, ["#add-to-cart-button", "input[name='submit.add-to-cart']", "#add-to-cart-button-ubb"]);
        const offerRoot = closestOfferContainer(addButton);
        const seller = sellerRegion(offerRoot, ["#shipsFromSoldBy_feature_div", "#merchant-info", "#tabular-buybox", "#sellerProfileTriggerId"]);
        const availabilityText = textOf(query(doc, ["#availability", "#outOfStock", "#availabilityInsideBuyBox_feature_div"]));
        return {
          seller,
          firstParty: isFirstPartyText("amazon", seller),
          price: readPrice(offerRoot, ["#corePrice_feature_div .a-price .a-offscreen", ".priceToPay .a-offscreen", "#price_inside_buybox", "#newBuyBoxPrice", "meta[itemprop='price']"]),
          available: isActionable(addButton) && !/currently unavailable|out of stock|unavailable/i.test(availabilityText),
          addButton
        };
      },
      findLine(doc, product) {
        const asin = cssEscape(product.sku);
        return findLineResult(doc, "amazon", [
          `#sc-active-cart [data-asin='${asin}']`,
          `[data-asin='${asin}']`,
          `a[href*='/dp/${asin}']`
        ]);
      },
      cartProductIds(doc) {
        return this.cartInventory(doc).ids;
      },
      cartInventory(doc) {
        return cartInventory(doc, "amazon", [
          "#sc-active-cart [data-asin]",
          "#checkout-page-container [data-asin]",
          "#spc-orders [data-asin]",
          "[data-testid='order-item'][data-asin]"
        ]);
      },
      orderTotal(doc) {
        return readOrderTotal(doc, [
          "#subtotals-marketplace-table .grand-total-price",
          "#order-summary .grand-total-price",
          "#summary-amount",
          "[data-testid='order-total']"
        ]);
      },
      checkoutButton(doc) {
        return findAction(doc, ["input[name='proceedToRetailCheckout']", "#sc-buy-box-ptc-button input", "#sc-buy-box-ptc-button button"], /proceed to checkout/i);
      },
      submitButton(doc) {
        return findAction(doc, ["#submitOrderButtonId input", "input[name='placeYourOrder1']", "#placeYourOrder input", "#bottomSubmitOrderButtonId input"], /place (?:my |your )?order/i);
      }
    }
  };

  for (const [retailer, adapter] of Object.entries(adapters)) {
    adapter.securityChallenge = securityChallenge;
    adapter.interactivePageState = interactivePageState;
    adapter.orderConfirmed = (doc) => orderConfirmed(doc, adapter.confirmationSelectors);
    adapter.storeError = storeError;
    adapter.storeErrorDismissButton = storeErrorDismissButton;
    adapter.submissionFailure = submissionFailure;
    adapter.unsafeOrderChoices = unsafeOrderChoices;
    adapter.fulfillmentMode = fulfillmentMode;
    adapter.fulfillmentOptionControl = fulfillmentOptionControl;
    adapter.destinationEvidence = destinationEvidence;
    adapter.paymentInstrumentEvidence = paymentInstrumentEvidence;
    adapter.substitutionState = substitutionState;
    adapter.visibleQuantityLimit = visibleQuantityLimit;
    adapter.retailer = retailer;
  }

  const api = Object.freeze({
    STORE_CONFIG,
    detectRetailer,
    extractSkuFromUrl,
    getAdapter: (retailer) => adapters[retailer] || null,
    isActionable,
    isVisibleEvidence,
    isFirstPartyText,
    parsePrice,
    parseWalmartQueue,
    unrecognizedHighDemand,
    walmartHoldingQueue,
    textOf
  });

  globalThis.CartConfirmRetailers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
