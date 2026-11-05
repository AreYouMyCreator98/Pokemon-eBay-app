# POKÉMARKET

A mobile-first, read-only Pokémon marketplace dashboard for eBay listings. Research listings, save items and open the original eBay item page for any transaction action.

## Current build
- Premium dark navy and gold responsive interface with custom app icon
- Server-side eBay Browse API OAuth proxy; credentials stay off the client
- eBay Australia and eBay US marketplace selection
- Search, auction / Buy It Now filtering, price bounds and sort order
- Listing cards with price, condition, seller details where supplied, bids and end-time countdown
- Persistent local-device watchlist and saved searches
- Browser notifications for watched auctions ending within 10 minutes while the app is open
- Installable PWA shell
- Sold-history page that clearly explains why verified sold data is not yet available

## Deploy on Render
1. Pushes to the main GitHub branch can be connected through Render.
2. In Render, choose New +, then Blueprint, and select this repository. The included render.yaml configures the Node web service.
3. Add your eBay production Client ID and Client Secret as the service environment variables.
4. Deploy, then open the generated HTTPS URL on your phone and use the browser's Add to Home Screen option.

The app requires a Node.js 18+ host; GitHub Pages alone cannot run the server-side OAuth proxy.

## Run locally
Requires Node.js 18 or newer.

1. Copy .env.example to .env.
2. Add your eBay production Client ID and Client Secret to .env.
3. Run npm start.
4. Open http://localhost:3000.

Without eBay credentials, the interface runs but live search returns a configuration message. Never put credentials in public files or commit a real .env file.

## eBay setup
Create an application in the eBay Developer Program and use production OAuth application credentials. Configure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as server environment secrets on the hosting provider. The server requests an application access token and calls the official Browse API. Current marketplace options are Australia and US; add other marketplace IDs only after checking API support and regional availability.

## Sold-data limitation
The sold-history page is intentionally a placeholder. eBay Marketplace Insights / sold-history access is restricted and is not assumed to be available to every developer account. This app does not scrape eBay pages or fabricate sale prices. Connect an approved sold-data source before showing historical sold listings.

## Read-only safety
POKÉMARKET does not provide bidding, buying, offers, checkout, messaging, or eBay account login. Any action happens on the original eBay listing after the user follows its eBay item URL. Seller feedback is informational and is not proof of item authenticity.

## Notification limitation
Browser auction reminders work while POKÉMARKET is open on a device with notifications allowed. True background / push alerts require a push service and server-side subscription storage, which are not connected yet.

## Next milestones
1. Configure and validate eBay production API credentials.
2. Deploy the Render service and test real AU/US API responses.
3. Add more marketplaces and advanced Pokémon-specific filters.
4. Connect an approved sold-history data source if access is granted.
5. Add server-backed push alerts and optional cross-device sync.
