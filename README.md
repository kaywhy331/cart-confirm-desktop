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
- Checkout requires fresh cart-confirmed proof and a readable final order total at or below that row's final-total cap.
- Each product is processed by exactly one tab — duplicate tabs cannot claim the same product — and **Add to cart only** items run in parallel across their own tabs. Final-review and auto-submit workflows remain exclusive per store: only one purchase flow per store at a time.
- A confirmed product is marked complete for the current automation run and cannot be purchased twice. Disarming and re-arming intentionally starts a new run.
- Proof, attempts, completion, and submit intent live in extension-owned storage. An uncertain final click holds its run lock until a retailer-specific confirmation or explicit failure appears; starting a new run requires an explicit warning to check retailer order history first.
- Final auto-submit re-reads the complete evidence immediately before clicking, requires the configured shipping/pickup mode, and blocks selected subscriptions, protection plans, tips, donations, gift wrap, and installment choices.
- Every desktop launch starts fully **STOPPED**: Autopilot is disarmed, browser scans and retries are paused, background checks and schedules cannot fire, and Discord is not polled. Editing purchase settings while armed is rejected.
- Discord messages are untrusted hints, never purchase proof. Signals match missions only by normalized `retailer:SKU`; their price, seller, stock, offer ID, and action links are re-validated before use, and the signed-in browser remains authoritative.
- Only official Discord bot tokens are accepted. The token is stored separately through Electron's operating-system encryption; plaintext and Linux `basic_text` fallbacks are refused. Discord user tokens and self-bots are not supported.
- A first Discord connection imports recent messages as history without opening pages. Later signals must be under two minutes old to auto-open. **Stop everything** pauses Discord polling as well as automatic openings, so nothing new is ingested until an explicit Arm, Test, or Open action resumes monitoring.
- CAPTCHAs, queues, sign-in prompts, and security challenges are never bypassed. When Walmart places one mission on an official `/qp` queue page, Cart Confirm makes one exactly-once pass through the other enabled Walmart missions at a one-second stagger so they can enter through their normal product pages too. A tab already in queue is frozen: ticket endpoints and signatures are never stored, called, replayed, or refreshed.
- All desktop and extension store actions share a fixed 120-action rolling-hour budget. Each product is limited to 100 attempts in a four-hour run and requires manual re-arming after exhaustion.
- Tool-controlled navigations are serialized per store. HTTP `429`, `502`, `503`, `504`, and `520`–`524` responses open an escalating store-specific cooldown circuit, and a bounded `Retry-After` header is honored.

Start with **Add to cart only** until you have verified the current store selectors and your account setup. Store markup changes regularly, so live checkout behavior cannot be guaranteed by the source tests alone.

## Features

- A mission-control layout: each product is a mission card showing its caps, action, live status, and last-checked age in one row, with inline editing (Done saves immediately) and a per-mission enable switch. A header **Autopilot** toggle arms and disarms everything; the Connect Chrome setup card appears only while the companion is disconnected and names the exact blocker.
- Up to 50 unique products across Target, Walmart, and Amazon, each with an optional display name.
- Per-product maximum unit price, maximum final order total, quantity, fulfillment mode, enabled state, and a mission action: **Watch & alert only** (monitors and alerts at or under your cap without ever clicking), add-only, final-review, or auto-submit. Rarely used fields live behind each row's **Advanced** section.
- Per-product alert loudness: standard ping, **loud alarm** (repeating audible alert with an on-screen Silence bar, throttled to once per five minutes per item), or silent log only.
- A worst-case exposure line in step 4: the total if every enabled item hits its cap — automation can never exceed the caps you set.
- Click any live-status row to filter the event log to that item's timeline.
- A **Test next (no buying)** button in the header that rotates through enabled missions while Autopilot is off so the companion can report price, seller, and stock without touching the cart.
- Quiet background stock checks for tab-less missions on Target and Walmart (read-only page fetches, rotated per store within the traffic budget) that open Chrome automatically the moment a mission verifies in stock.
- Per-product scheduled openings for known drop times: give any item an **Open at** date/time, save, and arm in advance. At that moment its page opens in Chrome (reusing an existing tab when possible) and the armed companion takes over. Same-store drops due together open one second apart, exactly once per mission. Step 4 shows a seven-day calendar strip of upcoming openings with a live countdown; times are marked missed instead of running more than two minutes late, and an old single global schedule migrates onto its store's enabled products automatically.
- Official-queue fan-out for simultaneous Walmart drops: the first enabled mission that reports a live `/qp` queue causes every other enabled, not-yet-queued Walmart mission to navigate once, one second apart. A durable per-run receipt prevents a second burst, Stop cancels pending pages, and every navigation still consumes the shared traffic budget.
- Official Discord bot ingestion with a local Desired/New signal inbox, stable store+SKU matching, encrypted credentials, silent history import, and per-mission auto-open controls. Fresh same-store signals enter the one-second drop lane while different retailers proceed independently.
- Admin/backend-provisioned Howl campaign links. The normal mission editor never asks for or resolves a Howl URL. A trusted admin workflow can resolve a generated link for an exact mission, after which the operator can copy only its validated retailer-domain sharing URL from the mission or a matching Discord signal. Campaign links remain sharing-only and never enter the purchasing configuration sent to Chrome.
- Sanitized direct signal entries for Amazon Add to Cart / Buy Now and Walmart Buy Now. Amazon requires a fresh under-cap price, `Amazon.com` seller, exact ASIN and whitelisted offer parameters. Walmart constructs only `https://www.walmart.com/affil/cart/buynow?items=<exact item ID>` from the normalized signal SKU (or reduces a supplied button to that form). Tracking parameters are stripped, durable tab context follows redirects, and missing browser context falls back to the canonical product page.
- Manual **Open enabled items now** action for all enabled stores, with each store's pages queued independently. When the companion is connected, an existing Chrome tab for that store is navigated instead of opening a new window, and identical pending opens are deduplicated.
- Configurable retry interval from 5 to 3,600 seconds, with jitter and increasing backoff after repeated store errors.
- Configurable per-store navigation spacing from 10 to 3,600 seconds and overload cooldown from 60 to 86,400 seconds.
- Automatic recovery when an item becomes unavailable in the cart or during checkout.
- Optional fast-load mode that blocks images, fonts, and media while preserving HTML, CSS, JavaScript, authentication, and store controls.
- Per-product offer, seller, unit price, observed final total, cart, checkout, attempt, and confirmation status.
- Windows desktop notifications and a bounded persistent local safety ledger.
- Legacy migration from the original single-product Target settings.

## Background stock checks vs. browser-only purchasing

While Autopilot is on, missions without a live Chrome tab get **quiet background checks**: the desktop fetches the public product page (no cookies, no sign-in, no cart actions), reads the embedded schema.org availability and price, and rotates round-robin through each store's missions inside the same per-store spacing and 120-action hourly budget. When a mission verifies in stock, the real page opens in Chrome and the in-tab pipeline re-verifies seller, price, and quantity before acting. If a store blocks or obscures these plain fetches, quiet checks for that store shut off after a few failures and the app tells you to keep a tab open instead. Amazon is tab-only. **Stop everything** is a hard cancellation boundary: it aborts active quiet HTTP checks, wakes and cancels store-opening waits, drops late non-health tab events, clears retry timers as the tabs receive the stopped configuration, pauses Discord and schedules, and disables Fast Mode. Only a connection heartbeat remains. Arm, Test next, Open, or Open all explicitly resumes monitoring.

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

The extension badge reads `STOP` when monitoring is paused, `IDLE` when monitoring is active but Autopilot is disarmed, and `ARM` when Autopilot is armed. Keep the desktop app open while running the buy list.

## Configure a buy list

Click **+ New mission**, then:

1. Paste the product page URL. The store, the TCIN / Walmart item ID / ASIN, and a mission name are detected automatically (the ID is visible under **Advanced**; edit the name freely).
2. Set a maximum **per-unit** price in US dollars (cents are supported) and the quantity.
3. Choose the action: **Watch & alert only** (the default — monitors and alerts, never clicks), **Add to cart only**, **Prepare checkout, I submit** (stops at the final review), or **Submit order automatically** (advanced).
4. For the two checkout-involving actions, open **Advanced** and set a positive maximum **final order total** (at least the capped unit price multiplied by quantity). For auto-submit, also explicitly require **Shipping / delivery** or **Store pickup**; if the final page cannot prove that choice, submission is blocked.
5. Optionally set **Open at** for a known drop time, pick an alert loudness, and choose how a matched Discord signal enters the store under **Advanced**. The product page is the recommended default. Direct Buy Now entries are available only for checkout-review or auto-submit missions; Amazon Add to Cart is available for cart or checkout missions.
6. Click **Done** — the mission saves immediately. Starting an edit while Autopilot is on pauses it first and offers to resume after saving.

To schedule an item for a known drop, set its **Open at** field to a future local date/time and save. Each product schedules independently. A receipt is persisted before the page opens, the time clears itself after that single attempt, and a time missed by more than two minutes is marked missed instead of running late. Missions for the same retailer and time use the one-second drop lane; ordinary monitoring retries do not. **Stop everything** clears all scheduled times.

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
5. Inbox cards say **Desired** when `retailer:SKU` already exists in Missions and **New** otherwise. **+ Add as desired** prefills a safe watch-only mission with the signal's title, canonical product URL, SKU, and observed price; review its cap and action before saving.
6. Turn on **Automatically open fresh desired signals**, enable the intended mission's signal control, and arm Autopilot. A live matched signal under two minutes old opens the configured entry. Multiple same-store signals are serialized one second apart; Target, Walmart, and Amazon lanes run independently.

The signal card's **Product** button is always the safest manual entry. Direct buttons are enabled only for a desired, enabled, under-cap mission while Autopilot is on and the signal is fresh. Every direct link is reduced to a strict allowlist, bound to the exact mission in extension-owned session storage before navigation, and rechecked in the normal cart/checkout pipeline. If that association cannot be established, Cart Confirm opens the canonical product page instead.

## Recommended workflow

1. With Autopilot off, create the complete mission list.
2. Empty unrelated items from any store cart that will use checkout mode.
3. Use **Test next (no buying)** repeatedly to rotate through the enabled missions, and confirm on each row that the page, price, and seller are recognized. Nothing is added while Autopilot is off.
4. Use add-only mode for an initial low-risk test.
5. Review every quantity, unit cap, final-total cap, and action again — the worst-case line shows your total exposure.
6. Switch **Autopilot** on and keep the intended Chrome profile plus Cart Confirm open. The app always restarts fully stopped; it never resumes monitoring or a saved schedule on launch without an explicit action.
7. Use **Open all enabled** to open each mission's page; while Autopilot is on, the companion acts as each page loads.
8. Complete sign-in or security prompts manually if a store presents them.
9. Watch the mission rows and the activity feed (click a row to filter it). **Stop everything** is always available.

When an item is out of stock, the companion reserves a per-store navigation slot after the configured minimum delay. If it becomes unavailable in the cart or checkout, the companion returns to the product and resumes. Safety failures such as a third-party seller, unreadable price or total, quantity mismatch, incomplete cart enumeration, extra cart item, or uncertain order submission stop the affected workflow for manual review.

Before switching any product to **Submit order automatically**, work through
[`VALIDATION-CHECKLIST.md`](VALIDATION-CHECKLIST.md). Cart Confirm verifies SKU
identity, first-party seller, price/total caps, cart completeness, and
fulfillment *category* (pickup vs. shipping) — it never reads or chooses your
payment method, delivery address, or pickup store location, so those still
need a human pass on the real final-review page first.

## Traffic overload behavior

The desktop opening queue and extension share the same safety goal: enter known drops promptly without turning normal monitoring into a reload storm. Manual and test openings use a fixed three-second stagger per store. Scheduled drop openings and the one exactly-once official-queue fan-out use a one-second stagger, one page load per mission. Once a tab reports that it is queued, Cart Confirm stops refreshing it. All later automatic retry navigation remains centrally serialized using the configured per-store spacing; a product's fresh retry reservation replaces its own stale one so no product can starve the others. Main-frame store navigations are observed so a retry cannot immediately follow a newly opened page. Every opening and retry still consumes the same fixed 120-action rolling-hour budget.

Responses with status `429`, `502`, `503`, `504`, or `520`–`524` pause automatic navigation and store mutations for that retailer and propagate the same deadline back to pending openings. Repeated overloads exponentially increase the cooldown, decay after six quiet hours, and remain capped at 24 hours. Recognizable overload pages are reported as `traffic-overload` instead of being treated as out of stock.

The persistent rolling budget counts Cart Confirm's desktop page openings, automatic navigations, quantity changes, add-to-cart actions, cart transitions, checkout actions, and final submission attempts. It does not pretend to count every script/resource request made by a retailer page or traffic generated by other software.

This reduces traffic generated by Cart Confirm; it cannot prevent or measure traffic from other browser profiles, devices, users, extensions, or store-side demand. It also cannot make an already overloaded retailer available. The safe response is to wait, and the circuit does that.

## Build an installer on Windows

Run:

```bat
BUILD-WINDOWS.cmd
```

The separately named NSIS installer, portable executable, and `SHA256SUMS.txt` are written to `dist\`. Pull-request artifacts are intentionally unsigned. A release requires a GitHub-verified signed tag matching `package.json`, plus `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets; the workflow verifies both Authenticode signatures and checksums before publishing. See [`RELEASE.md`](RELEASE.md) for the full signed-release checklist.

## Verify the source

```bat
VERIFY.cmd
```

Or:

```powershell
npm run verify
```

Verification performs a syntax check and runs the Node test suite, including Discord parsing/history/live routing, encrypted credential refusal paths, strict Amazon/Walmart direct-link sanitization, admin-owned Howl provisioning, safe redirect resolution and exact-SKU isolation, durable tab context, queue URL reduction, exactly-once schedule receipts, durable submission transitions, action/run budgets, overload escalation, safety migration, first-party seller classification (including Target's labeled-marketplace/absence rule), companion tab-reuse open requests, a jsdom boot of the mission/signal UI, and jsdom cart/order-review fixtures for all three retailers. GitHub CI also builds both unsigned Windows artifacts. Tests do not place live orders, resolve a live Howl link, contact Discord, or guarantee that current retailer selectors are unchanged.

## Privacy and local security

- The desktop server binds only to `127.0.0.1` on ports `32191` through `32195`.
- The extension and app use a random per-install token. The extension pins the first accepted token and rejects later mismatches; app and extension versions must match exactly.
- The unpacked extension has a deterministic ID. The local server requires a loopback `Host` header (defeating DNS rebinding) and accepts a request only when it carries that exact extension origin, or no origin at all together with the pinned extension-ID header — Chrome omits the `Origin` header on host-permitted extension requests, while readable cross-origin web requests always reveal their true origin and are rejected. All state-changing endpoints additionally require the per-install token.
- Settings are stored under Electron's local user-data directory.
- The Discord bot token is not part of settings or runtime JSON. It is written to a separate file only after operating-system encryption succeeds; removing the saved token deletes that encrypted file.
- Reported page addresses are reduced to origin plus pathname; query strings are discarded.
- Admin-provisioned Howl source links and resolved retailer sharing URLs are an intentional exception to query-string removal: the admin-owned settings retain their affiliate parameters. The source and resolution metadata are excluded from both the renderer and Chrome purchasing configuration; the renderer receives only the validated retailer sharing URL needed for clipboard copy.
- The bounded local ledger contains only milestone names, store/SKU, seller label, observed unit price and final total, quantity/attempt state, query-free paths, and timestamps.
- The app does not copy or store cookies, passwords, shipping addresses, payment details, CVV values, or order numbers.

## Troubleshooting

### Companion remains disconnected

Step 1 in the app diagnoses this: **Waiting for Chrome** means the extension has never reported in (load it, or click its reload arrow); **Reload the extension** means its version differs from the app; **Open a store tab** means the extension is loaded and the last requirement is a Target, Walmart, or Amazon tab in that Chrome profile — "Connected ✓" appears only once a store tab is reporting.

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

This is Walmart's official purchase queue. Leave the tab open. The first live queue signal in an Autopilot run sends one initial navigation to every other enabled Walmart mission, one second apart; already queued tabs are skipped, and a durable receipt prevents another fan-out during that run. Cart Confirm reads only the embedded Walmart item ID and safe wait state. It deliberately does not call the embedded ticket URL, replay signatures, force refreshes, or skip the queue. Automation resumes only after Walmart redirects an admitted tab to its product flow.

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
