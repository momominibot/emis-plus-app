# EMIS+ accounts: sign-in, orders, Health Points, referrals

Status (21 Oct 2026): built and tested locally on branch `claude/emis-customer-accounts`.
Nothing is deployed, created, registered or migrated. The app hides sign-in and points until
the environment variables below exist, so a web redeploy today would still show "coming soon".

## How it fits together

```
EMIS+ app ── Supabase Auth ── email 6-digit code, Sign in with Apple, Google
    │  Bearer <Supabase access token>
    ▼
Edge function `loyalty` ── auth.getUser(token): user id + confirmed email
    │
    ▼
Postgres schema `loyalty` (ledger keyed to the Supabase user id)
    ▲
Edge function `shopify-webhook` ◀── Shopify orders/paid, refunds/create (HMAC signed)
                                    orders matched to users by email (lowercased, trimmed)
```

- **Sign-in** (`lib/auth/`): Supabase Auth via `@supabase/supabase-js`.
  - Email: `signInWithOtp` sends a 6-digit code, `verifyOtp({ type: 'email' })` signs in. New emails create an account.
  - Apple: native sheet on iOS (`expo-apple-authentication` identity token to `signInWithIdToken`); browser
    `signInWithOAuth` on Android and web.
  - Google: browser `signInWithOAuth` everywhere. Supabase's Expo guide uses this for mobile; the free native
    Google Sign-In library cannot pass the nonce Supabase needs for `signInWithIdToken`.
  - Redirect sign-ins use PKCE. Web returns to `/auth/callback`, native to `emisapp://auth/callback`.
  - Sessions: AsyncStorage on native, localStorage on web, refreshed by supabase-js (paused in the background on native).
- **Identity link**: a member is a Supabase user. Orders carry the Shopify order email; they are matched to
  the member whose *confirmed* email is the same. Orders placed before the customer signs up wait and are
  awarded the next time they open the app. `members.shopify_customer_id` is filled from matched orders so a
  later migration can link by Shopify customer ID.
- **Orders screen**: lists the member's matched paid orders from our own table (no Shopify customer API),
  with points per order and a link to emis.asia for full details and tracking.
- No Admin API token or other private Shopify token is used anywhere. Catalogue reads stay on tokenless
  Storefront API (`lib/shopify.ts`, unchanged).
- The earlier Shopify Customer Account API sign-in was removed (it is in git history at `da333fa`).

### Why the ledger is in Postgres

Points need exactly-once awards per order, single-use referral claims, atomic balances, a readable history and
reverse lookup from a referral code to its owner: unique constraints, row locks and one transaction per event.

## Rules (please confirm, they are business choices)

| Rule | Current setting |
|---|---|
| Earning | 1 point per S$1 of the order subtotal (after discounts, before shipping), rounded down |
| Tiers | Net spend (after refunds) on orders paid before this one, by Shopify's `processed_at`: Silver 1x, Gold from S$500 1.5x, Diamond from S$2,000 2x (mirrors `TIER_CONFIG`). A late webhook re-prices later orders ("Tier rate updated") |
| Which orders | `orders/paid` only; SGD; any order with an email, guest checkouts included; Shopify test orders ignored |
| Refunds | Refunded merchandise takes back exactly the points it earned: the larger of the refunded items and the money returned minus shipping, shipping tax, duties, extra fees (and item tax when prices exclude tax). Pending refund money counts. Customer-currency refunds convert at the order's rate. Each refund recalculates the order from all its refunds in refund-ID order |
| Referral | A signed-in member enters a friend's code before their first order: no order known for their email, not on the earlier-customers list, one claim ever, not their own code, not back to someone they referred |
| Referral bonus | 100 points each, based on the friend's first order of at least S$1 by payment time; reversed if refunds leave less than S$1 of it |
| Not built | Redeeming points, expiry, backfill of orders paid before launch |

`TIER_CONFIG` perks in `lib/types.ts` (birthday voucher, free shipping, free gift) are copy only; nothing delivers them.

## Go-live gates (each needs Jamie's OK)

1. **Supabase project.** No project named "emis" is in the connected Supabase account (it lists mcsg-lease-desk and
   ovumind, active; ranklore-dashboard and "momominibot's Project", paused). Either point to the existing one or
   create `emis` in `ap-southeast-1` (paid; confirm cost). Everything below lives in that project.
2. **Database.** Apply `supabase/migrations/20261020120000_loyalty.sql` as the `postgres` role (dry run inside
   `begin; ... rollback;` first). Optionally import earlier customers: `insert into loyalty.prior_customers` the
   lowercased emails of a Shopify customer export with orders, so they cannot claim referral bonuses as "new".
3. **Edge functions.** Deploy `shopify-webhook` and `loyalty` with `verify_jwt = false` (both authenticate in code).
   Secrets: `SHOPIFY_WEBHOOK_SECRET`, `LOYALTY_ALLOWED_ORIGINS=https://momominibot.github.io`.
4. **Auth URL configuration.** Site URL and redirect URLs: `https://momominibot.github.io/emis-plus-app/auth/callback`
   and `emisapp://auth/callback`.
5. **Email code.** Auth > Email Templates > Magic Link: show `{{ .Token }}` instead of `{{ .ConfirmationURL }}`
   (for example "Your EMIS+ code is {{ .Token }}"). OTP length 6, expiry kept short (Supabase allows at most 1 day).
6. **Custom SMTP (required).** Without it Supabase only emails the project's own team members, so customers get no
   code. Set a sending service and From address (for example no-reply@ an emis.asia sending subdomain with SPF,
   DKIM and DMARC), then raise the Auth email rate limit (30/hour after enabling custom SMTP). Supabase also
   recommends CAPTCHA against bulk sign-up abuse.
7. **Apple.** Apple Developer: enable Sign in with Apple on App ID `asia.emis.app` (the app now declares the
   entitlement); create a Services ID with return URL `https://<project-ref>.supabase.co/auth/v1/callback`, and a
   Sign in with Apple key. Supabase Apple provider: client IDs with the Services ID first, then `asia.emis.app`;
   the generated client secret expires every 6 months and must be renewed.
8. **Google.** Google Cloud: OAuth consent screen, then an OAuth client (type Web) with redirect URI
   `https://<project-ref>.supabase.co/auth/v1/callback`; client ID and secret into the Supabase Google provider.
9. **Shopify webhooks.** `orders/paid` and `refunds/create`, JSON, to
   `https://<project-ref>.supabase.co/functions/v1/shopify-webhook`; put the signing secret in `SHOPIFY_WEBHOOK_SECRET`.
10. **App config and builds.** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
    `EXPO_PUBLIC_AUTH_PROVIDERS=email,apple,google` (list only providers set up in 7-8),
    `EXPO_PUBLIC_LOYALTY_ENABLED=true` (after 2-3). Web: `scripts/deploy-web.sh` (exports with `--clear`).
    Native: new EAS build (adds supabase-js, expo-apple-authentication and the Apple entitlement; an OTA update is not enough).
11. **Old Vercel `backend`.** `backend-theta-ashen-89.vercel.app/api/loyalty/*` still answers with fake data and its
    webhook stub skips HMAC without a secret. Source is deleted here; remove or redeploy the project.
12. **Privacy notice.** Mention that sign-in emails live in Supabase Auth and Health Points keep the user id, order
    IDs, order emails and amounts (Supabase, Singapore).

### First live checks

- Sign in with each method on web and a device build; check the code email arrives from the custom sender.
- Place a small real order with a signed-in test customer's email; Order History and points should appear.
  Refund it; the points come back off. Shopify's webhook page shows delivery status.

## Known limits and follow-ups

- Apple "Hide My Email" relay addresses will not match orders placed with the customer's real email; those
  customers should sign in with email or Google, or use the same address at checkout.
- "New customer" for referrals means no order known since Health Points started, plus the optional earlier-customers
  import; without the import, a long-time customer could claim a code once.
- An order that lands while its customer is signing up for the first time is picked up on their next app open.
- Shopify does not guarantee webhook delivery. A nightly reconciliation (Admin API `read_orders`, feeding the same
  functions) would close the gap; it needs a new Admin token, so it is not built. Out-of-order delivery is handled.
- Refunds are counted when created (pending money counts); a refund that later fails keeps its clawback until staff
  adjust it (Shopify documents no webhook tying a failed refund payment back to its refund).
- An order edited after payment does not earn on the added amount.

## Tests

```bash
supabase/tests/run.sh            # 67 Deno tests: real Postgres 17 for the ledger, mocked supabase-js for sign-in
npx tsc --noEmit                 # app code (supabase/ and backend/ excluded; deno checks supabase/)
python3 scripts/test-web-auth.py <web-test-export> <web-plain-export>   # 20 browser checks, see the file header
```

`run.sh` covers: awards, idempotency, tiers, refunds (partial, amount-only, foreign currency, tax-exclusive, fees,
before the order, every arrival order), referral rules and reversal, orders before sign-up, email matching
(case, guest checkout, changes), earlier-customer list, concurrency (parallel deliveries, refund-vs-award,
claims, 30 events for one customer at once), API roles locked out, HMAC, 18-digit IDs, CORS, Supabase-user
checks (unconfirmed email refused), and the app's email OTP, Apple id-token and OAuth PKCE steps against a
mocked supabase-js. The browser test drives the real web export with real supabase-js against stand-in Auth
endpoints that verify the PKCE S256 challenge.
