"use strict";

(function initItemDefaults(globalScope) {
  const RETAILERS = Object.freeze(["target", "walmart", "amazon"]);
  const MAX_MSRP_RECORDS = 40;
  const MAX_ITEM_PROFILES = 20;
  const DEFAULT_ITEM_PROFILE_ID = "built-in:shipping-auto-buy";

  const BUILT_IN_MSRP_CATALOG = Object.freeze([
    Object.freeze({
      id: "msrp:pokemon-etb",
      productLine: "Pokémon",
      productType: "Elite Trainer Box (ETB)",
      matchTerms: Object.freeze(["elite trainer box", "etb"]),
      excludeTerms: Object.freeze(["pokemon center exclusive"]),
      prices: Object.freeze({ target: null, walmart: null, amazon: null }),
      sourceLabel: "Starter product-type template — approve prices before use",
      sourceUrl: "",
      verifiedAt: ""
    }),
    Object.freeze({
      id: "msrp:pokemon-blister",
      productLine: "Pokémon",
      productType: "Blister pack",
      matchTerms: Object.freeze(["blister pack", "3 pack blister", "three pack blister"]),
      excludeTerms: Object.freeze([]),
      prices: Object.freeze({ target: null, walmart: null, amazon: null }),
      sourceLabel: "Starter product-type template — approve prices before use",
      sourceUrl: "",
      verifiedAt: ""
    }),
    Object.freeze({
      id: "msrp:pokemon-single-pack",
      productLine: "Pokémon",
      productType: "Single booster pack",
      matchTerms: Object.freeze(["single booster", "sleeved booster", "booster pack"]),
      excludeTerms: Object.freeze(["booster bundle", "booster box", "blister"]),
      prices: Object.freeze({ target: null, walmart: null, amazon: null }),
      sourceLabel: "Starter product-type template — approve prices before use",
      sourceUrl: "",
      verifiedAt: ""
    }),
    Object.freeze({
      id: "msrp:pokemon-spc",
      productLine: "Pokémon",
      productType: "Super-Premium Collection (SPC)",
      matchTerms: Object.freeze(["super premium collection", "spc"]),
      excludeTerms: Object.freeze([]),
      prices: Object.freeze({ target: null, walmart: null, amazon: null }),
      sourceLabel: "Starter product-type template — approve prices before use",
      sourceUrl: "",
      verifiedAt: ""
    }),
    Object.freeze({
      id: "msrp:pokemon-upc",
      productLine: "Pokémon",
      productType: "Ultra-Premium Collection (UPC)",
      matchTerms: Object.freeze(["ultra premium collection", "upc"]),
      excludeTerms: Object.freeze([]),
      prices: Object.freeze({ target: null, walmart: null, amazon: null }),
      sourceLabel: "Starter product-type template — approve prices before use",
      sourceUrl: "",
      verifiedAt: ""
    })
  ]);

  const BUILT_IN_ITEM_PROFILES = Object.freeze([
    Object.freeze({
      id: DEFAULT_ITEM_PROFILE_ID,
      name: "Shipping auto-buy",
      description: "Quantity 1, shipping required, standard alert, and automatic order submission. Unknown prices stay Off.",
      settings: Object.freeze({
        quantity: 1,
        action: "checkout",
        fulfillmentMode: "shipping",
        alertLevel: "standard",
        signalAutoOpen: true,
        enabled: true,
        maxOrderBuffer: 15
      })
    }),
    Object.freeze({
      id: "built-in:shipping-review",
      name: "Shipping, I submit",
      description: "Prepares checkout with shipping selected, then stops at final review.",
      settings: Object.freeze({
        quantity: 1,
        action: "review",
        fulfillmentMode: "shipping",
        alertLevel: "standard",
        signalAutoOpen: true,
        enabled: true,
        maxOrderBuffer: 15
      })
    }),
    Object.freeze({
      id: "built-in:shipping-watch",
      name: "Shipping watch only",
      description: "Alerts for an approved MSRP match without adding or buying.",
      settings: Object.freeze({
        quantity: 1,
        action: "watch",
        fulfillmentMode: "shipping",
        alertLevel: "standard",
        signalAutoOpen: true,
        enabled: true,
        maxOrderBuffer: 0
      })
    })
  ]);

  function cleanText(value, maximum = 120) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function normalizePositivePrice(value, label = "MSRP") {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
      throw new Error(`${label} must be empty or between $0.01 and $1,000,000.00.`);
    }
    return roundMoney(price);
  }

  function normalizeTimestamp(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function normalizeHttpsUrl(value) {
    const text = cleanText(value, 1_000);
    if (!text) return "";
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error("MSRP source links must be valid HTTPS URLs.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("MSRP source links must be valid HTTPS URLs.");
    }
    url.hash = "";
    return url.toString();
  }

  function normalizeTerms(value, label) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[,\n]/);
    const terms = [];
    const seen = new Set();
    for (const entry of raw) {
      const term = cleanText(entry, 60).toLocaleLowerCase();
      if (!term || seen.has(term)) continue;
      if (term.length < 2) throw new Error(`${label} must contain at least two characters.`);
      seen.add(term);
      terms.push(term);
      if (terms.length >= 16) break;
    }
    return terms;
  }

  function normalizeMsrpRecord(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("An MSRP record must be an object.");
    }
    const id = cleanText(input.id, 80);
    if (!/^msrp:[a-z0-9][a-z0-9:_-]{2,74}$/i.test(id)) {
      throw new Error("An MSRP record has an invalid ID.");
    }
    const productLine = cleanText(input.productLine, 60);
    const productType = cleanText(input.productType, 80);
    if (!productLine || !productType) throw new Error("Each MSRP record needs a product line and product type.");
    const matchTerms = normalizeTerms(input.matchTerms, "MSRP match terms");
    if (!matchTerms.length) throw new Error("Each MSRP record needs at least one match term.");
    const prices = {};
    for (const retailer of RETAILERS) {
      prices[retailer] = normalizePositivePrice(input.prices?.[retailer], `${retailer} MSRP`);
    }
    const sources = {};
    for (const retailer of RETAILERS) {
      const source = input.sources?.[retailer] || {};
      sources[retailer] = {
        label: cleanText(source.label, 120),
        url: normalizeHttpsUrl(source.url),
        verifiedAt: normalizeTimestamp(source.verifiedAt)
      };
    }
    const legacySource = {
      label: cleanText(input.sourceLabel, 120),
      url: normalizeHttpsUrl(input.sourceUrl),
      verifiedAt: normalizeTimestamp(input.verifiedAt)
    };
    if (legacySource.label || legacySource.url || legacySource.verifiedAt) {
      for (const retailer of RETAILERS) {
        if (prices[retailer] !== null && !sources[retailer].label && !sources[retailer].url) {
          sources[retailer] = { ...legacySource };
        }
      }
    }
    return {
      id,
      productLine,
      productType,
      matchTerms,
      excludeTerms: normalizeTerms(input.excludeTerms, "MSRP exclusion terms"),
      prices,
      sources,
      sourceLabel: legacySource.label,
      sourceUrl: legacySource.url,
      verifiedAt: legacySource.verifiedAt
    };
  }

  function cloneStarterCatalog() {
    return BUILT_IN_MSRP_CATALOG.map((record) => normalizeMsrpRecord(record));
  }

  function normalizeMsrpCatalog(input, fallback = BUILT_IN_MSRP_CATALOG) {
    const source = Array.isArray(input) ? input : fallback;
    const records = [];
    const ids = new Set();
    for (const candidate of source) {
      if (records.length >= MAX_MSRP_RECORDS) break;
      try {
        const record = normalizeMsrpRecord(candidate);
        if (ids.has(record.id)) continue;
        ids.add(record.id);
        records.push(record);
      } catch {
        // Persisted malformed records are ignored so one bad row cannot stop
        // the safety settings from loading.
      }
    }
    return records;
  }

  function normalizeItemProfileSettings(input = {}) {
    const quantity = Number(input.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error("Profile quantity must be a whole number from 1 to 99.");
    }
    const action = String(input.action || "checkout");
    if (!["watch", "cart", "review", "checkout"].includes(action)) {
      throw new Error("Choose a valid profile action.");
    }
    const fulfillmentMode = String(input.fulfillmentMode || "shipping");
    if (!["shipping", "pickup"].includes(fulfillmentMode)) {
      throw new Error("Item profiles must explicitly require shipping or pickup.");
    }
    const alertLevel = String(input.alertLevel || "standard");
    if (!["standard", "alarm", "silent"].includes(alertLevel)) {
      throw new Error("Choose a standard, alarm, or silent profile alert.");
    }
    const buffer = Number(input.maxOrderBuffer ?? 0);
    if (!Number.isFinite(buffer) || buffer < 0 || buffer > 1_000_000) {
      throw new Error("Profile order-total allowance must be from $0.00 to $1,000,000.00.");
    }
    return {
      quantity,
      action,
      fulfillmentMode,
      alertLevel,
      signalAutoOpen: input.signalAutoOpen !== false,
      enabled: input.enabled !== false,
      maxOrderBuffer: roundMoney(buffer)
    };
  }

  function normalizeCustomItemProfile(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("An item profile must be an object.");
    }
    const id = cleanText(input.id, 80);
    if (!/^custom:[a-z0-9][a-z0-9:_-]{2,74}$/i.test(id)) {
      throw new Error("An item profile has an invalid ID.");
    }
    const name = cleanText(input.name, 40);
    if (!name) throw new Error("Give the item profile a name.");
    return {
      id,
      name,
      description: cleanText(input.description, 160),
      settings: normalizeItemProfileSettings(input.settings)
    };
  }

  function normalizeItemProfiles(input = []) {
    if (!Array.isArray(input)) return [];
    const profiles = [];
    const ids = new Set();
    const names = new Set();
    for (const candidate of input) {
      if (profiles.length >= MAX_ITEM_PROFILES) break;
      try {
        const profile = normalizeCustomItemProfile(candidate);
        const name = profile.name.toLocaleLowerCase();
        if (ids.has(profile.id) || names.has(name)) continue;
        ids.add(profile.id);
        names.add(name);
        profiles.push(profile);
      } catch {
        // Invalid persisted custom profiles are discarded.
      }
    }
    return profiles;
  }

  function allItemProfiles(customProfiles = []) {
    return [...BUILT_IN_ITEM_PROFILES, ...normalizeItemProfiles(customProfiles)];
  }

  function itemProfileById(id, customProfiles = []) {
    return allItemProfiles(customProfiles).find((profile) => profile.id === id) || null;
  }

  function normalizeDefaultItemProfileId(value, customProfiles = []) {
    const requested = cleanText(value, 80) || DEFAULT_ITEM_PROFILE_ID;
    return itemProfileById(requested, customProfiles) ? requested : DEFAULT_ITEM_PROFILE_ID;
  }

  function normalizedMatchText(value) {
    return ` ${String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
  }

  function containsTerm(text, term) {
    const normalized = normalizedMatchText(term).trim();
    return normalized && text.includes(` ${normalized} `);
  }

  function resolveMsrpRecord(value, catalog = []) {
    const directId = cleanText(value?.msrpRecordId, 80);
    if (directId) {
      const direct = catalog.find((record) => record.id === directId);
      if (direct) return direct;
    }
    const text = normalizedMatchText([
      value?.title,
      value?.productLine,
      value?.productType
    ].filter(Boolean).join(" "));
    if (!text.trim()) return null;
    let best = null;
    let bestScore = -1;
    for (const record of catalog) {
      if ((record.excludeTerms || []).some((term) => containsTerm(text, term))) continue;
      const matching = (record.matchTerms || []).filter((term) => containsTerm(text, term));
      if (!matching.length) continue;
      const score = Math.max(...matching.map((term) => normalizedMatchText(term).trim().length));
      if (score > bestScore) {
        best = record;
        bestScore = score;
      }
    }
    return best;
  }

  function msrpFor(value, retailer, catalog = []) {
    const record = resolveMsrpRecord(value, catalog);
    const price = record?.prices?.[retailer];
    return Number.isFinite(price) && price > 0 ? { record, price } : { record, price: null };
  }

  function applyItemProfile(product = {}, profile, catalog = [], options = {}) {
    if (!profile) throw new Error("Choose an item profile.");
    const settings = normalizeItemProfileSettings(profile.settings);
    const retailer = String(product.retailer || "").toLocaleLowerCase();
    const resolved = msrpFor(product, retailer, catalog);
    const existingPrice = Number(product.maxPrice);
    const hasExistingPrice = Number.isFinite(existingPrice) && existingPrice > 0;
    const useExistingPrice = options.preferExistingPrice === true && hasExistingPrice;
    const usesApprovedMsrp = !useExistingPrice && Boolean(resolved.price);
    const maxPrice = usesApprovedMsrp
      ? resolved.price
      : (hasExistingPrice ? roundMoney(existingPrice) : 0);
    const hasApprovedCap = maxPrice > 0;
    const needsOrderTotal = ["review", "checkout"].includes(settings.action);
    return {
      ...product,
      maxPrice,
      maxOrderTotal: needsOrderTotal && hasApprovedCap
        ? roundMoney(maxPrice * settings.quantity + settings.maxOrderBuffer)
        : 0,
      quantity: settings.quantity,
      action: settings.action,
      alertLevel: settings.alertLevel,
      fulfillmentMode: settings.fulfillmentMode,
      signalAutoOpen: settings.signalAutoOpen,
      enabled: settings.enabled && hasApprovedCap,
      itemProfileId: profile.id,
      msrpRecordId: resolved.record?.id || cleanText(product.msrpRecordId, 80),
      priceSource: usesApprovedMsrp ? "approved-msrp" : (hasApprovedCap ? cleanText(product.priceSource, 40) || "manual" : "")
    };
  }

  const api = {
    BUILT_IN_ITEM_PROFILES,
    BUILT_IN_MSRP_CATALOG,
    DEFAULT_ITEM_PROFILE_ID,
    MAX_ITEM_PROFILES,
    MAX_MSRP_RECORDS,
    RETAILERS,
    allItemProfiles,
    applyItemProfile,
    cloneStarterCatalog,
    itemProfileById,
    msrpFor,
    normalizeCustomItemProfile,
    normalizeDefaultItemProfileId,
    normalizeItemProfileSettings,
    normalizeItemProfiles,
    normalizeMsrpCatalog,
    normalizeMsrpRecord,
    resolveMsrpRecord
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.CartConfirmItemDefaults = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
