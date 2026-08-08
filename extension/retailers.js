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
    const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(element) : null;
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    return true;
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
      if (!itemId) return null;
      const refreshSeconds = Number(metadata.nextRefreshRelativeTime);
      return {
        itemId,
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
      walmart: /\/ip\/(?:[^/?#]+\/)?(\d{5,20})(?:[/?#]|$)/i,
      amazon: /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i
    };
    if (retailer === "walmart") {
      const queued = parseWalmartQueue(text);
      if (queued) return queued.itemId;
    }
    const match = text.match(patterns[retailer]);
    if (!match) return "";
    return retailer === "amazon" ? match[1].toUpperCase() : match[1];
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

  function findLineResult(doc, retailer, selectors) {
    let fallback = null;
    for (const candidate of queryAll(doc, selectors)) {
      const container = candidate.matches?.("[data-asin]") ? candidate : closestLineContainer(candidate);
      const result = lineResult(retailer, container);
      if (!result) continue;
      const hasLineControl = Boolean(container.querySelector?.(
        "select, input[aria-label*='quantity' i], button[aria-label*='quantity' i], button[aria-label*='remove' i], [data-action*='delete' i], [data-testid*='remove' i]"
      ));
      if (hasLineControl) return result;
      fallback ||= result;
    }
    return fallback;
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

  function uniqueElements(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function cartInventory(doc, retailer, selectors) {
    const removalContainers = removalLineContainers(doc);
    const candidates = uniqueElements([...queryAll(doc, selectors), ...removalContainers]).filter((container) => (
      hasLineControls(container)
      || Boolean(container.querySelector?.("a[href]"))
      || Boolean(skuFromContainer(container, retailer))
    ));
    const containers = candidates.filter((candidate) => !candidates.some((other) => (
      other !== candidate && candidate.contains?.(other)
    )));
    const items = containers.map((container) => ({
      sku: skuFromContainer(container, retailer),
      container
    }));
    const removalCountMatches = removalContainers.length === 0 || removalContainers.length === items.length;
    return {
      complete: items.length > 0 && items.every((item) => Boolean(item.sku)) && removalCountMatches,
      independentlyCounted: removalContainers.length > 0 && removalContainers.length === items.length,
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

  function orderConfirmed(doc, selectors) {
    const roots = queryAll(doc, selectors || []);
    if (!roots.length) return false;
    const text = roots.map((root) => textOf(root)).join(" ").slice(0, 100_000);
    return /thanks for your order|thank you for your (?:order|purchase)|your order (?:is|has been) placed|we(?:'|’)ve received your order/i.test(text)
      && /order (?:number|#)|confirmation (?:email|number)|order details/i.test(text);
  }

  function storeError(doc) {
    const text = pageText(doc, 160_000);
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

  function submissionFailure(doc) {
    const errorRoots = queryAll(doc, [
      "[role='alert']",
      "[aria-live='assertive']",
      "[data-testid*='error' i]",
      "[data-automation-id*='error' i]",
      "[id*='error' i]",
      "[class*='error' i]"
    ]).filter((root) => !root.hidden && root.getAttribute?.("aria-hidden") !== "true");
    const page = pageText(doc, 160_000);
    const text = errorRoots.length
      ? errorRoots.map((root) => textOf(root)).join(" ").slice(0, 40_000)
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
        if (/checkout|co-delivery|co-payment|co-review/.test(path)) return "checkout";
        if (path.includes("/cart")) return "cart";
        return extractSkuFromUrl("target", url) ? "product" : "other";
      },
      offer(doc, product) {
        const addButton = query(doc, [
          `#addToCartButtonOrTextIdFor${cssEscape(product.sku)}`,
          `button[id$='${cssEscape(product.sku)}'][aria-label*='add to cart' i]`,
          "button[data-test='shipItButton']",
          "button[data-test*='addToCart' i]"
        ]) || findAction(doc, [], /add to cart/i);
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
          `[data-test*='cart-item' i] a[href*='A-${cssEscape(product.sku)}']`,
          `[data-test*='cartItem' i] a[href*='A-${cssEscape(product.sku)}']`,
          `a[href*='A-${cssEscape(product.sku)}']`
        ]);
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
      pageKind(url) {
        const path = new URL(url).pathname.toLowerCase();
        if (parseWalmartQueue(url)) return "queue";
        if (/thank.?you|order-confirm|confirmation/.test(path)) return "confirmation";
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
      queueState(url) {
        return parseWalmartQueue(url);
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
    adapter.orderConfirmed = (doc) => orderConfirmed(doc, adapter.confirmationSelectors);
    adapter.storeError = storeError;
    adapter.submissionFailure = submissionFailure;
    adapter.unsafeOrderChoices = unsafeOrderChoices;
    adapter.fulfillmentMode = fulfillmentMode;
    adapter.retailer = retailer;
  }

  const api = Object.freeze({
    STORE_CONFIG,
    detectRetailer,
    extractSkuFromUrl,
    getAdapter: (retailer) => adapters[retailer] || null,
    isActionable,
    isFirstPartyText,
    parsePrice,
    parseWalmartQueue,
    textOf
  });

  globalThis.CartConfirmRetailers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
