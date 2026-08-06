# Pre-Auto-Submit Validation Checklist

This checklist is the manual half of Cart Confirm's safety model. It exists because
the automated safety checks in `extension/retailers.js` and `extension/content.js`
deliberately do **not** attempt to read or choose your payment method, delivery
address, or pickup store — those are highest-risk to get wrong from scraped markup,
so the app requires them to already be correct in your store account and never
touches them. Nothing here is enforced in code; it is what a human has to confirm
before any product is switched from **Stop at final review** to **Submit order
automatically**.

Run through this once per retailer before the first auto-submit run, and again
after any noticeable change to a store's checkout pages (new checkout redesign,
new account, new saved address/card, etc.). Keep automation **disarmed** for all
of it.

## 1. What the app actually verifies (for calibration)

So you know exactly where the automated coverage ends:

- **SKU identity** — Target TCIN / Walmart item ID / Amazon ASIN parsed from the
  URL, matched against the cart line (`findLine` in `extension/retailers.js`).
- **First-party seller** — text match against a "sold/shipped by `<retailer>`"
  pattern (`firstPartyPattern` per store). Marketplace/third-party offers are
  blocked.
- **Unit price and final order total** — read from price/total selectors and
  compared to your configured caps.
- **Cart completeness** — every cart line is enumerated; unknown/duplicate/extra
  lines block submission.
- **Fulfillment mode** — text-matches the *category* "pickup" vs. "shipping" among
  currently selected/checked controls (`fulfillmentMode`), against whichever mode
  you configured for that product.
- **Unsafe add-ons** — blocks if a checked/selected control's text matches
  subscription, protection plan, warranty, insurance, monthly payments,
  installments, tip, donation, or gift-wrap patterns (`unsafeOrderChoices`).

**What it never reads or selects:** which payment card/method is chosen, the
delivery address on the order, or which specific store/locker a pickup order
will use. It only confirms "pickup" or "shipping" was picked as a *category* —
never that it's the right address or the right pickup location.

## 2. Account-level checks (do this first, per store)

For each of Target, Walmart, and Amazon you plan to automate:

- [ ] Sign in to the store normally in the same Chrome profile Cart Confirm will
      use. Confirm there is exactly one saved default payment method, and that
      it is the one you intend to be charged.
- [ ] Confirm the default/saved shipping address is correct and current.
- [ ] If any product will use **Store pickup**, confirm the account's default
      pickup store is the correct physical location, and that it carries the
      product.
- [ ] Remove or update any saved payment method you would not want used by
      default if the store's checkout silently falls back to it.
- [ ] Empty that store's cart of anything unrelated (the README's step 2) —
      this also removes stale addresses/payment selections tied to old items.

## 3. Per-product markup check (Add-to-cart-only dry run)

With automation disarmed, for every row you intend to eventually auto-submit:

- [ ] Set the row's action to **Add to cart only** and run it manually once.
- [ ] Confirm the product page shows a seller string matching first-party
      phrasing (e.g. Target: "Sold and shipped by Target.com"; Walmart: "Sold
      and shipped by Walmart.com"; Amazon: "Ships from Amazon.com / Sold by
      Amazon.com"). If the page currently shows different wording than those
      patterns for a first-party item, the safety check will misfire — flag it
      instead of proceeding.
- [ ] Confirm the unit price read in the event log matches what's on the page.
- [ ] Confirm the quantity landed in the cart matches what you configured.

## 4. Final-review dry run (before ever enabling auto-submit)

Switch the row to **Stop at final review** (still disarmed for setup, then arm
for one supervised run) and manually walk the checkout to the final review page:

- [ ] On the real final review/order page, confirm the **payment method shown
      is the one you intend to use.** Cart Confirm cannot see or check this.
- [ ] Confirm the **delivery address shown is correct**, or for pickup orders,
      confirm the **exact pickup store location shown is correct.** Cart
      Confirm only checks that a "pickup" or "shipping" option is selected —
      never which one.
- [ ] Confirm no subscription, protection plan, warranty, tip, donation, or
      gift-wrap option is pre-checked. Cross-check against the event log:
      if one was checked, `automation-blocked` with reason matching the
      unsafe-choice pattern should already have fired — treat any mismatch
      between what you see and what the log reported as a bug, not a pass.
- [ ] Confirm the final order total shown on the page matches the value the
      app read out in its status/log for that product, and that both are at
      or below the configured final-total cap.
- [ ] Only after this manual pass looks correct for a given product, switch
      that row to **Submit order automatically** and re-arm.

## 5. Ongoing

- [ ] Re-run section 2 and 4 whenever you change a saved address, payment
      method, or default pickup store on any automated account.
- [ ] Re-run section 3 whenever a retailer visibly redesigns its product,
      cart, or checkout pages, since `extension/retailers.js` selectors are
      resilient but not guaranteed against markup changes (see README
      "Update a retailer adapter").
- [ ] Keep new products in **Add to cart only** or **Stop at final review**
      until sections 3 and 4 have both been completed for that product.

This checklist does not change or gate any code path — it is the manual
verification referenced in the README's "Start with Add to cart only..." note
and in PR #1's validation notes, made concrete and repeatable.
