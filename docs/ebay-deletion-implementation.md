# eBay Marketplace Account Deletion / Closure integration

Status: **NOT PRODUCTION READY**. Do not register this callback or claim compliance.

## Implemented

- `GET /api/ebay/account-deletion?challenge_code=...` computes SHA-256 over challenge + verification token + exact callback URL.
- `POST /api/ebay/account-deletion` attempts signature verification using eBay's public-key endpoint, but returns HTTP 503 even for verified events because durable deletion processing is not implemented.
- Missing verification token or invalid requests fail closed.
- Regression tests run under `npm run check`.

## Remaining before registering with eBay

1. Confirm eBay's current signature format and public-key response against official documentation and a test notification.
2. Inventory *all* persisted eBay user data, including watchlist JSON snapshots, caches, logs, and backups. A seller username is not necessarily equivalent to the immutable user ID in deletion notifications.
3. Implement a durable idempotent deletion queue, correct user-ID matching, deletion/redaction in all applicable stores, retries, auditing without retaining deleted personal data, and appropriate retention policy.
4. Verify signature rejection, successful delivery, retries, duplicate delivery, deletion coverage and database permissions in staging.
5. Configure `EBAY_DELETION_VERIFICATION_TOKEN` securely in Render; token must match the value entered into eBay's portal. Never commit it.
6. Confirm Render is running the intended GitHub commit and test the challenge externally.

Callback URL: `https://pokemarket-w369.onrender.com/api/ebay/account-deletion`

**Do not interpret HTTP 200 from GET challenge as proof that POST notifications are processed.**
