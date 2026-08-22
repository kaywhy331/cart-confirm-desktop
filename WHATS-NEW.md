# What's new

User-facing highlights for each release. The unsigned-prerelease workflow
copies the current version's bullets into the GitHub release, and the desktop
update dialog shows exactly these bullets. Keep every entry short, plain, and
about what the user will notice — one bullet per change, no internals.
Publishing fails if the version being released has no section here.

## 3.8.11
- Exact live TrackaLacker alerts can now create and enable a missing store mission while Signals is running, so newly followed products can flow into CartCollect without a separate manual import
- New missions inherit your ordered CartSignals strategy, quantity, seller policy, and item defaults; duplicate, test, unresolved, ambiguous, and paused alerts remain non-actionable
- Automatic missions use a trusted pre-synced reference or approved MSRP for their price cap and fall back to Watch only when no safe cap exists, while every purchase action still rechecks stock, price, seller, and identity

## 3.8.10
- Add and Edit remain available when Signals or Autopilot is running and explain that the active purchase mode must be turned off before authorization rules can change
- Accepting the prompt safely disarms purchase actions and opens the editable CartSignals form; declining leaves the current run unchanged
- The strategy card now shows the active editing lock directly instead of relying on disabled controls and hidden tooltips

## 3.8.9
- TrackaLacker's normal browser connection now supplies the single Windows popup while the CartCollect companion receives its separate push silently
- Generic “IN STOCK at Store” alerts can match exact mapped products through sanitized product slugs or retailer item IDs instead of appearing unsupported
- Alerts without a safe product identity are clearly marked unresolved and remain non-actionable; existing price, seller, strategy, duplicate, and dry-run safeguards still apply

## 3.8.8
- Live TrackaLacker alerts such as “Product is in stock at Store” now resolve the exact product and retailer instead of appearing as unsupported events
- Generic live alerts can use sanitized numeric product or listing hints while full notification URLs and tracking details stay out of CartCollect
- Price, seller, mission, strategy, duplicate, and dry-run safeguards still apply before any configured action can run

## 3.8.7
- TrackaLacker registers the companion with the discreet Desktop - Windows - Chrome device name
- TrackaLacker alerts keep their original notification title, sound, visibility, and safe click destination while also reaching CartSignals
- Every received TrackaLacker alert is visible with separate browser-receipt and app-delivery status, and the Before you run card no longer covers other cards

## 3.8.6
- Connect TrackaLacker push now opens the correct signed-in notification settings page immediately instead of waiting silently for an idle extension
- Verify browser test guides you through TrackaLacker's real test button and confirms the full TrackaLacker-to-Chrome-to-Cart Confirm delivery path
- TrackaLacker test pushes remain non-purchasing and produce a visible, soundless companion receipt when delivery succeeds

## 3.8.5
- Signal price choices are now maximums, so At or below MSRP accepts MSRP and every lower qualifying offer
- Each signal strategy can explicitly allow marketplace sellers, while first-party-only remains the default
- Stock, price, and seller are checked again before cart actions; mismatches cancel only that attempt while later legitimate restock signals can try again

## 3.8.4
- Signals now shows a guided setup path and blocks Start Signals until at least one item and one real browser, TrackaLacker, or Discord source are ready
- Connect one page can establish the Chrome observation path without turning on an item, while Watch-only items no longer require a purchase price cap
- TrackaLacker Connect/Recheck now opens in the installed companion's Chrome profile, waits for a confirmed enrollment result, and can repair a deleted registration without recurring polling
- Signal strategies now include a safe Notify catchall shortcut and preview the effective action and quantity that each enabled mission can actually authorize

## 3.8.3
- New ordered Signal strategies let you choose a price band, available stores, include and exclude keywords, an action, and quantity 1–5 or Max Allowed
- Strategies run from top to bottom and the first enabled match wins; an empty keyword rule acts as a catchall, with a warning when it would hide rules below it
- Matching signals can notify, add to cart, prepare checkout, or submit an order while the mission's existing action, quantity, price, seller, fulfillment, and checkout safeguards remain hard limits

## 3.8.2
- TrackaLacker signals now arrive through the bundled Chrome extension's own Web Push subscription, using your existing signed-in TrackaLacker tab for one-time device enrollment and no recurring TrackaLacker polling
- The setup screen now connects Chrome push directly; the AppX listener, native notification permission, and separate listener package are no longer required
- Push registration and delivery diagnostics expose only safe status, while subscription keys, cookies, CSRF values, and session data remain inside the live browser request
- Check for updates now installs the desktop app and matching bundled Chrome extension files together, then the companion reloads the updated folder automatically; Chrome may ask once to approve the new notification permission

## 3.8.1
- Unsigned Windows builds now offer an Install signed listener package action that finds a same-version or newer stable CartCollect AppX, verifies its release checksum, and opens Windows App Installer; native alert capture stays locked until the signed copy launches

## 3.8.0
- New Signals mode keeps every item dormant until an exact TrackaLacker, browser, or Discord alert matches that item and store, then reuses the existing price, seller, quantity, fulfillment, and checkout safeguards
- The signed Windows package can capture TrackaLacker Chrome desktop alerts without polling, retain them through restarts, remove duplicates, wake CartCollect, and evaluate the matching mission in near real time
- TrackaLacker scans now swap in a complete mapping snapshot atomically, so a failed or cancelled rescan never creates a temporary matching outage
- Signal diagnostics show listener permission, mapping and queue health, recent outcomes, duplicate counts, and measured latency; delivery can pause without losing captured alerts, and a dry-run replay can never open a store
- TrackaLacker store price histories now preserve the latest, low, high, reference price, and trend while excluding surge-only observations from automatic caps

## 3.7.8
- Fixed TrackaLacker scans incorrectly reporting that no followed products were found on signed-in accounts
- Followed products, exact store links, images, and Listing History prices now import from TrackaLacker's current page data, with clearer sign-in and browser-verification guidance when access is blocked

## 3.7.7
- Import followed TrackaLacker products into an item-first preview with thumbnails, TrackaLacker sources, exact Target, Walmart, and Amazon store links, and per-store toggles
- Listing History links now provide conservative expected store prices; surge, above-MSRP, and scalper observations are excluded, while product-level fallback prices stay Off for review
- Multiple stores for one followed product import under one shared item instead of becoming duplicate items, with existing routes skipped and the 100-store-option limit enforced
- Large imports run sequentially with progress, bounded retries, cancellation, and saved partial results while using only the browser's existing TrackaLacker sign-in

## 3.7.6
- Products now appear once as items, with Target, Walmart, and Amazon as store options; the first store that secures an item stops its alternatives for that run
- Each item row shows its captured product thumbnail, opens a larger preview on hover or keyboard focus, and keeps direct Open controls and store-specific prices beneath one item name
- Search, filters, groups, 25-row paging, bulk changes, Undo, and Revert plan make plans up to 100 items easier to review and change safely
- Review this run now summarizes readiness, schedules, action mix, blockers, and maximum exposure, while the persistent run banner always shows whether the app is stopped, monitoring, or using Autopilot
- Link imports now preview ready, unpriced, invalid, duplicate, and over-capacity entries before saving; the schedule agenda adds timezone, same-time cohorts, direct editing, and missed-time recovery

## 3.7.5
- New: Run readiness now summarizes Chrome connection, enabled and scheduled missions, action mix, blockers, and maximum exposure before you start
- Editing a running plan pauses it once and keeps it paused while you make several mission, catalog, or default changes; Finish editing resumes once, while Stop everything cancels the run without erasing mission schedules
- Profile, On/Off, group, copy, and shared-time controls now sit directly above the filtered Missions list, with row selection for changing several missions together
- Picking a mission profile now applies it immediately, and saving a changed custom profile can update every mission linked to that profile in one step
- Catalog and Item defaults start collapsed and remember their state; the wider responsive layout fits the default window without sideways scrolling and makes mission status easier to scan

## 3.7.4
- Fixed: Chrome kept ping-ponging back to the first carted item while the other missions were still loading — stock-detected mission tabs now open quietly in the background, and a carted item that is just holding for the combined order no longer re-pulls its tab forward
- The only tab that comes to the front is the mission actually purchasing right now: adding to cart, or the combined-order captain heading into the single checkout
- New: product thumbnails captured from each retailer now appear before the store name, with a larger preview when you hover the mission or focus its thumbnail
- Mission capacity increased from 50 to 100 across adding, importing, copying, saved release groups, and same-time scheduled launches

## 3.7.3
- Fixed: on Target's redesigned buy box the mission could add the item under "Ready for pickup" even though it was configured for Shipping — the new method cells (Pickup / Delivery / Shipping) mark their selection in a way the old reader could not see
- The selected method cell is now read directly, a plain "Add to cart" button is only pressed when the mission's configured method is provably the selected one, and "Ship it" / "Pick it up" buttons only count for the matching mission; otherwise Autopilot first selects your configured method (bounded, never a store, zip, or location) and re-checks
- Fixed: the page no longer glitch-scrolls up and down — controls are scrolled into view only when they are actually off screen, instead of centering on every attempt

## 3.7.2
- Fixed: with several missions running, Chrome's focus jumped constantly between tabs (product pages, cart, checkout) — every qualified-but-waiting mission was pulling its own tab forward. Now only the mission actually holding the store's purchase lane brings its tab to the front; waiting missions stay quietly in the background until it is their turn

## 3.7.1
- Fixed: after the first item was added to the cart, the remaining missions could stop with "could not prepare this mission's add-to-cart boundary (disarmed)" even though Autopilot was still on — a momentary communication hiccup with the desktop was being mistaken for a Stop
- A pre-click check that cannot reach the desktop now keeps the verified offer on the page and simply retries in a few seconds instead of ending the mission
- If Autopilot really is off when an offer qualifies, the mission now shows a plain "Autopilot is switched off" status instead of a safety-check error
- Fixed: on Target pages using the redesigned buy box, the eligible mission could sit at "Ready" because the Add button (a plain "Ship it" / "Add to cart" label with no product hooks) was never recognized — these layouts are now matched safely, still excluding recommendations, carousels, and other items

## 3.7.0
- New: "Combined order per store" setting (off by default). When on, each store's auto-buy missions first all validate, every in-stock item is added to the cart and held, and once the full list has a status one checkout submits every line together as a single order
- The combined total is capped at the sum of the included missions' order caps; each line still verifies its exact item, quantity, first-party seller, and unit-price cap, and any mismatch stops for your manual review
- Missions that were out of stock during the pass keep watching and simply form the next combined order when they restock; switching the setting off returns every mission to individual checkout
- New: missions without an attached affiliate link now show a warning icon in front of the store name

## 3.6.22
- Fixed: on Target's redesigned cart, the mission clicked "Update shipping location" (mistaking it for the Shipping method toggle) instead of Check out, opening the location widget in a loop
- Controls whose own label names a location or address are now never treated as a delivery-method toggle — store, zip, and location choices remain strictly yours
- A cart that shows no readable Shipping/Pickup toggle no longer stalls the mission: checkout proceeds, and the final review still strictly verifies your mission's fulfillment mode and locked destination before any order is placed

## 3.6.21
- Fixed: the one-time checkout preflight lock could not be approved on Target's redesigned review page — it stopped with "did not prove an eligible first-party offer" because the new page shows no per-item price or seller
- The lock now verifies the unit price from the order summary's own item count and subtotal (exact-cents arithmetic only) and first-party status the same way the product page does; a unit price over your cap still refuses to lock

## 3.6.20
- Fixed: auto-buy stopped at Target's final review with "did not prove the required shipping fulfillment mode" — Target's redesigned checkout shows shipping, payment, items, and totals as plain text with no product ID anywhere, which the old verifier could not read
- The final review is now verified on the new page: shipping address section, payment card on file, order total, the single item card with its quantity badge, and the order summary's own item count all have to agree with what was verified in the cart minutes earlier — any mismatch still stops for your manual review
- After updating, re-approve the checkout preflight once (Autopilot off, open a final review, lock it) — the saved profile from the old page no longer matches

## 3.6.19
- Fixed: a brief sign-in or verification flash during the cart-to-checkout handoff no longer raises a false "requires a manual sign-in" alarm — the block now only posts when the prompt is still there moments later
- Checkout no longer goes silent: if the mission is waiting for the store lane or the Place Order button never appears, the mission status now says so while it keeps rechecking
- The "checkout reached" notification now says what actually happens next for your mission — automatic submission, your manual submit, or cart-only
- When the final review stops on fulfillment or checkout-evidence checks, the mission status now lists exactly which pieces the page did and did not prove (fulfillment mode, destination, payment, substitutions, cart lines, total)
## 3.6.18
- Fixed: background stock checks were silently failing to read every product page since 3.6.17, so Autopilot took minutes to open each Target/Walmart mission in Chrome instead of seconds
- Tabless missions now read the public page correctly again: readable pages report stock quietly, and pages that hide stock data (like Target's) open their Chrome watcher on the first check

## 3.6.17
- Background stock checks now send the complete set of headers a real desktop Chrome sends when opening a page (client hints, fetch metadata, language, and compression), instead of a year-old browser signature with none of them
- This lowers the chance of Walmart rate-limiting or blocking quiet monitoring during busy drops
- One version constant now keeps the browser signature's parts in lockstep so they can never disagree

## 3.6.16
- Fixed: the "complete cart inventory could not be verified" stop was still happening on real Target carts — the cart's Remove button sits inside several layers of styling wrappers and the double-check was reading the wrong layer
- The double-check now walks up to the actual item row before counting, so a verified single-item cart proceeds to checkout and your approved payment profile
- If this check ever stops again, the alert now includes exact counts so the cause is visible immediately

## 3.6.15
- Fixed: auto-checkout could give up at the final review while the order summary was still updating (for example right after free shipping applied to the new quantity)
- The final review now waits and rechecks for about 15 seconds while totals, shipping, or delivery details settle before it ever stops for manual review
- Real mismatches with your approved checkout profile still stop immediately

## 3.6.14
- Fixed: auto-checkout could stop with "the complete cart inventory could not be verified" even though the right item was confirmed in the cart
- Cart Confirm now recognizes Target's current cart Remove button when double-checking that your cart holds only the mission's item
- An unexpected extra cart line still stops checkout for your manual review, as before
- Fixed: a cart with quantity 2 or more could stop with "unit price is above the cap" after sitting a few minutes, because the line shows the combined total; the verified per-item price is now used no matter how long the cart waited

## 3.6.13
- Fixed: a mission could stop at the cart with "failed the first-party seller or unit-price safety check" even when the product page had already verified the seller and price
- The cart check now reuses the recent product-page verification for seller and unit price, the same way checkout already does
- Cart safety alerts now say exactly what failed (seller, third-party, price cap, or unreadable price)

## 3.6.12
- Fixed: a mission could get stuck at the cart with "requires a manual store or location choice" even though its delivery method was already set
- Cart Confirm now selects your mission's configured method (Shipping or Pickup) when the store asks, instead of stopping
- Choosing a store, entering a zip code, or sharing your location is still always left to you — and same-day delivery services like Shipt are never selected

## 3.6.11
- Auto-buy now checks every order against the shipping address and payment cards you approved during a checkout preflight, even for items you never preflighted
- Approve once per store: lock one checkout preflight and every auto-buy mission for that store inherits the approved address and payment profile
- If a store shows a different address or payment set at the last second, the order is stopped and you get an alert instead

## 3.6.10
- Fixed: after an item was secured, its cart alarm kept repeating and blocked other products from being checked and added
- A finished mission's cart tab now goes quiet so the rest of the list keeps working

## 3.6.9
- Fixed: after one item was secured in the cart, the next restocked item could stay stuck at "Waiting" and never get added

## 3.6.8
- The Update button now shows short, plain-language bullet points about what changed
- No more wall of technical text when deciding whether to update

## 3.6.7
- Checked tabs now stay in place instead of switching back and forth
- The Chrome window never pops on top of your other work — purchases flash the taskbar and sound the alarm instead

## 3.6.6
- Fixed: after "Stop everything", missions would not reopen until Autopilot was toggled twice
- Fixed: when two products restocked back to back, the second one was never added to cart

## 3.6.5
- Fixed: the buy list sometimes opened only the first product after an app update

## 3.6.4
- Background tabs check stock much faster
- Tabs briefly come forward to verify stock after each refresh

## 3.6.3
- Fixed: missions left in background tabs missed restocks until you clicked the tab

## 3.6.2
- Added a "Check for updates" button that is always visible in the top bar

## 3.6.1
- Quick add now attaches your affiliate link to a product already on the list

## 3.6.0
- Missions can hold an affiliate link and use it everywhere, so purchases carry your affiliate credit
- Pasting a full affiliate link fills both the product link and the affiliate link automatically
- Quick add captures your affiliate link from the open page

## 3.5.9
- If the store allows fewer than the quantity you wanted, the item is still secured and the alert tells you exactly how many

## 3.5.8
- Fixed: another product's page could load over your ready cart
- You are now alerted the moment the cart page opens, before quantity checks finish
