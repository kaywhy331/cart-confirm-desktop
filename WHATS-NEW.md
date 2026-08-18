# What's new

User-facing highlights for each release. The unsigned-prerelease workflow
copies the current version's bullets into the GitHub release, and the desktop
update dialog shows exactly these bullets. Keep every entry short, plain, and
about what the user will notice — one bullet per change, no internals.
Publishing fails if the version being released has no section here.

## 3.6.14
- Fixed: auto-checkout could stop with "the complete cart inventory could not be verified" even though the right item was confirmed in the cart
- Cart Confirm now recognizes Target's current cart Remove button when double-checking that your cart holds only the mission's item
- An unexpected extra cart line still stops checkout for your manual review, as before

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
