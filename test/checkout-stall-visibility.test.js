"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const contentSource = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

test("a transient interactive frame is rechecked before a manual-action block is posted", () => {
  // The block only fires after the state survives INTERACTIVE_CONFIRM_MS.
  assert.match(contentSource, /const INTERACTIVE_CONFIRM_MS = 1_500;/);
  assert.match(
    contentSource,
    /if \(\["auth", "mfa", "location", "membership"\]\.includes\(interactiveState\)\) \{\s*const sightingKey = [\s\S]*?scheduleScan\(INTERACTIVE_CONFIRM_MS \+ 100, \{ replace: false \}\);\s*return;\s*\}\s*clearRetry\(\);/
  );
  // Sightings reset as soon as a scan sees a non-interactive page, so a later
  // genuine wall is debounced fresh instead of firing off stale timestamps.
  assert.match(contentSource, /interactiveSightings\.clear\(\);\s*\n\s*void send\("page-observed"/);
});

test("cart and checkout claim failures surface their reason and keep rechecking", () => {
  for (const stage of ["cart", "checkout"]) {
    const pattern = new RegExp(
      `\\\`The ${stage} page is waiting for the \\$\\{adapter\\.label\\} store lane[\\s\\S]{0,200}?\\\`${stage}-claim-wait:\\$\\{product\\.id\\}:\\$\\{claim\\.reason \\|\\| ""\\}\\\`, 30_000\\);\\s*scheduleScan\\(2_000, \\{ replace: false \\}\\);\\s*return;`
    );
    assert.match(contentSource, pattern, `${stage} claim visibility`);
  }
  // No bare-return claim failure is left anywhere in the content script.
  assert.doesNotMatch(contentSource, /const claim = await claimProduct\(product\);\s*if \(!claim\.ok\) \{\s*return;\s*\}/);
});

test("a persistently missing Place Order control is reported while rechecks continue", () => {
  assert.match(contentSource, /const SUBMIT_CONTROL_MISSING_REPORT_MS = 20_000;/);
  assert.match(
    contentSource,
    /if \(!submitButton\) \{[\s\S]*?submit-control-missing:\$\{product\.id\}:\$\{pageAddress\(\)\}[\s\S]*?scheduleScan\(1_500\);\s*return;\s*\}\s*missingSubmitSince\.delete\(product\.id\);/
  );
});

test("the checkout-reached notification copy matches the mission's authorized action", () => {
  assert.match(
    mainSource,
    /event\.eventType === "checkout-reached"[\s\S]*?product\.action === "checkout"\s*\? "The browser companion is validating the order review before submission\."[\s\S]*?product\.action === "review"[\s\S]*?you submit the final order[\s\S]*?complete the purchase there yourself/
  );
});
