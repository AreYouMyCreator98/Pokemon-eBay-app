# StockDex — Standalone Android-installable preview

StockDex is a self-contained Progressive Web App (PWA) with a Pokédex-inspired interface, built independently of the TCG Bid Buy Watch dashboard. It is deployed from the separate \`stockdex-standalone\` branch and the \`stockdex/\` directory, so the existing dashboard and its Render deployment remain untouched.

## What's implemented
- Custom responsive Classic Red, Midnight Dex and Pearl White UI
- Alerts tab with retailer filters (JB Hi-Fi, Target, Big W, Woolworths, EB Games)
- Clearly labelled example alerts; **no real drops are claimed**
- Watchlist with product names, retailer selections, optional max price, enabled/disabled state
- Device-local persistent settings and watchlist via localStorage
- Notification permission + test notification via service worker
- PWA installation manifest, icon and offline cache
- Optional sound, vibration and quiet-hours preferences for future notification backend

## What's not live yet
**No retailer-monitoring service, remote push subscription endpoint, stock ingestion or delivery SLA is deployed in this preview.** Neither the sample cards nor the watchlist means that real products are currently being checked. Browser notification tests operate only on the user's device and do not represent a retailer drop.

To reach a 1–3 minute target, connect a permitted near-real-time stock feed for each retailer, maintain change detection (only notify on validated out-of-stock -> in-stock or pre-order-open transitions), deduplicate changes, and run an always-on worker. Add server-side Web Push/FCM delivery, device registration, logging and retries. Test end-to-end timing before promising a latency window. Review each retailer's data-access terms before adding automated checks; BIG W expressly limits information scraping.

## Deployment
Static site publish directory: \`stockdex\`; build command: \`echo 'StockDex ready'\`; branch: \`stockdex-standalone\`. Works over HTTPS on Render, including PWA installation.

## Safety
No credentials, personal details or payment information are collected. The watchlist lives in the browser and is not synchronized. If the user clears storage, it will be lost.
