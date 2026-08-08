"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("direct Buy Now checkout is forced through fresh cart proof", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");

  assert.match(source, /if \(hasDirectEntryContext\(product\) && !await proofFor\(product\)\) \{[\s\S]*?direct-entry-cart-verification[\s\S]*?location\.assign\(adapter\.cartUrl\);/);
  assert.match(source, /const savedProof = await saveProof\(product, safeLine, "cart", true, inventory\);\s*if \(!savedProof\.ok\) return;\s*await consumeDirectEntryContext\(product\);[\s\S]*?const checkoutButton = adapter\.checkoutButton\(document\);/);
});
