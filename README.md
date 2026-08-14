# Cart Confirm Desktop

Cart Confirm is a local Windows desktop app and unpacked Chrome companion for a multi-product buy list on Target, Walmart, and Amazon. Every enabled product has its own store, SKU, maximum unit price, maximum final order total, quantity, and success action. An optional official Discord bot connection can ingest restock alerts into a local Desired/New signal inbox.

The companion uses the normal signed-in store pages. It can keep checking an unavailable item, add an eligible offer to the cart, set the configured quantity, and proceed to a capped final review. **Stop at final review** is recommended. **Submit order automatically** is an advanced opt-in that additionally requires an explicit shipping/pickup mode and can select the final order control.

## Safety rules

These rules are enforced in code and cannot be disabled from the UI:

- The URL and exact store identifier must match: Target TCIN, Walmart item ID, or Amazon ASIN.
- The page must expose a readable unit price at or below the product's cap.
- The seller must be verifiably first-party: Target, Walmart, or Amazon directly. Marketplace, fulfilled-only, and missing-seller offers are blocked. Because Target labels marketplace (Target Plus) offers explicitly and shows no seller text for items it sells itself, an unlabeled Target offer is treated as first-party only when no marketplace marker appears anywhere on the page; any marker fails closed. Walmart and Amazon always require an explicit first-party label.
- The requested cart quantity must be confirmed after any quantity change settles.
- Current cart seller and price evidence must be readable; product-page evidence cannot make an ambiguous cart safe.
- Before checkout, the companion must completely enumerate exactly one cart line, independently reconcile remove controls, and prove that it is the configured SKU. Unknown, duplicate, and extra lines block submission.
- Checkout requires fresh cart-confirmed proof and a readable final order total at or below that row's positive final-total cap. Auto-submit additionally requires a recent operator-approved visible final-review snapshot whose keyed HMAC fingerprints bind the exact destination or pickup store, complete selected payment-instrument set, substitution state, single cart line, quantity, SKU, fulfillment, and total. The readable address/payment labels never leave transient content-script memory and are never persisted.
- Each product is processed by exactly one tab — duplicate tabs cannot claim the same product — and **Add to cart only** items run in parallel across their own tabs. Every add gets a durable receipt before the click. Walmart and Amazon remain single-flight. A calendar-fired Target mission gets a bounded persistence burst (20 seconds per stage and 750 ms between persistence actions by default): an explicit Target error dialog may be dismissed and retried, and a fully loaded cart that proves the exact TCIN absent may reopen Add; an ambiguous response goes to exact-cart verification instead of blindly adding again. Unscheduled Target watchers never enter that rapid lane. Final-review and auto-submit workflows remain exclusive per store: only one purchase flow per store at a time.
- A confirmed product is marked complete for the current automation run and cannot be purchased twice. Disarming and re-arming intentionally starts a new run.
- Proof, attempts, completion, and submit intent live in extension-owned storage. An uncertain final click holds its run lock until a retailer-specific confirmation or explicit failure appears. The popup offers an operator-only **I checked: no order exists** release after Autopilot is fully off and the operator has inspected the retailer cart and order history; Cart Confirm never infers that outcome.
- Final auto-submit re-reads the complete evidence immediately before clicking, requires the configured shipping/pickup mode, and blocks selected subscriptions, protection plans, tips, donations, gift wrap, and installment choices.
- Every desktop launch starts fully **STOPPED**: Autopilot is disarmed, browser scans and retries are paused, background checks and schedules cannot fire, and Discord is not polled. Editing purchase settings while armed is rejected.
- A mission with **Open at** remains calendar-owned until the desktop records its firing boundary. Arming Autopilot, an already-open tab, quiet stock checks, Discord signals, and queue fan-out cannot scan, refresh, or act on it early. The desktop durably assigns its blitz execution context before clearing that gate. A missed time remains locked until you clear or reschedule it, so it cannot silently run late.
- Discord messages are untrusted hints, never purchase proof. Signals match missions only by normalized `retailer:SKU`; their price, seller, stock, offer ID, and action links are re-validated before use, and the signed-in browser remains authoritative.
- Catalog listing prices and AI research are also untrusted hints. Only an operator-approved, retailer-specific MSRP or a positive page price deliberately captured by Quick add can seed a cap. Cited research is never applied to MSRP or existing missions automatically.
- Only official Discord bot tokens are accepted. The token is stored separately through Electron's operating-system encryption; plaintext and Linux `basic_text` fallbacks are refused. Discord user tokens and self-bots are not supported.
- A first Discord connection imports recent messages as history without opening pages. Later signals must be under two minutes old to auto-open. **Stop everything** pauses Discord polling as well as automatic openings, so nothing new is ingested until an explicit Arm, Test, or Open action resumes monitoring.
- CAPTCHAs, queues, sign-in/MFA prompts, location choices, membership/invitation gates, and security challenges are never bypassed. When Walmart places one mission on an official `/qp` queue or an unmistakable product-route waiting room, Cart Confirm makes one exactly-once simultaneous pass through the other enabled Walmart missions so they can enter through their normal product pages too. A tab already in queue is frozen: ticket endpoints and signatures are never stored, called, replayed, or refreshed. Unknown high-demand pages freeze for manual review.
- Unscheduled missions are continuous watchers: they check at a 60-second cadence by default and remain armed until **Stop everything**, disarm, completion, or a fail-closed safety condition. Calendar-fired missions use the separate rapid pre-eligibility lane (two seconds by default).
- All desktop and extension store actions, including watcher checks and blitz refreshes, share a fixed 120-action rolling-hour budget. Watchers have no wall-clock or per-product attempt expiry; if the rolling budget is temporarily full, they wait and resume when capacity returns.
- Tool-controlled navigations are serialized per store. HTTP `429`, `502`, `503`, `504`, and `520`–`524` responses open an escalating store-specific cooldown circuit, and a bounded `Retry-After` header is honored.

Start with **Add to cart only** until you have verified the current store selectors and your account setup. Store markup changes regularly, so live checkout behavior cannot be guaranteed by the source tests alone.

## Features

- A dense mission-control layout: each product is a mission card showing its compact price/quantity, action, live status, and last-checked age in one row, with exact caps retained in tooltips and accessibility text. Use drag-and-drop or the accessible up/down arrows to reorder missions. Search and filter by named group, retailer, or Active/Inactive state; group headers can collapse, rename, or turn every member On/Off, and group assignment is available in both the mission editor and bulk controls.
- A top-level **Check for updates** control for packaged 64-bit Windows builds. It checks only this repository's GitHub releases, asks before downloading, requires the exact versioned Setup asset and `SHA256SUMS.txt`, verifies the download's size and SHA-256, pauses automation, installs, and relaunches. Intentionally unsigned prereleases retain their Windows Unknown publisher / SmartScreen warning.
- Up to 50 unique products across Target, Walmart, and Amazon, each with an optional display name.
- A centralized **Item defaults** panel with reusable item profiles, per-store MSRP by stable product type, and mission bulk update. New installs default to quantity 1, shipping, standard alert, and **Watch & alert only**. Existing saved default selections are preserved, and the legacy shipping auto-buy profile remains available only as an explicit choice. New items without a positive approved cap remain Off.
- Starter Pokémon MSRP rows for ETB, blister pack, single booster pack, SPC, and UPC. Their store prices intentionally begin blank: Cart Confirm does not ship guessed prices. Approve each stable category once for Target, Walmart, and Amazon instead of typing a price on every mission.
- Optional monthly MSRP research through the OpenAI Responses API `web_search` tool. The API key is encrypted by the operating system and automatic 30-day research is a separate opt-in. Results retain visible, clickable citations and remain suggestions until **Accept MSRP** is selected. See the [official OpenAI web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search).
- A Chrome-toolbar **Quick add** popup that reads the exact TCIN / Walmart item ID / ASIN, retailer title, and current price from the open product page. The positive observed price becomes the cap; the default item profile fills quantity, shipping, action, alert, and final-total allowance. Existing duplicates are never changed, and a missing/non-positive price is refused.
- A desktop **Bulk import** dialog for pasted Target, Walmart, and Amazon product URLs. It extracts and normalizes item IDs, strips tracking parameters, skips duplicates, and applies the default item profile. An approved title/store MSRP match can make the mission ready; an unknown price stays Off at a $0 cap.
- A user-triggered **Catalog Inbox** for keyword discovery. It opens one official Target, Walmart, or Amazon search page per selected retailer and catalogs up to 20 visible result cards from each page with exact item ID, title, canonical URL, displayed listing price, retailer, and observation time. Optional include/exclude-word and maximum displayed-price filters run locally; selected results use the chosen item profile and approved MSRP rather than trusting displayed listing prices.
- Plain-language speed and traffic settings with **Recommended**, **Low traffic**, and **Scheduled drop** setups, plus up to 12 named custom setups saved locally. A setup stores only timing, traffic, and fast-load values—never missions, caps, quantities, actions, credentials, or Autopilot state.
- Per-product maximum unit price, maximum final order total, quantity, fulfillment mode, enabled state, and a mission action: **Watch & alert only** (monitors and alerts at or under your cap without ever clicking), add-only, final-review, or auto-submit. Rarely used fields live behind each row's **Advanced** section.
- Per-product alert loudness: standard ping, **loud alarm** (repeating audible alert with an on-screen Silence bar, throttled to once per five minutes per item), or silent log only.
- A worst-case exposure line in step 4: the total if every enabled item hits its cap — automation can never exceed the caps you set.
- Click any live-status row to filter the event log to that item's timeline.
- A **Test all (no buying)** button in the header that opens every enabled mission without a calendar time through the paced per-store queue while Autopilot is off, so the companion can report price, seller, and stock without touching the cart. Scheduled missions remain closed until their exact time.
- Background-first stock checks for unscheduled Target and Walmart missions (read-only page fetches, rotated per store within the traffic budget). Arming Autopilot does not open those product tabs; Chrome opens only after a likely stock signal. Amazon remains tab-based.
- Per-product scheduled openings for known drop times: give any item an **Open at** date/time, save, and arm in advance. Until that exact boundary, even an already-open product/cart tab stays idle and reports that it is waiting for calendar release. At that moment its durable execution mode becomes **calendar blitz**, then its page opens in Chrome and the armed companion takes over. Walmart missions due together launch simultaneously in dedicated tabs (or immediately reuse their exact mission tabs); other same-store drops retain the bounded drop lane. Step 4 shows a seven-day calendar strip with a live countdown; a time missed by more than two minutes stays locked for manual clearing/rescheduling instead of running late, and an old single global schedule migrates onto its store's enabled products automatically.
- Official-queue fan-out for simultaneous Walmart drops: the first enabled mission that reports a live `/qp` queue or a conservatively recognized Walmart waiting room causes every other enabled, not-yet-queued Walmart mission to navigate once at the same time. For calendar-fired Walmart blitz missions, that first nonsold-out queue report also freezes the winner and immediately signals every other Walmart tab. Each nonqueued blitz tab is allowed to settle for two seconds; final queue-capture reloads default to **0** (disabled) and can be explicitly configured from 0–20. A tab freezes immediately if a queue appears and stops permanently at the configured cap. A durable per-run receipt prevents a second burst, Stop cancels pending pages, and every navigation still consumes the shared traffic budget.
- Official Discord bot ingestion with a local Desired/New signal inbox, stable store+SKU matching, encrypted credentials, silent history import, and per-mission auto-open controls. Fresh same-store signals enter the one-second drop lane while different retailers proceed independently.
- Admin/backend-provisioned Howl campaign links. The normal mission editor never asks for or resolves a Howl URL. A trusted admin workflow can resolve a generated link for an exact mission, after which the operator can copy only its validated retailer-domain sharing URL from the mission or a matching Discord signal. Campaign links remain sharing-only and never enter the purchasing configuration sent to Chrome.
- Sanitized direct signal entries for Amazon Add to Cart / Buy Now and Walmart Buy Now. Amazon requires a fresh under-cap price, `Amazon.com` seller, exact ASIN and whitelisted offer parameters. Walmart constructs only `https://www.walmart.com/affil/cart/buynow?items=<exact item ID>` from the normalized signal SKU (or reduces a supplied button to that form). Tracking parameters are stripped, durable tab context follows redirects, and missing browser context falls back to the canonical product page.
- Manual **Open all due** action for enabled, unscheduled missions across all stores, with each store's pages queued independently. When the companion is connected, an existing Chrome tab for that store is navigated instead of opening a new window, and identical pending opens are deduplicated.
- Configurable continuous-watcher interval from 30 to 3,600 seconds (60 seconds by default).
- Configurable blitz retry interval from 5 to 3,600 seconds and pre-eligibility refresh spacing from 2 to 60 seconds, with jitter/backoff on ordinary blitz errors.
- Configurable Target blitz action delay from 250 to 5,000 ms and per-stage persistence window from 5 to 120 seconds. Fixed per-stage action counts and the rolling store budget remain hard limits.
- Configurable per-store navigation spacing from 10 to 3,600 seconds and overload cooldown from 60 to 86,400 seconds.
- Automatic recovery when an item becomes unavailable in the cart or during checkout.
- Optional fast-load mode that blocks images, fonts, and media while preserving HTML, CSS, JavaScript, authentication, and store controls.
- Per-product offer, seller, unit price, observed final total, cart, checkout, attempt, and confirmation status.
- Windows desktop notifications and a bounded persistent local safety ledger.
- Legacy migration from the original single-product Target settings.

## Background stock checks vs. browser-only purchasing

Arming Autopilot starts unscheduled Target and Walmart watcher missions **background-first**. With no live product tab, the desktop fetches the public product page (no cookies, no sign-in, no cart actions), reads embedded schema.org availability and price as a stock hint, and rotates round-robin through each store's missions at the configured watcher cadence inside the 120-action hourly budget. Calendar-owned and fired-blitz missions are excluded. Chrome can remain closed while these watchers wait. When one sees likely availability, it opens the canonical product page in Chrome; the authenticated in-tab pipeline remains authoritative and re-validates the exact SKU, first-party seller, price cap, quantity, complete cart scope, fulfillment, and final order total before acting. It never jumps directly to checkout. A **Stop at final review** mission remains on Target's checkout-review page for the operator. A successful **Submit order automatically** mission remains on Target's confirmation/receipt page after Target confirms the order. No receipt redirect is synthesized. If a store blocks or obscures the plain fetches, quiet checks for that store shut off after a few failures and the app tells you to keep a tab open instead. Amazon is tab-only. **Stop everything** is a hard cancellation boundary: it aborts active quiet HTTP checks, wakes and cancels store-opening waits, drops late non-health tab events, clears retry timers as the tabs receive the stopped configuration, pauses Discord and schedules, and disables Fast Mode. Only a connection heartbeat remains. Arm, Test all, Open, or Open all explicitly resumes monitoring.

Purchasing, by contrast, is browser-only, and deliberately so: authenticated carts and checkout flows depend on browser JavaScript, cookies, CSRF protections, inventory checks, and store security controls. Replaying private requests or treating checkout as a plain HTML form would be fragile and could submit stale or unsafe data.

Fast-load mode keeps the authenticated browser workflow but removes nonessential image, font, and media downloads. If a security challenge appears, resource blocking is paused for ten minutes so the challenge can be completed manually. The blocking rule is removed whenever the desktop companion is unavailable or fails its version/pairing checks.

## Windows quick start

1. Extract this project to a permanent folder.
2. Double-click `RUN-ON-WINDOWS.cmd`.
3. On first launch, the script installs Electron and starts the app.
4. Select **Show companion folder** in Cart Confirm.
5. Open `chrome://extensions` in Chrome.
6. Turn on **Developer mode**.
7. Select **Load unpacked** and choose the shown `extension` folder.
8. If an older companion is already loaded, select **Reload** on its extension card and approve the expanded first-party subdomain permission used for overload detection.
9. Sign in normally to every store you plan to use and verify saved delivery, payment, and store preferences.

When launching from PowerShell instead of double-clicking, include the current-directory prefix:

```powershell
.\RUN-ON-WINDOWS.cmd
```

To update an existing Git checkout, close Cart Confirm first, then run:

```powershell
git pull --ff-only
npm ci --no-fund
.\RUN-ON-WINDOWS.cmd
```

If Chrome still shows `UPD` after the app restarts, reload the unpacked extension once from `chrome://extensions`.

Packaged Windows installs can instead select **Check for updates** at the top of the app. Cart Confirm never installs silently from a background check: it shows the available version and asks first. After approval, it verifies the official GitHub release checksum, pauses automation, installs, and relaunches. Source-checkout development runs continue to use the Git commands above.

The extension badge reads `STOP` when monitoring is paused, `IDLE` when monitoring is active but Autopilot is disarmed, and `ARM` when Autopilot is armed. Keep the desktop app open while running the buy list.

## Configure a buy list

Click **+ New mission**, then:

1. Paste the product page URL. The store, the TCIN / Walmart item ID / ASIN, and a mission name are detected automatically (the ID is visible under **Advanced**; edit the name freely).
2. Cart Confirm applies the selected item profile and any matching approved store MSRP. New installs default to quantity 1, **Shipping / delivery**, and **Watch & alert only**; an existing saved default remains unchanged. If no approved MSRP matches, the mission remains Off; enter one manual cap or approve the product type in **Item defaults**.
3. The profile calculates the maximum final order total from `unit cap × quantity + allowance`. You can still choose **Watch & alert only**, **Add to cart only**, **Prepare checkout, I submit**, or a different fulfillment mode for this mission.
4. For auto-submit, a positive unit cap, sufficient positive final-total cap, explicit shipping/pickup requirement, and an approved checkout preflight are mandatory. With Autopilot off, open the mission's visible final-review page and approve its hashed evidence from the companion popup. Any mission, destination/store, payment-set, substitutions, cart, quantity, or total change disarms that approval.
5. Optionally choose a named mission group, set **Open at** for a known drop time, pick an alert loudness, and choose how a matched Discord signal enters the store under **Advanced**. The product page is the recommended default. Direct Buy Now entries are available only for checkout-review or auto-submit missions; Amazon Add to Cart is available for cart or checkout missions.
6. Click **Done** — the mission saves immediately. Starting an edit while Autopilot is on pauses it first and offers to resume after saving.

### Quick add from Chrome

With the desktop app connected and Autopilot off, open a supported retailer product page and select the Cart Confirm toolbar icon. The popup previews the detected store, exact item ID, retailer title, current page price, availability, and visible seller. Select **Add with default profile** to append it to Missions. The observed positive price becomes its unit cap and the current default item profile supplies the remaining fields. On a new install, that means shipping + watch-only. Autopilot is still Off and must be armed separately; all purchase evidence is re-validated in the browser.

Quick add does not overwrite an existing mission or its cap. It also stays disabled if the page has not exposed a finite positive price, if the desktop app is unavailable, or while Autopilot is armed. Refresh the retailer page or the popup after dynamic page content finishes loading. Use the top-right ×, the smaller × beside **Add with default profile**, Escape, or click anywhere outside the popup to close it without adding.

### Bulk import product URLs

In the desktop app, select **Bulk import**, paste supported Target, Walmart, or Amazon product links, and select **Import URLs**. Links can be on separate lines or separated by spaces. Cart Confirm detects each TCIN / Walmart item ID / ASIN, converts it to a clean canonical product URL, removes duplicates already in Missions or in the pasted list, and reports invalid or over-capacity entries.

Bulk import does not contact retailer pages or trust a visible listing price. It applies the default item profile and matches the URL-derived title against the approved store MSRP table. Matching rows receive that approved cap; unknown rows remain Off with a $0 cap. Importing temporarily pauses Autopilot and offers to resume it afterward.

### Keyword Catalog Inbox

With Autopilot off, enter a keyword in **Catalog Inbox**, select Target, Walmart, Amazon, or any combination, and choose **Search / refresh**. Cart Confirm opens exactly one normal official search-results page for each selected retailer. The Chrome companion reads only result cards currently rendered in those pages; it does not call private retailer APIs, register developer credentials, batch hidden queries, scroll pages, paginate, or run a continuous crawler. A search accepts matching captures for ten minutes and records at most 20 results per retailer.

You can optionally require words in the title, exclude words, or set a maximum displayed listing price. Results show the exact TCIN / Walmart item ID / ASIN, canonical product URL, retailer title, displayed price when readable, and observation time. The inbox is saved locally in `catalog.json`. Starting another search replaces the prior inbox; **Clear** removes it and stops accepting captures for that search.

Listing prices are informational discovery data, not purchase proof or a price cap. Choose an item profile, select results individually or with **Select all** / **Select none**, and choose **Add selected to Missions**. Duplicates are skipped and the 50-mission capacity is enforced. Each result receives the selected profile and an approved retailer MSRP only when its title matches; unknown prices remain Off.

For a known future Walmart drop, choose exact Walmart results, an item profile, and **Known Walmart drop time**, then select **Monitor selected for Walmart prep**. Only candidates with an approved Walmart MSRP are accepted. Autopilot rotates through one candidate at a time, at least 30 seconds between checks, and requests only each canonical public product page. It reuses `ETag` and `Last-Modified` cache validators when Walmart provides them; it does not call inventory, checkout, ticket, signature, or other private endpoints.

The first successful observation establishes a baseline. A later `200` to `404`/`503` transition, recovery to `200`, embedded availability or price change, or redirect to Walmart's `/qp` page moves that exact preauthorized candidate into Missions. An unchanged/`304` response, timeout, or network failure does not. The mission retains its approved profile, price cap, and future drop time, so no browser purchase action is released before its calendar boundary. **Stop everything** aborts an in-flight check and clears pending candidates and their observations. These prep checks share the fixed 120-action rolling-hour Walmart budget; overload cooldowns and the normal Stop boundary still apply.

### MSRP and item profiles

Open **Item defaults** to maintain the centralized price and workflow setup:

1. Enter the approved Target, Walmart, and Amazon price once for each stable product type. Edit title match terms when needed. Blank prices are never used as caps.
2. Create or update named item profiles for quantity, action, fulfillment, alert, enabled preference, and the allowance added to the capped subtotal. Choose the default used by Quick add, URL import, new missions, and Catalog Inbox.
3. Use **Select and use missions** to select individual rows, **Select all**, or **Select none**. **Copy selected list** writes each title, expected unit price, and product URL to the clipboard with a blank line between items. You can also apply one profile and the current approved MSRP table. Existing missions are not changed merely because an MSRP record or profile changes.
4. Optionally save an OpenAI API key. Cart Confirm refuses plaintext credential storage. Manual or opt-in 30-day research produces cited suggestions; open the source and select **Accept MSRP** to approve one store price. Accepting a suggestion still does not rewrite existing mission caps—use the bulk action when ready.

Store prices can differ, so each MSRP row has separate Target, Walmart, and Amazon values and evidence. A manually edited price is labeled operator-approved. A cited source remains attached only while its accepted value is unchanged.

### Speed and traffic setups

Open **Speed and traffic settings (optional)** and leave **Recommended** selected if you do not want to tune individual numbers. **Low traffic** checks less often and rests longer after overloads. **Scheduled drop** keeps ordinary watchers paced but uses the bounded faster settings after a mission's calendar release. Select **Use this setup** while Autopilot is off to apply one.

To save your own setup, adjust the numbers, enter a name under **Your setup name**, and select **Save current numbers**. Selecting one of your saved setups lets you update or delete it. Up to 12 custom setups persist in the app's local settings. Applying, saving, or deleting a setup never changes the mission list, product IDs, price caps, quantities, fulfillment, actions, schedules, Discord configuration, or Autopilot state. Fixed action-count and rolling traffic limits are not profile settings and cannot be bypassed by a profile.

To schedule an item for a known drop, set its **Open at** field to a future local date/time and save. Each product schedules independently. A firing receipt and the product's blitz context are persisted before the page opens, and only that firing boundary clears the time and releases Chrome automation. A time missed by more than two minutes remains calendar-owned until you clear or replace it, preventing a late purchase. Walmart missions due together launch in parallel; before any queue is seen they use the configured scheduled stock-refresh lane. After the first queue event, only the configured bounded queue-capture reloads apply. Other retailers use the bounded drop lane. Ordinary watcher retries are unchanged. **Stop everything** clears all scheduled times and active blitz contexts.

## Admin/backend Howl campaign provisioning

This is not an end-user workflow. There is no Howl field or Resolve control in the mission editor, and the renderer preload exposes no resolution method. Normal settings saves strip attempted campaign changes and preserve only values already owned by the backend.

A trusted backend or automated campaign workflow can call `provisionHowlCampaign` from `lib/admin-campaigns.js` with the existing normalized mission and a generated `howl.me`, `howl.link`, or `shop-links.co` URL:

```js
const { provisionHowlCampaign } = require("./lib/admin-campaigns");
const provisionedMission = await provisionHowlCampaign(existingMission, generatedHowlUrl);
```

That backend call deliberately performs the GET redirect chain that can register the Howl click. It follows only credential-free HTTPS redirects through public network addresses, stops before requesting the exact-SKU retailer page, and returns a normalized mission containing the source and resolved fields for the admin-owned persistence layer. Calling it again can register another click. `clearHowlCampaign` removes a provisioned campaign. Cart Confirm does not sign in to Howl or create campaigns; a workflow that generates links through a Howl account or API must supply the generated URL to this backend function.

The Howl source and resolution metadata stay out of the renderer and Chrome extension. Once provisioned, the renderer receives only the validated customer-facing `target.com`, `walmart.com`, or `amazon.com` URL, so **Copy share link** and **Copy campaign link** can provide it with tracking parameters such as `nrtv_cid`, `clkid`, and `TCID` intact. Monitoring, product opening, cart work, checkout, and auto-submit continue using the clean canonical mission URL. Cart Confirm copies links to the clipboard but does not post them to Discord or any other service.

## Connect Discord restock signals

1. In the Discord Developer Portal, create an application and bot. Enable Message Content access for the bot. Never paste a Discord account/user token into Cart Confirm.
2. Invite the bot to the server with only the permissions it needs: **View Channel** and **Read Message History** for the signal channel. It does not need to send messages or manage anything.
3. In Discord, enable Developer Mode, right-click the restock channel, and copy its channel ID.
4. In **Discord restock signals**, paste the official bot token and channel ID, then select **Connect & import**. The latest 50 messages are classified as history and cannot open a store page.
5. Inbox cards say **Desired** when `retailer:SKU` already exists in Missions and **New** otherwise. **+ Add as desired** prefills the default shipping/auto-buy profile but keeps the new mission Off for deliberate review before saving.
6. Turn on **Automatically open fresh desired signals**, enable the intended mission's signal control, and arm Autopilot. A live matched signal under two minutes old opens the configured entry unless that mission has an **Open at** time; calendar-owned matches are recorded but never opened early. Multiple same-store signals are serialized one second apart; Target, Walmart, and Amazon lanes run independently.

The signal card's **Product** button is always the safest manual entry. Direct buttons are enabled only for a desired, enabled, under-cap mission while Autopilot is on and the signal is fresh. Every direct link is reduced to a strict allowlist, bound to the exact mission in extension-owned session storage before navigation, and rechecked in the normal cart/checkout pipeline. If that association cannot be established, Cart Confirm opens the canonical product page instead.

## Recommended workflow

1. With Autopilot off, create the complete mission list.
2. Empty unrelated items from any store cart that will use checkout mode.
3. Use **Test all (no buying)** once to open every enabled mission without a calendar time through the paced queue, and confirm on each row that the page, price, and seller are recognized. Nothing is added while Autopilot is off; scheduled missions wait for their configured time.
4. Use add-only mode for an initial low-risk test.
5. Review every quantity, unit cap, final-total cap, and action again — the worst-case line shows your total exposure.
6. Switch **Autopilot** on. Unscheduled Target and Walmart missions begin quiet background checks without opening product tabs; Chrome opens after a likely stock signal so the authenticated browser can validate and run the configured action. Amazon opens immediately because it is tab-only. Scheduled missions stay closed and open exactly at their configured time. The app always restarts fully stopped and never resumes a saved run without this explicit action.
7. Complete sign-in or security prompts manually if a store presents them. A pre-submit blocker releases that store lane so another mission can continue; a possibly submitted order deliberately remains locked for manual review.
8. Watch the mission rows and the activity feed (click a row to filter it). Repeated identical page, availability, and offer observations are collapsed so action transitions remain visible. **Stop everything** is always available.

When an item is out of stock, the companion reserves a per-store navigation slot after the configured minimum delay. If it becomes unavailable in the cart or checkout, the companion returns to the product and resumes. Safety failures such as a third-party seller, unreadable price or total, quantity mismatch, incomplete cart enumeration, or an extra cart item stop that mission and release its pre-submit store lane so the next mission can proceed. An uncertain order submission remains locked and always requires manual review.

Before switching any product to **Submit order automatically**, work through
[`VALIDATION-CHECKLIST.md`](VALIDATION-CHECKLIST.md). Cart Confirm verifies SKU
identity, first-party seller, price/total caps, cart completeness, and
fulfillment, and total. Auto-submit also binds the visible selected destination
or pickup-store label, complete payment-instrument set, and substitution state
to installation-local keyed fingerprints. It never chooses those values or
persists readable labels, so they still need a human pass on the real page.

## Traffic overload behavior

The desktop opening queue and extension share the same safety goal: enter known drops promptly without turning normal monitoring into an unbounded reload storm. Manual and test openings use a fixed three-second stagger per store. Scheduled Walmart drops and their one exactly-once official-queue fan-out launch all applicable mission pages together, one initial page load per mission; ordinary automatic retries remain paced. Before a queue appears, each calendar-fired Walmart tab reloads only at the configured rapid lane and remains bounded by Stop, overload handling, the blitz window, and the fixed 120-action rolling-hour budget. Once a tab reports that it is queued, Cart Confirm stops refreshing it. Other participating tabs get only the configured final queue-capture reloads (zero by default, configurable from 0–20) and then stop. Unscheduled missions use the configurable watcher interval (60 seconds by default) until explicitly stopped. Calendar-fired blitz tabs use the configurable pre-eligibility lane (two seconds per store by default); an eligible mission immediately leaves that stock-refresh lane. A product's fresh reservation replaces its own stale one so no product can starve the others, and main-frame navigations are observed so a retry cannot immediately follow a newly opened page. Identical retry notices collapse in Activity while each mission's last-checked time continues updating. Every opening and retry still consumes the same fixed 120-action rolling-hour budget; a watcher delayed by that budget resumes when capacity returns.

Responses with status `429`, `502`, `503`, `504`, or `520`–`524` normally pause automatic navigation and store mutations for that retailer and propagate the same deadline back to pending openings. Main-frame failures always count; XHR failures count only in the bounded window after Cart Confirm authorized a store action, so unrelated retailer background polling cannot keep extending the cooldown. Multiple commerce XHR failures from one action are coalesced into one overload incident. Separate overload incidents exponentially increase the cooldown, decay after six quiet hours, and remain capped at 24 hours. Recognizable overload pages are reported as `traffic-overload` instead of being treated as out of stock, and unchanged cooldown notices collapse in Activity.

Calendar-fired Target purchase stages have one narrow exception for high-demand cart failures. During a durable, configurable per-stage burst (20 seconds by default), exact allowlisted Target Add, quantity, cart, checkout, and explicitly rejected final-submit actions may proceed through the overload deadline at a configurable cadence (750 ms by default). The burst caps each stage (16 Add, 12 quantity, 10 cart, 8 checkout, and 3 final-submit actions), still charges every action to the fixed 120/hour store budget, and stops immediately when the exact TCIN and configured quantity are verified. Unscheduled watcher missions use single actions at the watcher cadence and cannot reserve this overload bypass. An ambiguous final submission is never repeated; Target must explicitly state that the order was not placed before another fully revalidated submit.

The persistent rolling budget counts Cart Confirm's desktop page openings, automatic navigations, quantity changes, add-to-cart actions, cart transitions, checkout actions, and final submission attempts. It does not pretend to count every script/resource request made by a retailer page or traffic generated by other software.

This reduces traffic generated by Cart Confirm; it cannot prevent or measure traffic from other browser profiles, devices, users, extensions, or store-side demand. It also cannot make an already overloaded retailer available. The safe response is to wait, and the circuit does that.

## Build an installer on Windows

Run:

```bat
BUILD-WINDOWS.cmd
```

The separately named NSIS installer, portable executable, and `SHA256SUMS.txt` are written to `dist\`. CI artifacts are intentionally unsigned. A manually authorized unsigned GitHub prerelease may publish those files with a prominent **Unknown publisher** warning; stable releases still require a GitHub-verified signed tag matching `package.json`, plus `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets. Both release workflows verify checksums and enforce their expected Authenticode state before publishing. See [`RELEASE.md`](RELEASE.md) for both release checklists.

## Verify the source

```bat
VERIFY.cmd
```

Or:

```powershell
npm run verify
```

Verification performs a syntax check and runs the Node test suite, including bounded visible-card catalog parsing, profile/MSRP imports, citation-bound research suggestions, encrypted credential refusal paths, Discord parsing/history/live routing, strict Amazon/Walmart direct-link sanitization, admin-owned Howl provisioning, safe redirect resolution and exact-SKU isolation, durable tab context, queue URL reduction, exactly-once schedule receipts, durable watcher/blitz execution context, continuous watcher state, bounded Target persistence, durable submission transitions, rolling action budgets, overload escalation, safety migration, first-party seller classification (including Target's labeled-marketplace/absence rule), companion tab-reuse open requests, a jsdom boot of the mission/signal UI, and jsdom cart/order-review fixtures for all three retailers. GitHub CI also builds both unsigned Windows artifacts. Tests do not place live orders, call live OpenAI/Discord/retailer APIs, resolve a live Howl link, or guarantee that current retailer selectors are unchanged.

## Privacy and local security

- The desktop server binds only to `127.0.0.1` on ports `32191` through `32195`.
- The extension and app use a random per-install token. The extension pins the first accepted token and rejects later mismatches; app and extension versions must match exactly.
- The unpacked extension has a deterministic ID. The local server requires a loopback `Host` header (defeating DNS rebinding) and accepts a request only when it carries that exact extension origin, or no origin at all together with the pinned extension-ID header — Chrome omits the `Origin` header on host-permitted extension requests, while readable cross-origin web requests always reveal their true origin and are rejected. All state-changing endpoints additionally require the per-install token.
- Settings, approved MSRP, and item profiles are stored under Electron's local user-data directory. `catalog.json` contains only the keyword, selected retailers and filters, normalized result identity/title/URL, displayed listing price when present, and timestamps. `msrp-research.json` contains cited suggestions and no credential.
- The optional OpenAI API key is not part of settings or research JSON. Like the Discord bot token, it is written to a separate file only after operating-system encryption succeeds; removing it deletes that encrypted file and disables scheduled research without deleting approved prices.
- The Discord bot token is not part of settings or runtime JSON. It is written to a separate file only after operating-system encryption succeeds; removing the saved token deletes that encrypted file.
- Reported page addresses are reduced to origin plus pathname; query strings are discarded.
- Admin-provisioned Howl source links and resolved retailer sharing URLs are an intentional exception to query-string removal: the admin-owned settings retain their affiliate parameters. The source and resolution metadata are excluded from both the renderer and Chrome purchasing configuration; the renderer receives only the validated retailer sharing URL needed for clipboard copy.
- The bounded local ledger contains only milestone names, store/SKU, seller label, observed unit price and final total, quantity/attempt state, query-free paths, and timestamps.
- The app does not copy or store cookies, passwords, shipping addresses, payment details, CVV values, or order numbers.

## Troubleshooting

### Companion remains disconnected

Step 1 in the app diagnoses this: **Waiting for Chrome** means the extension has never reported in (load it, or click its reload arrow); **Reload the extension** means its version differs from the app; **Open a store tab** means the extension is loaded and the last requirement is a Target, Walmart, or Amazon tab in that Chrome profile — "Connected ✓" appears only once a store tab is reporting. The extension is named **Quick add** in Chrome's Extensions menu.

Also check:

- Confirm Cart Confirm is running.
- Confirm the unpacked extension is enabled and reloaded after every update.
- Click the Cart Confirm toolbar icon in Chrome to force an immediate connection check.
- Reload a supported store tab in the same Chrome profile the extension is loaded in.
- Read the extension badge: `STOP` = connected and fully paused, `IDLE` = connected and observing while disarmed, `ARM` = connected and armed, `OFF` = Chrome cannot reach the app on `127.0.0.1` (app not running, or a firewall/antivirus is intercepting loopback), `UPD` = version mismatch, `PAIR` = pairing mismatch.
- The app opens product pages directly in Chrome when it can find it; if Chrome is not installed, pages fall back to the default browser, where the companion cannot see them.
- Close duplicate desktop app processes if ports `32191` through `32195` are occupied.

### Offer is blocked

Read the product status reason. Common causes are a third-party seller, seller text the store no longer exposes, a missing/changed price or final-total selector, a cap violation, quantity not offered, incomplete cart enumeration, or another item in the cart. Blocking is intentional when required evidence cannot be read.

### Store reports traffic overload

Leave the tab open and wait for the displayed workflow to cool down. Do not repeatedly reload it manually. A retailer-provided `Retry-After` can extend the configured cooldown, and each retailer has an independent circuit.

### Discord signals show `Needs attention`

Check the exact message in the Discord panel. `401` means the bot token was rejected; `403` means the bot cannot view the channel or read history; `404` usually means the copied channel ID is wrong or the bot is not in that server. Confirm Message Content access is enabled in the Developer Portal. A Discord rate limit is honored automatically. Changing channel IDs starts a new history baseline so old messages cannot auto-open.

### Walmart shows `/qp`

This is Walmart's official purchase queue. Leave the tab open. The first live queue signal in an Autopilot run sends one simultaneous initial navigation to every other enabled Walmart mission; already queued tabs are skipped, and a durable receipt prevents another fan-out during that run. Cart Confirm recognizes Walmart's structured `/qp` queue and product-route holding pages only when they contain explicit waiting-room evidence tied to the exact mission item. Generic high-traffic/error copy remains an overload instead of being guessed as a queue. Cart Confirm deliberately does not call embedded ticket URLs, replay signatures, force refreshes, or skip the queue. Automation resumes only after Walmart redirects an admitted tab to its product flow.

### Badge shows `UPD` or `PAIR`

`UPD` means the desktop app and unpacked extension versions differ. Version 2.9 and later include a one-shot automatic reload: after newer Cart Confirm files replace the files in the same unpacked-extension folder, the installed companion reloads those files by itself and records the transition so it cannot loop. Upgrading from 2.8 or older still needs one final manual reload because those versions do not contain the updater yet. This does not download code from the internet; obtaining a new release still happens through the normal app/package or Git update. Chrome Web Store or managed distribution would be required for unattended remote delivery.

`PAIR` means the locally pinned companion token changed. Verify that only the intended Cart Confirm process is running, then remove and load the unpacked extension again to establish a new first-use pairing.

### Store page changed

Retailer HTML and accessibility labels change frequently. Store-specific selectors live in `extension/retailers.js`. Keep automation disarmed while updating and testing an adapter.

### Security challenge is missing images

The companion disables fast-load blocking for ten minutes when it detects a challenge. Reload the page once if the challenge asset does not appear, complete it manually, and let the normal page continue.

## Retailer terms

Review the current terms and purchasing limits for each store before use. Retailers may restrict automated access, limit quantities, change checkout behavior, or cancel orders.

- Target: <https://www.target.com/c/terms-conditions/-/N-4sr7l>
- Walmart: <https://www.walmart.com/help/article/walmart-com-terms-of-use/3b75080af40340d6bbd596f116fae5a0>
- Amazon: <https://www.amazon.com/gp/help/customer/display.html?nodeId=508088>

## License

MIT. This is an unofficial project and is not affiliated with or endorsed by Target, Walmart, or Amazon.
