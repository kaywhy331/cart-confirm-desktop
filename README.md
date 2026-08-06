# Cart Confirm Desktop

Cart Confirm is a local Windows desktop app and unpacked Chrome companion for a multi-product buy list on Target, Walmart, and Amazon. Every enabled product has its own store, SKU, maximum unit price, maximum final order total, quantity, and success action.

The companion uses the normal signed-in store pages. It can keep checking an unavailable item, add an eligible offer to the cart, set the configured quantity, and proceed to a capped final review. **Stop at final review** is recommended. **Submit order automatically** is an advanced opt-in that additionally requires an explicit shipping/pickup mode and can select the final order control.

## Safety rules

These rules are enforced in code and cannot be disabled from the UI:

- The URL and exact store identifier must match: Target TCIN, Walmart item ID, or Amazon ASIN.
- The page must expose a readable unit price at or below the product's cap.
- The seller must be verifiably first-party: Target, Walmart, or Amazon directly. Marketplace, fulfilled-only, and missing-seller offers are blocked.
- The requested cart quantity must be confirmed after any quantity change settles.
- Current cart seller and price evidence must be readable; product-page evidence cannot make an ambiguous cart safe.
- Before checkout, the companion must completely enumerate exactly one cart line, independently reconcile remove controls, and prove that it is the configured SKU. Unknown, duplicate, and extra lines block submission.
- Checkout requires fresh cart-confirmed proof and a readable final order total at or below that row's final-total cap.
- Only one automated product workflow per store can run at a time. Duplicate tabs cannot claim the same product.
- A confirmed product is marked complete for the current automation run and cannot be purchased twice. Disarming and re-arming intentionally starts a new run.
- Proof, attempts, completion, and submit intent live in extension-owned storage. An uncertain final click holds its run lock until a retailer-specific confirmation or explicit failure appears; starting a new run requires an explicit warning to check retailer order history first.
- Final auto-submit re-reads the complete evidence immediately before clicking, requires the configured shipping/pickup mode, and blocks selected subscriptions, protection plans, tips, donations, gift wrap, and installment choices.
- Automation always starts disarmed after the desktop app launches. Editing purchase settings while armed is rejected.
- CAPTCHAs, queues, sign-in prompts, and security challenges are never bypassed. Walmart `/qp` pages are matched by their embedded item ID, but ticket endpoints and signatures are never stored, called, replayed, or refreshed by Cart Confirm.
- All desktop and extension store actions share a fixed 120-action rolling-hour budget. Each product is limited to 100 attempts in a four-hour run and requires manual re-arming after exhaustion.
- Tool-controlled navigations are serialized per store. HTTP `429`, `502`, `503`, `504`, and `520`–`524` responses open an escalating store-specific cooldown circuit, and a bounded `Retry-After` header is honored.

Start with **Add to cart only** until you have verified the current store selectors and your account setup. Store markup changes regularly, so live checkout behavior cannot be guaranteed by the source tests alone.

## Features

- Up to 50 unique products across Target, Walmart, and Amazon.
- Per-product maximum unit price, maximum final order total, quantity, fulfillment mode, enabled state, and add-only/review/auto-submit action.
- One global schedule: choose one store and one local date/time. At that time, only enabled products for that store are queued.
- Manual **Open enabled buy list** action for all enabled stores, with each store's pages queued independently.
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

For each row:

1. Choose Target, Walmart, or Amazon.
2. Paste the canonical product URL. The UI attempts to infer the store and SKU.
3. Confirm the TCIN, Walmart item ID, or ASIN.
4. Set a maximum **per-unit** price in US dollars.
5. For final-review or auto-submit rows, set a positive maximum **final order total**. It must be at least the capped unit price multiplied by quantity.
6. Set the total quantity for that product.
7. Choose **Add to cart only**, **Stop at final review (recommended)**, or **Submit order automatically (advanced)**.
8. For auto-submit, explicitly require **Shipping / delivery** or **Store pickup**. If the final page cannot prove that choice, submission is blocked.
9. Enable the row and save.

To use the one allowed schedule, enable it, select a store, and select one future local date/time. There is no per-product or second schedule. A receipt is persisted before pages open, the schedule disables itself after that attempt, and a time missed by more than two minutes is marked missed instead of running late.

## Recommended workflow

1. Leave automation disarmed and save the complete buy list.
2. Empty unrelated items from any store cart that will use checkout mode.
3. Open the enabled buy list and confirm that each store page and SKU are correct.
4. Use add-only mode for an initial low-risk test.
5. Review every quantity, unit cap, final-total cap, and action again.
6. Arm automation and keep the intended Chrome profile plus Cart Confirm open. The app will require explicit re-arming after every restart.
7. Complete sign-in or security prompts manually if a store presents them.
8. Watch the per-product status and event log. Disarm immediately if the configuration or store page looks wrong.

When an item is out of stock, the companion reserves a per-store navigation slot after the configured minimum delay. If it becomes unavailable in the cart or checkout, the companion returns to the product and resumes. Safety failures such as a third-party seller, unreadable price or total, quantity mismatch, incomplete cart enumeration, extra cart item, or uncertain order submission stop the affected workflow for manual review.

## Traffic overload behavior

The desktop opening queue and extension share the same safety goal: do not create bursts against one retailer. The desktop spaces its scheduled and manual openings per store, while the extension centrally serializes retry navigation across tabs. Main-frame store navigations are observed so a retry cannot immediately follow a newly opened page.

Responses with status `429`, `502`, `503`, `504`, or `520`–`524` pause automatic navigation and store mutations for that retailer and propagate the same deadline back to pending openings. Repeated overloads exponentially increase the cooldown, decay after six quiet hours, and remain capped at 24 hours. Recognizable overload pages are reported as `traffic-overload` instead of being treated as out of stock.

The persistent rolling budget counts Cart Confirm's desktop page openings, automatic navigations, quantity changes, add-to-cart actions, cart transitions, checkout actions, and final submission attempts. It does not pretend to count every script/resource request made by a retailer page or traffic generated by other software.

This reduces traffic generated by Cart Confirm; it cannot prevent or measure traffic from other browser profiles, devices, users, extensions, or store-side demand. It also cannot make an already overloaded retailer available. The safe response is to wait, and the circuit does that.

## Build an installer on Windows

Run:

```bat
BUILD-WINDOWS.cmd
```

The separately named NSIS installer, portable executable, and `SHA256SUMS.txt` are written to `dist\`. Pull-request artifacts are intentionally unsigned. A release requires a GitHub-verified signed tag matching `package.json`, plus `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets; the workflow verifies both Authenticode signatures and checksums before publishing.

## Verify the source

```bat
VERIFY.cmd
```

Or:

```powershell
npm run verify
```

Verification performs a syntax check and runs the Node test suite, including queue URL reduction, exactly-once schedule receipts, durable submission transitions, action/run budgets, overload escalation, safety migration, first-party seller classification, and jsdom cart/order-review fixtures for all three retailers. GitHub CI also builds both unsigned Windows artifacts. Tests do not place live orders or guarantee that current retailer selectors are unchanged.

## Privacy and local security

- The desktop server binds only to `127.0.0.1` on ports `32191` through `32195`.
- The extension and app use a random per-install token. The extension pins the first accepted token and rejects later mismatches; app and extension versions must match exactly.
- The unpacked extension has a deterministic ID, and the local server accepts browser requests only from that exact extension origin.
- Settings are stored under Electron's local user-data directory.
- Reported page addresses are reduced to origin plus pathname; query strings are discarded.
- The bounded local ledger contains only milestone names, store/SKU, seller label, observed unit price and final total, quantity/attempt state, query-free paths, and timestamps.
- The app does not copy or store cookies, passwords, shipping addresses, payment details, CVV values, or order numbers.

## Troubleshooting

### Companion remains disconnected

- Confirm Cart Confirm is running.
- Confirm the unpacked extension is enabled and reloaded after an update.
- Reload a supported store tab.
- Check for `IDLE` or `ARM` on the extension badge.
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
