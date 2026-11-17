# StockDex Live Alerts — Backend V0.2

## Deployment
- App: https://stockdex-au.onrender.com
- API: Supabase Edge Function \`stockdex-api\`
- Route: \`https://prxvxomflqzviqiktcgr.supabase.co/functions/v1/stockdex-api\`
- Isolated database tables: \`stockdex_devices\`, \`stockdex_events\`, \`stockdex_deliveries\`, \`stockdex_config\`.
- JWT verification disabled **only** on the \`stockdex-api\` function, which uses scoped device-secret authentication and a separate secret for the provider webhook. Other Supabase functions are unaffected.

## Implemented
- On-demand browser Web Push subscriptions (VAPID keys in protected server-side configuration)
- Secure per-device watchlist and preference registration, hashed device credentials
- Server-originating test push, limited to one per minute per device
- Read-only confirmed-event feed; example alerts in the UI are opt-in and labelled as samples
- Strict, secret-authenticated event ingestion endpoint
- Product URL must be HTTPS and belong to the selected retailer
- Allowlisted retailer IDs: \`jb\`, \`target\`, \`bigw\`, \`woolworths\`, \`eb\`
- Duplicate event protection via source + external event ID
- Filtering by user-selected retailer, tracked product terms, price ceiling and quiet hours
- Basic delivery logging

## Critical limitation
**No licensed retailer feed has been connected. No automatic retailer polling is in production. Real stock alerts cannot arrive until provider authorization and integration are complete.**

A practical supplier is CardTracker.au, which advertises restock webhooks and licenses them case by case. Contact **info@oztrackers.com** about personal use, permitted reseller/collector app use, payload format, covered stores, price and end-to-end detection latency before enabling. Do not connect by scraping BIG W or EB Games (which prohibit content scraping in their published terms).

## Webhook contract (post-agreement)
The approved supplier or integration adapter must POST JSON to:

\`https://prxvxomflqzviqiktcgr.supabase.co/functions/v1/stockdex-api?action=provider\`

with private header \`x-stockdex-feed-secret\`. Secret is stored in the private RLS-protected \`stockdex_config\` table and **is intentionally not in this public repository**. Never paste it into a mobile app, frontend JS, or an issue.

Example contract:
\`\`\`json
{
  "id": "unique-actual-stock-transition-id",
  "retailer": "jb",
  "product": "Pokémon TCG 30th Celebration Elite Trainer Box",
  "status": "preorder",
  "url": "https://www.jbhifi.com.au/products/<real-product-slug>",
  "price": 129.00,
  "observedAt": "2026-11-18T01:00:00Z"
}
\`\`\`
Valid \`status\` values: \`in_stock\`, \`preorder\`, \`low_stock\`. Timestamps must be within 10 minutes of receipt. This schema is an adapter contract, not a claim about an upstream provider's native schema. The upstream provider must support or be mapped to it with the provider's permission.

## Production-readiness gaps
1. Confirm provider webhook authenticity and document its signature or secret/header mechanism; use an adapter if necessary.
2. Test device push from Chrome installed as PWA on Android via Settings → Background Alerts → Enable → Server-side Test; inspect backend logs if no delivery.
3. Measure time from retailer stock changes to provider event to phone notification. **The 1–3 minute target has not been validated.**
4. Add abuse prevention for anonymous registration (rate limiting and optional challenge) before public promotion.
5. Add device timezone to quiet hours; current backend interprets it as Australia/Adelaide.
6. Add provider health/last-success heartbeat, maximum freshness checks, robust fan-out queue with retries and pagination for >250 registrations.
7. Provide secure opt-out endpoint for device deregistration and remove expired subscriptions.
8. Use a sustainable hosting/database plan if the existing Supabase project is paused or quota-limited.

## Security
All StockDex tables have RLS enabled and direct \`anon\`/\`authenticated\` table permissions revoked. Only the Edge Function's service role accesses them. Reusing the existing Supabase project does not connect the old TCG app's user accounts or expose its data to StockDex.

## Manual smoke checks
\`GET /functions/v1/stockdex-api?action=status\` should report \`service:"stockdex-api"\`, \`ok:true\` and \`feedMode:"awaiting_licensed_provider"\`.
\`GET /functions/v1/stockdex-api?action=events\` should return an array (empty until provider-authorized events exist).
