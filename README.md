# Cart Confirm Desktop

Cart Confirm is a local Windows desktop app and unpacked Chrome companion for a multi-product buy list on Target, Walmart, and Amazon. Every enabled product has its own store, SKU, maximum unit price, maximum final order total, quantity, and success action.

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
- Automation always starts disarmed after the desktop app launches. Editing purchase settings while armed is rejected.
- CAPTCHAs, queues, sign-in prompts, and security challenges are never bypassed. Walmart `/qp` pages are matched by their embedded item ID, but ticket endpoints and signatures are never stored, called, replayed, or refreshed by Cart Confirm.
- All desktop and extension store actions share a fixed 120-action rolling-hour budget. Each product is limited to 100 attempts in a four-hour run and requires manual re-arming after exhaustion.
- Tool-controlled navigations are serialized per store. HTTP `429`, `502`, `503`, `504`, and `520`–`524` responses open an escalating store-specific cooldown circuit, and a bounded `Retry-After` header is honored.

Start with **Add to cart only** until you have verified the current store selectors and your account setup. Store markup changes regularly, so live checkout behavior cannot be guaranteed by the source tests alone.

## Features

- A guided four-step layout: connect Chrome, add items, save and test, then arm and run. Cards collapse to one expanded step, advance automatically as each stage completes, and reopen with a click; each shows whether it is done or still needs attention.
- Up to 50 unique products across Target, Walmart, and Amazon, each with an optional display name.
- Per-product maximum unit price, maximum final order total, quantity, fulfillment mode, enabled state, and add-only/review/auto-submit action. Rarely used fields live behind each row's **Advanced** section.
- A **Test (no buying)** button that opens the first enabled item while disarmed so the companion can report price, seller, and stock without touching the cart.
- Per-product scheduled openings for known drop times: give any item an **Open at** date/time, save, and arm in advance. At that moment its page opens in Chrome (reusing an existing tab when possible) and the armed companion takes over. Step 4 shows a seven-day calendar strip of upcoming openings with a live countdown; times fire exactly once, are marked missed instead of running more than two minutes late, and an old single global schedule migrates onto its store's enabled products automatically.
- Manual **Open enabled items now** action for all enabled stores, with each store's pages queued independently. When the companion is connected, an existing Chrome tab for that store is navigated instead of opening a new window, and identical pending opens are deduplicated.
- Configurable retry interval from 5 to 3,600 seconds, with jitter and increasing backoff after repeated store errors.
- Configurable per-store navigation spacing from 10 to 3,600 seconds and overload cooldown from 60 to 86,400 seconds.
- Automatic recovery when an item becomes unavailable in the cart or during checkout.
- Optional fast-load mode that blocks images, fonts, and media while preserving HTML, CSS, JavaScript, authentication, and store controls.
- Per-product offer, seller, unit price, observed final total, cart, checkout, attempt, and confirmation status.
- Windows desktop notifications and a bounded persistent local safety ledger.
- Legacy migration from the original single-product Target settings.

## Why it does not use raw HTML requests

Authenticated carts and checkout flows depend on browser JavaScript, cookies, CSRF protections, inventory checks, and store security controls. Replaying private requests or treating checkout as a plain HTML form would be fragile and could submit stale or unsafe data.

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

The extension badge reads `IDLE` when the desktop app is connected but automation is disarmed, and `ARM` when automation is armed. Keep the desktop app open while running the buy list.

## Configure a buy list

For each row in step 2:

1. Paste the product page URL. The store, and the TCIN / Walmart item ID / ASIN, are detected automatically (the ID is visible under **Advanced**).
2. Optionally name the item so statuses and the event log are easy to read.
3. Set a maximum **per-unit** price in US dollars and the quantity.
4. Choose **Add to cart only**, **Prepare checkout, I submit** (stops at the final review), or **Submit order automatically** (advanced).
5. For the two checkout-involving actions, open **Advanced** and set a positive maximum **final order total** (at least the capped unit price multiplied by quantity). For auto-submit, also explicitly require **Shipping / delivery** or **Store pickup**; if the final page cannot prove that choice, submission is blocked.
6. Enable the row and save in step 3.

To schedule an item for a known drop, set its **Open at** field to a future local date/time and save. Each product schedules independently. A receipt is persisted before the page opens, the time clears itself after that single attempt, and a time missed by more than two minutes is marked missed instead of running late. **Stop everything** clears all scheduled times.

## Recommended workflow

1. Leave automation disarmed and save the complete buy list (step 3).
2. Empty unrelated items from any store cart that will use checkout mode.
3. Use **Test (no buying)** to open the first enabled item, and confirm in "What the companion sees" that the page, SKU, price, and seller are recognized. Nothing is added while disarmed.
4. Use add-only mode for an initial low-risk test.
5. Review every quantity, unit cap, final-total cap, and action again.
6. Arm automation in step 4 and keep the intended Chrome profile plus Cart Confirm open. The app will require explicit re-arming after every restart.
7. Use **Open enabled items now** to open each enabled product page; while armed, the companion acts as each page loads.
8. Complete sign-in or security prompts manually if a store presents them.
9. Watch the per-product status and event log. Disarm immediately if the configuration or store page looks wrong.

When an item is out of stock, the companion reserves a per-store navigation slot after the configured minimum delay. If it becomes unavailable in the cart or checkout, the companion returns to the product and resumes. Safety failures such as a third-party seller, unreadable price or total, quantity mismatch, incomplete cart enumeration, extra cart item, or uncertain order submission stop the affected workflow for manual review.

Before switching any product to **Submit order automatically**, work through
[`VALIDATION-CHECKLIST.md`](VALIDATION-CHECKLIST.md). Cart Confirm verifies SKU
identity, first-party seller, price/total caps, cart completeness, and
fulfillment *category* (pickup vs. shipping) — it never reads or chooses your
payment method, delivery address, or pickup store location, so those still
need a human pass on the real final-review page first.

## Traffic overload behavior

The desktop opening queue and extension share the same safety goal: do not create bursts against one retailer. Desktop-initiated openings (manual, test, and scheduled — one page load each) use a short fixed three-second stagger per store, while the extension centrally serializes automatic retry navigation across tabs using the configured per-store spacing; a product's fresh retry reservation replaces its own stale one so no product can starve the others. Main-frame store navigations are observed so a retry cannot immediately follow a newly opened page. All openings and retries still consume the same fixed 120-action rolling-hour budget.

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

Verification performs a syntax check and runs the Node test suite, including queue URL reduction, exactly-once schedule receipts, durable submission transitions, action/run budgets, overload escalation, safety migration, first-party seller classification (including Target's labeled-marketplace/absence rule), companion tab-reuse open requests, a jsdom boot of the guided-step UI, and jsdom cart/order-review fixtures for all three retailers. GitHub CI also builds both unsigned Windows artifacts. Tests do not place live orders or guarantee that current retailer selectors are unchanged.

## Privacy and local security

- The desktop server binds only to `127.0.0.1` on ports `32191` through `32195`.
- The extension and app use a random per-install token. The extension pins the first accepted token and rejects later mismatches; app and extension versions must match exactly.
- The unpacked extension has a deterministic ID. The local server requires a loopback `Host` header (defeating DNS rebinding) and accepts a request only when it carries that exact extension origin, or no origin at all together with the pinned extension-ID header — Chrome omits the `Origin` header on host-permitted extension requests, while readable cross-origin web requests always reveal their true origin and are rejected. All state-changing endpoints additionally require the per-install token.
- Settings are stored under Electron's local user-data directory.
- Reported page addresses are reduced to origin plus pathname; query strings are discarded.
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
- Read the extension badge: `IDLE`/`ARM` = connected, `OFF` = Chrome cannot reach the app on `127.0.0.1` (app not running, or a firewall/antivirus is intercepting loopback), `UPD` = version mismatch, `PAIR` = pairing mismatch.
- The app opens product pages directly in Chrome when it can find it; if Chrome is not installed, pages fall back to the default browser, where the companion cannot see them.
- Close duplicate desktop app processes if ports `32191` through `32195` are occupied.

### Offer is blocked

Read the product status reason. Common causes are a third-party seller, seller text the store no longer exposes, a missing/changed price or final-total selector, a cap violation, quantity not offered, incomplete cart enumeration, or another item in the cart. Blocking is intentional when required evidence cannot be read.

### Store reports traffic overload

Leave the tab open and wait for the displayed workflow to cool down. Do not repeatedly reload it manually. A retailer-provided `Retry-After` can extend the configured cooldown, and each retailer has an independent circuit.

### Walmart shows `/qp`

This is Walmart's official purchase queue. Leave the tab open. Cart Confirm reads only the embedded Walmart item ID and safe wait state so it can associate the page with the configured product. It deliberately does not call the embedded ticket URL, replay signatures, force refreshes, or skip the queue. Automation resumes only after Walmart redirects the admitted tab to the product flow.

### Badge shows `UPD` or `PAIR`

`UPD` means the desktop app and unpacked extension versions differ; reload the extension from the folder shown by the current app. `PAIR` means the locally pinned companion token changed. Verify that only the intended Cart Confirm process is running, then remove and load the unpacked extension again to establish a new first-use pairing.

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
