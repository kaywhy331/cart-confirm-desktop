"use strict";

const MAX_SIGNAL_STRATEGIES = 25;
const MAX_SIGNAL_KEYWORD_LENGTH = 1_000;
const SIGNAL_PRICE_BANDS = new Set([
  "any",
  "below_msrp",
  "msrp",
  "slightly_above_msrp",
  "above_msrp"
]);
const SIGNAL_STRATEGY_ACTIONS = new Set([
  "notify",
  "add_to_cart",
  "prepare_checkout",
  "submit_order"
]);
const RETAILER_IDS = new Set(["target", "walmart", "amazon"]);
const STRATEGY_TO_PRODUCT_ACTION = Object.freeze({
  notify: "watch",
  add_to_cart: "cart",
  prepare_checkout: "review",
  submit_order: "checkout"
});
const PRODUCT_ACTION_RANK = Object.freeze({ watch: 0, cart: 1, review: 2, checkout: 3 });

function cleanText(value, maximum) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function normalizeKeywordText(value) {
  return cleanText(value, 8_000)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordAtom(value, quoted) {
  const normalized = normalizeKeywordText(value);
  if (!normalized) throw new Error("Keyword expressions cannot contain an empty term or phrase.");
  return Object.freeze({ value: normalized, quoted: quoted === true });
}

function parseKeywordQuery(value) {
  const source = cleanText(value, MAX_SIGNAL_KEYWORD_LENGTH);
  if (!source) return Object.freeze({ source: "", clauses: Object.freeze([]), exclusions: Object.freeze([]) });
  const clauses = [[]];
  const exclusions = [];
  let index = 0;

  function nextClause() {
    if (clauses[clauses.length - 1].length) clauses.push([]);
  }

  while (index < source.length) {
    while (/\s/.test(source[index] || "")) index += 1;
    if (index >= source.length) break;
    if (["|", ","].includes(source[index])) {
      nextClause();
      index += 1;
      continue;
    }
    if (source[index] === "+") {
      index += 1;
      continue;
    }

    let excluded = false;
    if (source[index] === "-") {
      excluded = true;
      index += 1;
    }
    const quote = ["\"", "'"].includes(source[index]) ? source[index] : "";
    let token = "";
    if (quote) {
      index += 1;
      const start = index;
      while (index < source.length && source[index] !== quote) index += 1;
      if (index >= source.length) throw new Error("Close every quoted keyword phrase with the same quote mark.");
      token = source.slice(start, index);
      index += 1;
    } else {
      const start = index;
      while (index < source.length && !/[\s+|,]/.test(source[index])) index += 1;
      token = source.slice(start, index);
      if (/^or$/i.test(token)) {
        nextClause();
        continue;
      }
    }
    if (!token) throw new Error("Keyword operators must be followed by a term or quoted phrase.");
    const atom = keywordAtom(token, Boolean(quote));
    if (excluded) exclusions.push(atom);
    else clauses[clauses.length - 1].push(atom);
  }

  const populated = clauses.filter((clause) => clause.length).map((clause) => Object.freeze(clause));
  if (!populated.length && !exclusions.length) throw new Error("Enter at least one usable keyword term.");
  return Object.freeze({
    source,
    clauses: Object.freeze(populated),
    exclusions: Object.freeze(exclusions)
  });
}

function atomMatches(atom, normalizedText) {
  return ` ${normalizedText} `.includes(` ${atom.value} `);
}

function includeKeywordsMatch(value, text) {
  const query = parseKeywordQuery(value);
  if (!query.source) return true;
  const normalized = normalizeKeywordText(text);
  if (query.exclusions.some((atom) => atomMatches(atom, normalized))) return false;
  if (!query.clauses.length) return true;
  return query.clauses.some((clause) => clause.every((atom) => atomMatches(atom, normalized)));
}

function excludeKeywordsMatch(value, text) {
  const query = parseKeywordQuery(value);
  if (!query.source) return false;
  const normalized = normalizeKeywordText(text);
  return query.exclusions.some((atom) => atomMatches(atom, normalized))
    || query.clauses.some((clause) => clause.every((atom) => atomMatches(atom, normalized)));
}

function normalizeSignalStrategies(input = []) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("Signal strategies must be a list.");
  if (input.length > MAX_SIGNAL_STRATEGIES) {
    throw new Error(`Add at most ${MAX_SIGNAL_STRATEGIES} signal strategies.`);
  }
  const strategies = [];
  const ids = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const candidate = input[index];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Each signal strategy must be an object.");
    }
    const id = cleanText(candidate.id || `signal-strategy:${index + 1}`, 80);
    if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{2,79}$/.test(id) || ids.has(id)) {
      throw new Error("Every signal strategy needs a unique valid ID.");
    }
    ids.add(id);
    const name = cleanText(candidate.name || `Signal strategy ${index + 1}`, 80);
    if (!name) throw new Error("Every signal strategy needs a name.");
    const priceBand = cleanText(candidate.priceBand || "any", 40).toLowerCase();
    if (!SIGNAL_PRICE_BANDS.has(priceBand)) throw new Error("Choose a supported signal MSRP price band.");
    const action = cleanText(candidate.action || "notify", 40).toLowerCase();
    if (!SIGNAL_STRATEGY_ACTIONS.has(action)) throw new Error("Choose Notify, Add to cart, Prepare checkout, or Submit order.");
    const quantity = candidate.quantity === "max" || candidate.quantity === undefined
      ? "max"
      : Number(candidate.quantity);
    if (quantity !== "max" && (!Number.isInteger(quantity) || quantity < 1 || quantity > 5)) {
      throw new Error("Signal strategy quantity must be 1 through 5, or Max allowed.");
    }
    const stores = [];
    for (const rawStore of Array.isArray(candidate.stores) ? candidate.stores : []) {
      const store = cleanText(rawStore, 20).toLowerCase();
      if (!RETAILER_IDS.has(store)) throw new Error("A signal strategy contains an unsupported store.");
      if (!stores.includes(store)) stores.push(store);
    }
    const includeKeywords = cleanText(candidate.includeKeywords, MAX_SIGNAL_KEYWORD_LENGTH);
    const excludeKeywords = cleanText(candidate.excludeKeywords, MAX_SIGNAL_KEYWORD_LENGTH);
    parseKeywordQuery(includeKeywords);
    parseKeywordQuery(excludeKeywords);
    strategies.push({
      id,
      name,
      enabled: candidate.enabled !== false,
      priceBand,
      stores,
      action,
      quantity,
      includeKeywords,
      excludeKeywords
    });
  }
  return strategies;
}

function semanticPriceBand(value) {
  const status = cleanText(value, 40).toLowerCase();
  if (["below_msrp", "less_than"].includes(status)) return "below_msrp";
  if (["at_msrp", "near_msrp", "equal_to", "msrp"].includes(status)) return "msrp";
  if (status === "slightly_above_msrp") return "slightly_above_msrp";
  if (["above_msrp", "greater_than", "surge", "price_surge"].includes(status)) return "above_msrp";
  return "unknown";
}

function configuredMsrp(product = {}, settings = {}) {
  const recordId = cleanText(product.msrpRecordId, 80);
  const retailer = cleanText(product.retailer, 20).toLowerCase();
  if (!recordId || !RETAILER_IDS.has(retailer)) return null;
  const record = (Array.isArray(settings.msrpCatalog) ? settings.msrpCatalog : [])
    .find((candidate) => candidate?.id === recordId);
  const value = Number(record?.prices?.[retailer]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function signalPriceBand(signal = {}, product = {}, settings = {}) {
  const semantic = semanticPriceBand(signal.msrpStatus || signal.priceBand);
  if (semantic !== "unknown") return semantic;
  const price = Number(signal.price);
  const msrp = configuredMsrp(product, settings);
  if (!Number.isFinite(price) || price <= 0 || !msrp) return "unknown";
  if (price < msrp - 0.005) return "below_msrp";
  if (price <= msrp + 0.005) return "msrp";
  return price <= msrp * 1.1 + 0.005 ? "slightly_above_msrp" : "above_msrp";
}

function strategyKeywordText(signal = {}, product = {}) {
  return [signal.keywordText, signal.title, product.title]
    .map((value) => String(value || ""))
    .filter(Boolean)
    .join("\n");
}

function effectiveProductForStrategy(product = {}, strategy = {}, signal = {}) {
  const missionAction = PRODUCT_ACTION_RANK[product.action] === undefined ? "watch" : product.action;
  const requestedAction = STRATEGY_TO_PRODUCT_ACTION[strategy.action] || "watch";
  const effectiveAction = PRODUCT_ACTION_RANK[requestedAction] <= PRODUCT_ACTION_RANK[missionAction]
    ? requestedAction
    : missionAction;
  const missionQuantity = Number.isInteger(Number(product.quantity)) && Number(product.quantity) > 0
    ? Number(product.quantity)
    : 1;
  const requestedQuantity = strategy.quantity === "max" ? missionQuantity : Number(strategy.quantity);
  const signaledLimit = Number(signal.orderLimit);
  const signalLimit = Number.isInteger(signaledLimit) && signaledLimit >= 1 && signaledLimit <= 99
    ? signaledLimit
    : null;
  const strategyQuantity = strategy.quantity === "max" && signalLimit
    ? Math.min(requestedQuantity, signalLimit)
    : requestedQuantity;
  const effectiveQuantity = Math.max(1, Math.min(missionQuantity, strategyQuantity));
  return {
    product: {
      ...product,
      action: effectiveAction,
      quantity: effectiveQuantity,
      acceptPartial: strategy.quantity === "max" ? true : product.acceptPartial
    },
    requestedAction,
    effectiveAction,
    requestedQuantity,
    effectiveQuantity,
    actionCapped: effectiveAction !== requestedAction,
    quantityCapped: strategy.quantity !== "max" && effectiveQuantity !== requestedQuantity,
    signalLimitApplied: strategy.quantity === "max" && signalLimit !== null && effectiveQuantity < missionQuantity
  };
}

function matchSignalStrategy(options = {}) {
  const settings = options.settings || {};
  const product = options.product || {};
  const signal = options.signal || {};
  const strategies = normalizeSignalStrategies(settings.signalStrategies || []);
  const priceBand = signalPriceBand(signal, product, settings);
  if (!strategies.length) {
    return Object.freeze({ state: "legacy", strategy: null, index: -1, priceBand, product });
  }
  const keywordText = strategyKeywordText(signal, product);
  for (let index = 0; index < strategies.length; index += 1) {
    const strategy = strategies[index];
    if (!strategy.enabled) continue;
    if (strategy.stores.length && !strategy.stores.includes(product.retailer)) continue;
    if (strategy.priceBand !== "any" && strategy.priceBand !== priceBand) continue;
    if (!includeKeywordsMatch(strategy.includeKeywords, keywordText)) continue;
    if (excludeKeywordsMatch(strategy.excludeKeywords, keywordText)) continue;
    const effective = effectiveProductForStrategy(product, strategy, signal);
    return Object.freeze({ state: "matched", strategy, index, priceBand, ...effective });
  }
  return Object.freeze({ state: "unmatched", strategy: null, index: -1, priceBand, product });
}

module.exports = {
  MAX_SIGNAL_KEYWORD_LENGTH,
  MAX_SIGNAL_STRATEGIES,
  SIGNAL_PRICE_BANDS,
  SIGNAL_STRATEGY_ACTIONS,
  STRATEGY_TO_PRODUCT_ACTION,
  effectiveProductForStrategy,
  excludeKeywordsMatch,
  includeKeywordsMatch,
  matchSignalStrategy,
  normalizeKeywordText,
  normalizeSignalStrategies,
  parseKeywordQuery,
  semanticPriceBand,
  signalPriceBand
};
