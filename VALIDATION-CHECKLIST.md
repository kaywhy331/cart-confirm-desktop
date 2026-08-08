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

## 0. Recommended order (read this first)

Sections 1–5 below are the checks. This section is the *sequence* to run them
in — it minimizes blast radius by proving the tool safe on one cheap product
before trusting it with the real buy list, and by deliberately testing that it
blocks bad states rather than only ever testing the happy path.

1. **Pick one store and one low-stakes test product.** In-stock, first-party,
   cheap enough that an unexpected charge is a non-event, not a scarce or
   hyped item. Don't start the first pass across all three stores or all 50
   products at once — if something's wrong, a single store/product run tells
   you which adapter broke it instead of leaving you guessing.
2. **Optional but recommended:** temporarily set that store account's default
   payment to a gift card balance or a low-limit card for the duration of
   testing. Section 1 below is explicit that Cart Confirm cannot verify which
   payment method is selected — this hedges that exact blind spot so a worst
   case is cheap instead of a real problem.
3. Run **section 2** (account-level checks) for that one store.
4. Run **section 3** (Add-to-cart-only dry run) for that one product.
5. Run **section 4** (final-review dry run) for that one product, including
   one supervised **Submit order automatically** run, watched live with a
   hand on the disarm control.
6. **Before widening scope, deliberately trigger the block paths** — this is
   the part that's easy to skip and the highest-value part to actually test,
   since the tool's entire premise is failing closed:
   - [ ] Temporarily raise a cap below the real price (or add a second,
         unconfigured item to that store's cart) and confirm the run stops
         with the expected reason in the event log instead of proceeding.
   - [ ] If you can find a marketplace/third-party offer for any item,
         confirm it's rejected by the first-party check instead of added.
   - [ ] If the store's UI offers a subscription/protection-plan/tip add-on
         anywhere in the flow, confirm a pre-checked instance of it blocks
         submission (section 4's third item) rather than silently proceeding.
   - [ ] Force-quit the desktop app mid-run once, relaunch it, and confirm it
         comes back **disarmed** and does not attempt to resubmit.
7. **Only after 3–6 all look correct**, widen one axis at a time: more
   products on the same store first, then repeat 3–6 fresh on the next store.
   Don't switch the whole buy list to auto-submit in one step.
8. Fold this same one-product-first approach into section 5's "ongoing"
   re-checks — a quick Add-to-cart-only pass on one product is the cheapest
   possible smoke test before trusting a scheduled or high-stakes run,
   especially after time away from the tool.

## 1. What the app actually verifies (for calibration)

So you know exactly where the automated coverage ends:

- **SKU identity** — Target TCIN / Walmart item ID / Amazon ASIN parsed from the
  URL, matched against the cart line (`findLine` in `extension/retailers.js`).
- **First-party seller** — text match against a "sold/shipped by `<retailer>`"
  pattern (`firstPartyPattern` per store). Marketplace/third-party offers are
  blocked. For Target only, an offer with no seller text is accepted as
  first-party when no marketplace marker ("sold/shipped by" a non-Target name,
  "Target Plus", "marketplace seller") appears in scope, because Target labels
  marketplace offers and leaves its own items unlabeled; any marker fails
  closed.
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
- [ ] Confirm the product page's seller state matches what the app expects:
      Walmart needs "Sold and shipped by Walmart.com" and Amazon needs "Ships
      from Amazon.com / Sold by Amazon.com" phrasing. Target items sold by
      Target usually show no seller text at all — that is accepted, as long as
      no "Sold and shipped by <someone else>" / "Target Plus" marker is
      visible. If the wording on screen doesn't fit those expectations for a
      first-party item, the safety check will misfire — flag it instead of
      proceeding.
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

- [ ] Before a high-stakes multi-drop window, give two or three harmless
      same-store test missions the same near-future **Open at** time and confirm
      each page opens exactly once, one second apart. Press **Stop everything**
      during a second supervised test and confirm the remaining pages do not
      open. Do not try to manufacture or repeatedly refresh a retailer queue.
- [ ] When Walmart naturally serves `/qp`, confirm the first queued mission
      produces only one fan-out for that Autopilot run and that every queued tab
      then stays still until Walmart admits it.
- [ ] Re-run section 2 and 4 whenever you change a saved address, payment
      method, or default pickup store on any automated account.
- [ ] Re-run section 3 whenever a retailer visibly redesigns its product,
      cart, or checkout pages, since `extension/retailers.js` selectors are
      resilient but not guaranteed against markup changes (see README
      "Update a retailer adapter").
- [ ] Keep new products in **Add to cart only** or **Stop at final review**
      until sections 3 and 4 have both been completed for that product.

## 6. Discord and direct-entry checks

Run these supervised before relying on signal-triggered purchasing:

- [ ] Connect with an official bot token and confirm the initial signal import is
      marked **History** without opening any store pages.
- [ ] Post or wait for one new signal for a known mission and confirm the inbox
      marks it **Desired** by the exact retailer + SKU. A different SKU with a
      similar title must remain **New**.
- [ ] With **Stop everything** active, confirm new signals are recorded but do
      not open pages. Then use the manual **Product** button and confirm it lifts
      the pause only because you explicitly opened it.
- [ ] For Walmart Buy Now, confirm the retained link is exactly
      `https://www.walmart.com/affil/cart/buynow?items=<configured item ID>` and
      that affiliate/tracking parameters disappeared. Verify the resulting cart
      contains only that item before proceeding.
- [ ] For Amazon ATC or Buy Now, confirm the signal shows `Amazon.com` as seller,
      the ASIN matches the mission, and the resulting cart/review page reports
      the same first-party seller and under-cap price.
- [ ] Temporarily disable or reload the Chrome companion, trigger a direct entry,
      and confirm Cart Confirm falls back to the canonical product page instead
      of following a redirect without mission context.
- [ ] During a supervised same-store multi-signal test, confirm each mission gets
      its own tab one second apart and a tab already assigned to another enabled
      mission is not navigated away. Do not manufacture retailer queues or spam
      live product pages to perform this test.

## 7. Admin/backend Howl sharing-link checks

Run these from the trusted admin workflow or a backend test harness, never from
the mission editor. The provisioning check intentionally registers a real Howl
click, so perform it only when that test campaign is ready to receive one.

- [ ] Confirm the normal mission editor contains no Howl/source URL field or
      resolve action and the renderer preload exposes no link-resolution method.
- [ ] Have the admin workflow call `provisionHowlCampaign` once with a generated
      `howl.me`, `howl.link`, or `shop-links.co` link. Confirm the Howl account
      records the expected click and the app never resolves again because of a
      user save, restart, Discord polling, or Autopilot activity.
- [ ] Confirm the captured link visibly uses the expected `target.com`,
      `walmart.com`, or `amazon.com` host, identifies the mission's exact item
      ID, and retains the campaign query parameters shown by Howl.
- [ ] Inspect a renderer snapshot and Chrome companion configuration. Confirm
      neither contains the source Howl URL or resolution metadata and Chrome
      also receives no affiliate URL. The renderer may receive only the final
      validated retailer URL required for copying.
- [ ] Attempt to include campaign fields in a normal settings save and confirm
      they cannot create or replace backend-owned values.
- [ ] Use **Copy share link** on the saved mission and **Copy campaign link** on
      a matching signal. Confirm both clipboard values are byte-for-byte the
      same resolved retailer URL. Cart Confirm does not post either link.
- [ ] Resolve a test link whose destination is for a different item or store and
      confirm it fails closed without saving or exposing that destination.
- [ ] Use the admin workflow's `clearHowlCampaign` path and confirm both copy
      actions disappear. Re-provision only with the understanding that another
      resolution can register another click.
- [ ] Open or test the mission and confirm Chrome receives its clean canonical
      product URL, not the affiliate URL or any of its tracking parameters.

This checklist does not change or gate any code path — it is the manual
verification referenced in the README's "Start with Add to cart only..." note
and in PR #1's validation notes, made concrete and repeatable.
