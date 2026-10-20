# EMIS+ accounts: sign-in, orders, Health Points, referrals

Status (20 Oct 2026): built and tested locally on branch `claude/emis-customer-accounts`.
Nothing is deployed, registered or migrated. The app hides sign-in and points until the
environment variables below exist, so a web redeploy today would still show "coming soon".

## How it fits together

```
EMIS+ app ──PKCE──▶ Shopify Customer Account API (login, the customer's own orders)
    │  Bearer <customer token>
    ▼
Supabase edge function `loyalty` ──"who is this token?"──▶ Customer Account API
    │                                   (customer ID comes from Shopify, never the app)
    ▼
Postgres schema `loyalty` (ledger keyed to the Shopify customer ID)
    ▲
Supabase edge function `shopify-webhook` ◀── Shopify orders/paid, refunds/create (HMAC signed)
```

- No Admin API token or other private token is used anywhere, client or server.
- Catalogue reads stay on tokenless Storefront API (`lib/shopify.ts`, unchanged).

### Why Supabase and not customer metafields

Points need exactly-once awards per order, single-use referral claims, atomic balance updates,
a readable history and reverse lookup from a referral code to its owner. Postgres gives unique
constraints, row locks and one transaction per webhook. Metafields would need an Admin token
(the old one is dead), have no transactions (retried webhooks race on read-modify-write), no
lookup from code to customer and no ledger.

## Rules (please confirm, they are business choices)

| Rule | Current setting |
|---|---|
| Earning | 1 point per S$1 of the order subtotal (after discounts, before shipping), rounded down |
| Tiers | Lifetime net spend before the order: Silver 1x, Gold from S$500 1.5x, Diamond from S$2,000 2x (mirrors `TIER_CONFIG`) |
| Which orders | `orders/paid` only; SGD; customer attached (guest checkouts earn nothing); Shopify test orders ignored |
| Refunds | Refunded merchandise takes back exactly the points it earned: the larger of the refunded items and the money returned minus shipping, shipping tax, duties, extra fees (and item tax when prices exclude tax). Pending refund transactions count. Money returned in the customer's currency converts at the order's own rate. Shipping-only refunds take nothing |
| Referral | Friend enters the code in the app before their first order; they must have no orders at all; one claim per customer ever; not their own code; not back to someone they referred |
| Referral bonus | 100 points each, only when the friend's first paid order (over S$0) arrives; both reversed if that order is refunded in full, including a refund that reached us before the payment |
| Not built | Redeeming points, expiry, backfill of orders paid before launch |

`TIER_CONFIG` perks in `lib/types.ts` (birthday voucher, free shipping, free gift) are copy only;
nothing delivers them. Confirm or remove before launch.

## Go-live steps (each needs Jamie's go-ahead)

1. **Shopify admin, Headless channel**: create storefront "EMIS+ app" > Customer Account API settings > public client(s):
   - Web: callback `https://momominibot.github.io/emis-plus-app/auth/callback`, JavaScript origin
     `https://momominibot.github.io`, logout URI `https://momominibot.github.io/emis-plus-app/account`.
   - Mobile: callback `shop.61337632846.app://auth/callback` (scheme already added to `app.json`).
   - If Shopify needs separate web and mobile clients, use both client IDs (env vars below).
2. **Supabase**: new project `emis-loyalty`, region `ap-southeast-1` (Singapore). Paid resource: confirm cost first.
   - Apply `supabase/migrations/20261020120000_loyalty.sql` as the `postgres` role (the role behind
     `SUPABASE_DB_URL`, which the functions use). Dry run first: run it inside `begin; ... rollback;`.
   - Deploy `shopify-webhook` and `loyalty` with `verify_jwt = false` (they authenticate in code).
   - Secrets: `SHOPIFY_WEBHOOK_SECRET`, `LOYALTY_ALLOWED_ORIGINS=https://momominibot.github.io`.
     Optional: `SHOPIFY_SHOP_DOMAIN` (default `4a6920-67.myshopify.com`), `CUSTOMER_ACCOUNT_API_URL`, `ALLOW_TEST_ORDERS`.
3. **Shopify webhooks**: `orders/paid` and `refunds/create`, JSON, to
   `https://<project-ref>.supabase.co/functions/v1/shopify-webhook`. If created in
   Settings > Notifications > Webhooks, the signing secret is shown on that page; put it in `SHOPIFY_WEBHOOK_SECRET`.
4. **App config**, then rebuild:
   - `EXPO_PUBLIC_SHOPIFY_CA_CLIENT_ID` (or `_WEB` and `_NATIVE`), `EXPO_PUBLIC_LOYALTY_API_URL=https://<ref>.supabase.co/functions/v1/loyalty`.
   - Web: `scripts/deploy-web.sh` (now exports with `--clear` so new env values are not served from Metro's cache).
   - Native: new EAS build (adds `expo-crypto` and the `shop.61337632846.app` scheme; an OTA update is not enough).
5. **Old Vercel `backend`**: `backend-theta-ashen-89.vercel.app/api/loyalty/points` and `/referral` still answer with
   fake data and `/api/webhooks/shopify` skips HMAC when no secret is set. The source is deleted on this branch;
   the live routes go away only with a redeploy or by removing the project.
6. **Privacy notice**: mention that Health Points keep the Shopify customer ID, order IDs and amounts in Supabase (Singapore).

### First live checks after go-live

- Sign in on web and on a device build; Order History lists real orders.
- Place a small real order with a test customer; `orders/paid` should award points (Supabase logs show `outcome`).
- Refund it; points come back off. Shopify > Settings > Notifications > Webhooks shows delivery status.
- Verify the server-side token check: the `loyalty` function calls the Customer Account API with the app's token and
  forwards the browser's `Origin`. That a web-client token is accepted from a server with that header is
  inferred from Shopify's docs and Hydrogen, not yet seen live.

## Known limits and follow-ups

- Shopify does not guarantee webhook delivery. A nightly reconciliation (Admin API `read_orders`, feeding the same
  idempotent SQL functions) would close the gap; it needs a new Admin token, so it is not built.
- Tier multiplier and the referral's qualifying order follow the order in which payment webhooks arrive, not when
  orders were paid (Shopify does not guarantee delivery order, and a failed delivery can be retried hours later).
  Example: at S$490 spent, a S$10 order then a S$100 order should earn 10 + 150 points; if the S$100 webhook arrives
  first they earn 100 + 15. A reconciliation job could not fix this by replaying webhooks (awarded orders are
  idempotent); it would need its own correction step that re-prices awards by `processed_at`.
- An order edited after payment does not earn on the added amount.
- Refunds are counted when created (pending money counts), not when the refund settles; a refund that later fails
  keeps its clawback until staff adjust it.
- Web stores tokens in `localStorage` (native uses the Keychain/Keystore). Any XSS on the web origin could read them.
  Tabs coordinate refresh and sign-out with the Web Locks API; browsers without it fall back to per-tab behaviour.

## Tests

```bash
supabase/tests/run.sh            # 48 Deno tests on a throwaway local Postgres 17 (needs brew postgresql@17, deno)
npx tsc --noEmit                 # app code (supabase/ and backend/ are excluded; deno checks supabase/)
python3 scripts/test-web-auth.py <web-test-export> <web-plain-export>   # 27 browser checks, see the file header
```

`run.sh` covers: awards, idempotency (duplicate deliveries, 24 parallel deliveries), tier boundaries vs `TIER_CONFIG`,
partial/over/duplicate refunds, amount-only, foreign-currency, tax-exclusive and goodwill refunds, part refunds in a foreign currency, refunds before
awards (including a full refund before the payment), 150 parallel refund-vs-award races, every referral rule,
mutual-claim, claim-vs-payment and refund-vs-claim races, bonus reversal, API roles locked out, referral code alphabet,
HMAC (known vector, tampering), 18-digit IDs, CORS, and the RFC 7636 PKCE vector. Removing the per-order lock or the
member lock makes the concurrency tests fail (checked by mutation).
