# Cart Confirm Desktop

Cart Confirm is a local Windows desktop app and unpacked Chrome companion for a multi-product buy list on Target, Walmart, and Amazon. Every enabled product has its own store, SKU, maximum unit price, quantity, and success action.

The companion uses the normal signed-in store pages. It can keep checking an unavailable item, add an eligible offer to the cart, set the configured quantity, and—only for a row explicitly set to **Complete checkout** while automation is armed—proceed through checkout and select the final order control.

## Safety rules

These rules are enforced in code and cannot be disabled from the UI:

- The URL and exact store identifier must match: Target TCIN, Walmart item ID, or Amazon ASIN.
- The page must expose a readable unit price at or below the product's cap.
- The seller must be verifiably first-party: Target, Walmart, or Amazon directly. Marketplace, fulfilled-only, and missing-seller offers are blocked.
- The requested cart quantity must be confirmed before checkout.
- A checkout-mode product will not submit while another product is detected in that store cart.
- Only one checkout product per store can run at a time. Duplicate tabs cannot claim the same product.
- A confirmed product is marked complete for the current automation run and cannot be purchased twice. Disarming and re-arming intentionally starts a new run.
- After a final order click, the companion waits for either a confirmation or an explicit store failure. An uncertain result is never blindly resubmitted.
- CAPTCHAs, queues, sign-in prompts, and security challenges are never bypassed. Automation pauses for manual completion.

Start with **Add to cart only** until you have verified the current store selectors and your account setup. Store markup changes regularly, so live checkout behavior cannot be guaranteed by the source tests alone.

## Features

- Up to 50 unique products across Target, Walmart, and Amazon.
- Per-product maximum unit price, quantity, enabled state, and add-only/checkout action.
- One global schedule: choose one store and one local date/time. At that time, only enabled products for that store open.
- Manual **Open enabled buy list** action for all enabled stores.
- Configurable retry interval from 5 to 3,600 seconds, with jitter and increasing backoff after repeated store errors.
- Automatic recovery when an item becomes unavailable in the cart or during checkout.
- Optional fast-load mode that blocks images, fonts, and media while preserving HTML, CSS, JavaScript, authentication, and store controls.
- Per-product offer, seller, price, cart, checkout, attempt, and confirmation status.
- Windows desktop notifications and an in-memory event log.
- Legacy migration from the original single-product Target settings.

## Why it does not use raw HTML requests

Authenticated carts and checkout flows depend on browser JavaScript, cookies, CSRF protections, inventory checks, and store security controls. Replaying private requests or treating checkout as a plain HTML form would be fragile and could submit stale or unsafe data.

Fast-load mode keeps the authenticated browser workflow but removes nonessential image, font, and media downloads. If a security challenge appears, resource blocking is paused for ten minutes so the challenge can be completed manually.

## Windows quick start

1. Extract this project to a permanent folder.
2. Double-click `RUN-ON-WINDOWS.cmd`.
3. On first launch, the script installs Electron and starts the app.
4. Select **Show companion folder** in Cart Confirm.
5. Open `chrome://extensions` in Chrome.
6. Turn on **Developer mode**.
7. Select **Load unpacked** and choose the shown `extension` folder.
8. If an older companion is already loaded, select **Reload** on its extension card.
9. Sign in normally to every store you plan to use and verify saved delivery, payment, and store preferences.

The extension badge reads `IDLE` when the desktop app is connected but automation is disarmed, and `ARM` when automation is armed. Keep the desktop app open while running the buy list.

## Configure a buy list

For each row:

1. Choose Target, Walmart, or Amazon.
2. Paste the canonical product URL. The UI attempts to infer the store and SKU.
3. Confirm the TCIN, Walmart item ID, or ASIN.
4. Set a maximum **per-unit** price in US dollars.
5. Set the total quantity for that product.
6. Choose **Add to cart only** or **Complete checkout**.
7. Enable the row and save.

To use the one allowed schedule, enable it, select a store, and select one local date/time. There is no per-product or second schedule. The normal open button remains available at any time.

## Recommended workflow

1. Leave automation disarmed and save the complete buy list.
2. Empty unrelated items from any store cart that will use checkout mode.
3. Open the enabled buy list and confirm that each store page and SKU are correct.
4. Use add-only mode for an initial low-risk test.
5. Review every quantity, cap, and action again.
6. Arm automation and keep Chrome plus Cart Confirm open.
7. Complete sign-in or security prompts manually if a store presents them.
8. Watch the per-product status and event log. Disarm immediately if the configuration or store page looks wrong.

When an item is out of stock, the companion reloads after the configured minimum delay. If it becomes unavailable in the cart or checkout, the companion returns to the product and resumes. Safety failures such as a third-party seller, unreadable price, quantity mismatch, extra cart item, or uncertain order submission stop the affected workflow for manual review.

## Build an installer on Windows

Run:

```bat
BUILD-WINDOWS.cmd
```

The NSIS installer and portable executable are written to `dist\`.

## Verify the source

```bat
VERIFY.cmd
```

Or:

```powershell
npm run verify
```

Verification performs a syntax check and runs the Node test suite, including URL/SKU normalization, settings migration, price parsing, and first-party seller classification. It does not place live orders or guarantee that current retailer selectors are unchanged.

## Privacy and local security

- The desktop server binds only to `127.0.0.1` on ports `32191` through `32195`.
- The extension and app use a random per-install token.
- Settings are stored under Electron's local user-data directory.
- Reported page addresses are reduced to origin plus pathname; query strings are discarded.
- Events contain only milestone names, store/SKU, seller label, observed price, quantity/attempt state, and timestamps.
- The app does not copy or store cookies, passwords, shipping addresses, payment details, CVV values, totals, or order numbers.

## Troubleshooting

### Companion remains disconnected

- Confirm Cart Confirm is running.
- Confirm the unpacked extension is enabled and reloaded after an update.
- Reload a supported store tab.
- Check for `IDLE` or `ARM` on the extension badge.
- Close duplicate desktop app processes if ports `32191` through `32195` are occupied.

### Offer is blocked

Read the product status reason. Common causes are a third-party seller, seller text the store no longer exposes, a missing/changed price selector, price above the cap, quantity not offered, or another item in the cart. Blocking is intentional when required evidence cannot be read.

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
