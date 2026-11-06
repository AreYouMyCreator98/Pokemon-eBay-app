# POKÉMARKET

A mobile-first, read-only Pokémon marketplace dashboard for eBay listings. Research listings, save items and open the original eBay item page for any transaction action.

## Current build
- Clean light-first responsive design with persistent dark mode and scalable SVG UI assets
- Server-side eBay Browse API OAuth proxy; credentials stay off the client
- eBay Australia and eBay US marketplace selection
- Search, auction / Buy It Now filtering, price bounds and sort order
- Listing cards with price, condition, seller details where supplied, bids and end-time countdown
- Supabase email/password accounts with per-user cloud watchlists and saved searches synced across devices, protected by Row Level Security
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

## UI design system (November 2026)
The default dashboard uses a clean light palette and can be toggled to dark mode on any page. Shared colour tokens and component styles are in `public/clean-theme.css`, with preference persistence in `public/theme.js`. Vector illustrations and icons are saved inside `public/assets/ui/`; the install icon is `public/icon.svg`. Listing photos are always the real original eBay image, never generated replacements. The existing read-only checkout boundary and live eBay search are preserved.

## V2 Marketplace Polish
- Compact listing search, overview counters and a reliably single-row mobile category toolbar
- Strict ≤10-minute auction radar with expiry removal
- Card number and seller-stated language filter, price mode for item cost versus item plus known shipping
- Search suggestions and per-listing links to live asking-price comparisons in Market Stats
- V2 logic tests in `test/market-v2.test.js`; no invented shipping or sale prices

## V2.2 — Auction Radar & Collector Quality
- Home-page header is now compact, with Stats and About accessible from icons beside theme, profile and alerts.
- Auction Radar can display auctions ending in the next 10, 30, 60 or 1,440 minutes and can be refined by TCG and product category. It searches multiple eBay queries, deduplicates item IDs and excludes ended auctions; the counts are *samples*, not comprehensive market-wide totals.
- Collector Picks hides obvious mixed-card/bulk lots and seller-described replicas or reprints by default; All Listings, Singles and Lots & Bundles remain available. These are seller-title heuristics, not authentication or verification.
- Item price and item plus known same-currency postage are shown together on listing cards. Taxes/import duties are not included, and unknown shipping is never silently treated as free.
- Read-only external eBay navigation, saved-search authentication and existing exact price controls remain unchanged.

- Search responses are briefly cached on the server (20 seconds for auctions, 55 seconds for other searches) to protect rate limits; exact bids and availability should always be verified on eBay. The duplicate star link was removed because it did not actually add an item to a watchlist.

## V3 Good Deals — licensed market benchmarking

**No fake market values.** The new read-only `/deals.html` page discovers recent genuine eBay listings and shows a separate *unverified candidate* feed. It only displays an actual below-market comparison if approved current benchmarks are configured. Auction current bids never qualify as final bargains.

To activate authorised reference pricing, configure these **server-side** Render environment variables (never add keys or source data to `public/` or GitHub):
- `MARKET_REFERENCE_LICENSE_CONFIRMED=true` only after written permission for public app display/commercial use from each source represented.
- `MARKET_REFERENCE_DATA_JSON`: JSON array of permitted, dated, exact-product reference records for TCGplayer, PriceCharting or Collectr. In future an official provider feed can populate the same validated format.

Example structure (illustrative only; no actual prices are provided):

```json
[{
  "approved": true,
  "source": "PriceCharting",
  "family": "pricecharting",
  "productName": "Exact product name",
  "productType": "GRADED",
  "currency": "AUD",
  "value": 0,
  "basis": "GUIDE",
  "asOf": "YYYY-MM-DDTHH:MM:SSZ",
  "setName": "Exact set",
  "cardNumber": "123/456",
  "grader": "PSA",
  "grade": "10",
  "language": "Japanese",
  "matchPhrases": ["Exact card name", "123/456", "Exact set"]
}]
```

The above placeholder **does not validate**. Prices must be strictly positive, source-approved, within seven days, and supplied in exactly the same currency as the eBay listing. Raw references require condition (NM, LP, MP, HP or DAMAGED); sealed requires exact set and product form. An exact item/grade match plus same-currency known shipping is mandatory; missing information prevents a discount badge.

PriceCharting's regular personal API subscription is **internal-use only** and does not itself authorise displaying data to the public. TCGplayer stopped issuing new API keys and Collectr's access is permission-based. We will not scrape these sources or attribute eBay asking-price medians to them.

Provider quotes can overlap (Collectr may use TCGplayer), so sources are not automatically treated as independent evidence. Even with comparisons, all deals require human verification of photos, edition, condition, authenticity, tax, shipping and final stock. Never call this a 100% guaranteed best deal.

## V3.1 — Good Deals without additional price API keys (November 2026)

Good Deals now uses the **existing authorised eBay Browse API**, and **does not require TCGplayer, PriceCharting or Collectr API credentials**.

- Searches new eBay Buy It Now listings, then makes a limited number of additional targeted eBay searches for more offers of the same identifiable product.
- **Potential price opportunity** cards are shown only when at least three matching active listings from *different sellers* have known item + shipping totals in the same currency. The target seller/listing is excluded.
- Enforces same set and collector number (where applicable), grading company and grade, language/printing signals, raw condition, and sealed product form. A mismatch or insufficient title/condition details excludes that listing from an automatic deal flag.
- Uses the **lower quartile of other sellers' current asking prices**, not the mean, in order to avoid inflated percentage-off claims. The UI also displays the peer median, count, and links to actual comparable listings.
- Highlights price differences only for fixed-price offers, never bids; no claims of authenticity, completed sales, fair market value or a guaranteed best deal.
- Rate-limits external searches (up to 15 product comparison queries in batches of 3), deduplicates offers, caches comparable results for 150 seconds and general listing discovery for 120 seconds.
- The original licensed-provider model remains in code for a future separately authorised pricing service but is **not** part of the live Good Deals calculation.
- See `public/ebay-comparables.js` and `test/ebay-comparables.test.js` for the implemented validation and edge-case coverage.

No external website is scraped and no quotes or sales are invented. The product remains read-only and opens original eBay listings to review or buy.


## Good Deals Finder — stronger coverage and evidence tiers
- Samples a wider mix of live eBay Buy It Now searches (including price-ascending candidates), then searches targeted comparable products for the selected category.
- **Strong price signals:** at least three other sellers with closely matched listing identities and a discount relative to the observed lower quartile of their active asking prices.
- **Potential bargains:** only two independent comparable sellers; the candidate must beat even the cheaper of their total known asking costs by the selected threshold. These are *early signals*, not verified bargains.
- **Watchlist leads:** one comparator only. Shown without a numeric claimed discount or estimated market value.
- All tiers require a known same-currency item + postage total and compare only Buy It Now offers with separate identifiable sellers; they exclude auctions, obvious replicas, mystery lots and unmatched grades, languages, card numbers or sealed formats.
- Evidence links let users inspect the specific comparison listings. The sampled listings do not constitute the entire eBay market, and asking prices do not establish sold-price market value. No extra pricing keys or web scraping are used.
