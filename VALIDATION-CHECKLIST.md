# Pre-Auto-Submit Validation Checklist

This checklist is the manual half of Cart Confirm's safety model. It exists because
the automated safety checks in `extension/retailers.js` and `extension/content.js`
never choose your payment method, delivery address, or pickup store. For auto-submit,
the operator approves the visible final-review state while Autopilot is off; the
extension converts the selected destination/store and complete payment set to keyed
HMAC fingerprints, persists no readable labels, and requires the same state before
submission. The human must still verify that the visible labels are intended.

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
   hyped item. Don't start the first pass across all three stores or all 100
   products at once — if something's wrong, a single store/product run tells
   you which adapter broke it instead of leaving you guessing.
2. **Optional but recommended:** temporarily set that store account's default
   payment to a gift card balance or a low-limit card for the duration of
   testing. Cart Confirm binds the visible selected payment set but cannot
   independently validate account ownership, funding, or a store-side fallback.
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
         comes back **STOPPED**: no tab scans, retry feed events, background
         checks, Discord polls, scheduled openings, or resubmission attempts.
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

**What it reads but never selects:** for auto-submit preflight, the visible selected
payment labels and delivery-address or pickup-store label. Those labels stay
transient; only keyed fingerprints and the instrument count are retained. The app
cannot decide whether those real-world choices are right for you.

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

### Mission import checks

- [ ] With Autopilot off, run a **Catalog Inbox** keyword search against one retailer. Confirm exactly one official search page opens and the inbox lists only visible result cards with the correct retailer, item ID, title, canonical URL, displayed price (or **Not shown**), and observation time.
- [ ] Repeat with include words, exclude words, and a maximum displayed price. Confirm nonmatching titles, missing prices under a maximum-price filter, and prices above the maximum stay out of the inbox. Confirm no pagination, scrolling, repeated retailer requests, or private API calls are initiated by Cart Confirm.
- [ ] In **Item defaults**, leave one product type without prices and approve a different type for Target, Walmart, and Amazon. Import matching and nonmatching catalog results with an explicitly selected profile. Confirm matching rows receive only their retailer's approved MSRP and selected profile; unknown rows retain the profile fields but stay Off at $0. Confirm displayed listing prices never become caps.
- [ ] Use Catalog Inbox **Select all** and **Select none**, import one result only once, and confirm existing missions are skipped and the 100-mission limit is never exceeded.
- [ ] Select one harmless exact Walmart result with an approved Walmart MSRP and item profile, choose a future **Known Walmart drop time**, and select **Monitor selected for Walmart prep**. Confirm the candidate appears separately from Missions and Autopilot can arm with only that candidate. Observe that the first public-page response establishes a baseline and does not add a Mission; an unchanged or `304` response, timeout, and network failure also do not. In a controlled local/mock test, confirm a `200` to `404`/`503` transition, recovery to `200`, embedded availability/price change, or `/qp` redirect moves only that exact item into Missions while preserving its profile, approved caps, and drop time. Confirm no browser page opens before that time.
- [ ] While a harmless Walmart prep check is in flight, press **Stop everything**. Confirm the request is aborted, the cached observation is cleared, the configured candidate and its future time remain saved, and a late response cannot create a Mission. Re-arm and confirm the candidate establishes a fresh baseline before monitoring changes again. Confirm prep checks rotate one at a time no faster than every 30 seconds, consume the shared 120-action/hour Walmart budget, respect overload cooldowns, and never request a private inventory, checkout, ticket, or signature endpoint.

- [ ] With the desktop connected and Autopilot off, use the Chrome toolbar
      **Quick add** popup on one product page from each supported retailer.
      Confirm the preview shows the exact TCIN / Walmart item ID / ASIN, title,
      and current retailer-page price. Add it and confirm Missions receives a
      row whose maximum unit price exactly matches the preview and whose other
      fields match the selected default item profile. Confirm a small product
      thumbnail appears before the store name and hovering the row opens a
      medium preview without navigating away; a broken or missing retailer
      image must leave the row usable without a preview. On a new install, confirm
      shipping + watch-only. Confirm
      Autopilot remains Off and no cart or checkout action occurs during import.
- [ ] Change an existing Quick-added mission's cap, then Quick-add the same
      product again. Confirm the popup reports a duplicate and the existing
      mission, cap, action, and enabled state remain unchanged.
- [ ] On a product page whose price is still loading or unavailable, confirm
      Quick add shows **Not readable** and cannot add the mission. Also confirm
      Quick add is blocked while Autopilot is armed.
- [ ] Confirm the toolbar action is named **Quick add**. Open it and verify the
      top-right ×, the smaller × beside **Add with default profile**, Escape, and a
      click outside the popup each close it without creating a mission.
- [ ] In desktop **Bulk import**, paste tracked and duplicate Target, Walmart,
      and Amazon product URLs plus one unsupported line. Confirm supported IDs
      are detected once, tracking parameters are removed, and the invalid line
      is reported. Confirm the default profile is applied; a matching approved
      MSRP can make a row ready, while an unknown product remains Off with a $0 cap.
- [ ] Create, update, select, restart with, and delete a custom item profile.
      Confirm selecting it in a mission immediately applies all allowlisted
      fields without a second Apply action. Update a profile used by multiple
      missions and accept the one confirmation; confirm every linked mission
      updates in the same save. Repeat and decline; confirm their stamped settings
      remain unchanged. In **Edit plan**, filter the list, use **Select shown**,
      and confirm only selected rows change and an unknown $0 row cannot become enabled.
- [ ] In **Edit plan**, choose two missions and select **Copy list**. Paste into
      a plain-text editor and confirm each entry is exactly
      `Title - $ExpectedPrice`, followed by its product URL, with one blank line
      between entries. Confirm a mission without a positive cap says **Price not set**.
- [ ] Arm harmless missions, then edit one mission. Confirm Autopilot pauses once
      and **Edit plan** changes to **Finish editing**. Save or cancel several
      individual edits and apply multiple bulk changes; confirm none starts a new
      run. Select **Finish editing**, approve the safety confirmation once, and
      confirm exactly one updated run starts. Repeat, but press **Stop everything**
      during the session; confirm finishing or cancelling an open editor cannot
      re-arm the app.
- [ ] Give two harmless missions future **Open at** times, press **Stop everything**,
      and restart the app. Confirm both times remain present while no schedule can
      fire in the stopped state. Use **Edit plan → Clear selected times** and
      confirm only that explicit action removes them.
- [ ] Configure a test OpenAI API key only on a machine where OS encryption is
      available. Confirm the key is never echoed or written to settings JSON.
      Run MSRP research, open every cited source, and confirm suggestions do not
      change approved MSRP or mission caps until **Accept MSRP** is selected.
      Confirm acceptance updates only that retailer/type and existing missions
      still require an explicit profile/bulk apply. Remove the key afterward.
- [ ] Open **Speed and traffic settings (optional)** and apply each ready-made
      setup with Autopilot off. Confirm only the timing/media inputs change and
      that all missions, caps, quantities, actions, and enabled states remain
      identical. Confirm applying a setup is refused while Autopilot is on.
- [ ] Save a named custom setup, restart Cart Confirm, and confirm it remains in
      **Your saved setups**. Apply it, update it, and delete it. Confirm deleting
      the saved copy does not change the numbers currently in use.

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
- [ ] Confirm Walmart and Amazon still produce only one **Add Clicked** event.
      For an unscheduled Target watcher, confirm the rapid persistence lane is
      not used. Then schedule a harmless Target mission and, after its calendar
      release, trigger a supervised overload/error dialog. Confirm it is
      dismissed and retried only inside the configured bounded persistence
      window. An ambiguous Add must open the cart for exact-TCIN verification;
      only an explicit rejection or a fully loaded cart proving that TCIN absent
      may produce another Add click.
- [ ] Confirm the quantity landed in the cart matches what you configured.
- [ ] On Target, confirm quantity-plus retries stop immediately at the configured
      quantity, and that the fixed per-stage and 120-actions/hour limits stop a
      persistent error instead of looping indefinitely.

## 4. Final-review dry run (before ever enabling auto-submit)

Switch the row to **Stop at final review** (still disarmed for setup, then arm
for one supervised run) and manually walk the checkout to the final review page:

- [ ] On the real final review/order page, confirm every **selected payment
      instrument shown is intended**, then approve checkout preflight from the
      companion popup while Autopilot is off.
- [ ] Confirm the **delivery address shown is correct**, or for pickup orders,
      confirm the **exact pickup store location shown is correct.** Preflight
      binds the visible label but cannot decide whether it is right for you.
- [ ] After approval, change the destination/pickup store, payment set,
      substitutions, quantity, SKU, fulfillment, mission cap, action, or total.
      Confirm auto-submit blocks until a fresh preflight is approved.
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
- [ ] On Target, verify an ambiguous **Place order** error stays durably locked.
      In a separate supervised failure case, verify a retry occurs only when
      the visible Target error explicitly says the order was not placed, and
      that the complete SKU, seller, quantity, unit-price, fulfillment, and
      final-total evidence is revalidated before that retry.

## 5. Ongoing

- [ ] Press **Monitor only** once and confirm every enabled mission
      without an **Open at** time is checked through the paced store queues.
      Confirm scheduled missions stay closed until their configured time.
- [ ] Leave a scheduled product page open, arm Autopilot before its time, and
      confirm the tab reports calendar waiting without page observations,
      refreshes, cart actions, quiet checks, signal openings, or queue fan-out.
      Confirm automation begins only after the configured time is reached. In
      a separate supervised test, miss the time by over two minutes and confirm
      it stays locked until you explicitly clear or reschedule **Open at**.
- [ ] Arm one harmless unavailable Target or Walmart mission without an **Open at** time or fresh browser tab. Confirm its card says **continuous watcher**, its first public check enters the immediate paced ramp, and each later start receives an independently randomized 45–90 second deadline. Keep the app supervised long enough to observe both varying intervals and continued operation until **Stop everything**. Safety cooldowns and capacity may delay the target and must report the delay without issuing catch-up requests.
- [ ] Arm Autopilot once with several harmless unavailable, unscheduled Target or Walmart missions and confirm Activity immediately lists one **Watch Started** milestone for every due mission after the companion connects. Confirm every eligible product's first quiet read is started before any product's second quiet read, starts remain shuffled and gapped, no product overlaps itself, the cards remain continuous watchers, and **Open all due** still opens them immediately when explicitly selected.
- [ ] In a controlled/mock run, confirm quiet reads increment only the separate 4,000/hour/store public-read ledger and persist each product's 45-second restart floor. Confirm they do not change the 120/hour browser/cart/checkout ledger; a likely-stock Chrome opening still requires that existing browser-action reservation.
- [ ] With a supervised, low-risk in-stock Target mission set to **Watch & alert
      only**, confirm its background stock hint opens Chrome on the canonical
      product page and the browser independently revalidates it. Then validate
      **Stop at final review** leaves the tab on Target checkout review; only
      after completing section 4, validate that a successful auto-submit stays
      on Target's confirmation/receipt page. Confirm no direct checkout or
      synthetic receipt redirect occurs.
- [ ] With two harmless unavailable same-store unscheduled missions, confirm
      each uses the configured **Watcher interval** rather than the rapid lane.
      Then schedule two harmless missions for the same near-future time and
      confirm their cards change from calendar-gated to **calendar blitz** only
      after release, using the configured **Blitz stock refresh** spacing.
- [ ] Trigger a loud test alarm, select **Silence**, and confirm the alarm bar
      disappears. Trigger an away digest, select **Dismiss**, and confirm that
      bar disappears too. Relaunching must not replay persisted feed entries as
      a new alarm.
- [ ] Before a high-stakes multi-drop window, give two or three harmless
      same-store test missions the same near-future **Open at** time and confirm
      each page opens exactly once. Walmart pages must launch together in
      dedicated tabs; other same-store pages remain one second apart. In a
      separate supervised non-Walmart test, press **Stop everything** during a
      spacing wait and confirm the wait ends immediately and the remaining
      pages do not open. Do not try to manufacture or repeatedly refresh a
      retailer queue.
- [ ] In a controlled/mock Walmart queue test, confirm scheduled pages launch together and each nonqueued tab uses only the configured rapid lane before the first queue signal. After one exact-item queue is recognized, confirm that queued tab freezes immediately and every other participating tab performs no more than **Final queue-capture reloads** (zero by default, configurable from 0–20), freezing early if it reaches a queue. Confirm Stop, overload handling, the blitz window, and the shared 120-action/hour budget terminate or delay the flow as documented.
- [ ] With Autopilot on and a tab-less Target or Walmart mission checking in the
      background, press **Stop everything** while a check is in flight. Confirm
      it cannot add a feed event, reopen Chrome, or lift the `STOPPED` state
      after its network response or timeout arrives.
- [ ] In controlled/mock responses, confirm three transient unreadable results give only that exact product a non-blocking **retrying** status and a ten-minute rest, after which a readable response clears the degraded state. Confirm a complete page with no readable stock data (a browser-only shell) opens the authenticated Chrome watcher after the first check instead of the third. Confirm this retry chatter does not enter Activity. Confirm a `429`/overload or visible security challenge pauses the retailer, while four distinct transport-failing products within one minute open the shared store cooldown without stopping the other retailer.
- [ ] During a supervised harmless run, confirm Activity contains only **Watch Started**, **Qualified**, **Added to Cart**, **Ordered**, and **Notified** entries. Confirm page observations, unavailable states, retries, checkout navigation, and internal automation status do not appear there, while mission cards and top-level status still update.
- [ ] When Walmart naturally serves `/qp` or an explicit product-route waiting
      room, confirm the first queued mission produces only one simultaneous
      fan-out for that Autopilot run. The winning tab and every tab that later
      reaches the queue must stay still until Walmart admits it. Each remaining
      scheduled Walmart blitz tab must wait for the page-settle check, reload no
      more than **Walmart queue-capture reloads** (zero by default), and remain
      idle after the cap. Press **Stop everything** during the supervised test
      and confirm any pending final reload is cancelled. Do not manufacture a
      retailer queue for this test.
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
- [ ] With **Stop everything** active, confirm the Discord last-poll time and
      inbox do not change. Then use an explicit Arm, Monitor-only, or Open action and
      confirm polling resumes; a signal that became stale while stopped must
      not auto-open. The manual **Product** button may lift the pause because it
      is itself an explicit Open action.
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
