# EMIS+ accounts: sign-in, orders, Health Points, referrals

Status (21 Oct 2026, branch `claude/emis-customer-accounts`): the backend is live on Supabase project
`pgwenyjjjabzkaztkphd` (approved by Jamie; formerly mcsg-lease-desk, wiped; org Ranklore Pte Ltd; region
ap-northeast-2, Seoul). Live: the `loyalty` migration (version 20261021074729, dry-run first, all 19
function bodies checked against this file) and both edge functions (`loyalty`, `shopify-webhook`,
verify_jwt off by design). Not done yet: email templates, the webhook signing secret, Shopify webhook
registration, SMTP, Apple, Google, and any app deploy. App values are in `.env.example`; the app still
shows "coming soon" until a build is made with them. `scripts/check-live.sh` re-runs the read-only live checks.

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
  the member holding that email as a *proven* binding. A Google or Apple "verified" flag alone is not proof: a
  Google account can keep a company address after that mailbox has changed hands, and Supabase links such a
  sign-in to whoever holds the address now. So proof is checked per sign-in (session):
  - A session proves the mailbox if it signed in with an emailed code (the access token's `amr` says `otp`,
    `magiclink` and similar, and the token's email is the user's current one), or if the address is one the
    provider itself runs (`gmail.com`/`googlemail.com` with Google, Apple's private relay with Apple).
  - A proving session makes the binding proven and collects waiting orders. A session that does not prove it
    (Google on a company address, Apple sharing a real address) gets no points, orders or history and cannot
    claim a referral; the app shows "Connect your emis.asia orders" and a 6-digit code to the user's own
    address. Orders keep reaching a proven binding whichever way the person signs in.
  - A trigger on `auth.users` keeps the binding in step with Supabase Auth. Auth's own confirmed email change
    moves it and keeps it proven. Any other change (identity promotion after unlinking, a staff edit) moves it
    unproven, and only a code sign-in made after that moment proves it again. A deleted or soft-deleted user
    releases the address.
  - Sign-in, referral claims and the trigger take the same per-user lock, so creating a member cannot race an
    email change, and the database re-checks `auth.users` before binding.
  - Orders placed before the customer signs up (or proves the address) wait and are awarded the next time they
    open the app with a proving sign-in. `members.shopify_customer_id` is filled from matched orders so a later
    migration can link by Shopify customer ID.
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

## Go-live gates

Done on 21 Oct 2026 (Jamie's go-ahead, relayed by the parent session):

- **Supabase project** `pgwenyjjjabzkaztkphd`. Its dashboard name still says mcsg-lease-desk (rename in the dashboard).
- **Database**: `supabase/migrations/20261021074729_loyalty.sql`, including the `loyalty_sync_email` trigger on
  `auth.users`. Optional later: `insert into loyalty.prior_customers` the lowercased emails of a Shopify customer
  export with orders, so they cannot claim referral bonuses as "new".
- **Edge functions** `loyalty` and `shopify-webhook` deployed. `LOYALTY_ALLOWED_ORIGINS` is not set, so the default
  `https://momominibot.github.io` applies; `SHOPIFY_SHOP_DOMAIN` defaults to `4a6920-67.myshopify.com`.

Still open (each needs Jamie):

1. **Email templates** (Dashboard > Authentication > Emails, or the Management API with a personal access token;
   no token is saved on this machine). Put the 6-digit code in **both** "Confirm signup" (a brand-new user's first
   code comes from this one) and "Magic Link" (returning users); text below. In Authentication > Providers > Email,
   check Email OTP Length is 6 (the app takes exactly 6 digits) and set Email OTP Expiration to 600 seconds.
2. **Custom SMTP (required for customers).** Built-in email only reaches the project's team members, so Jamie can
   test with his own address now but customers get no code. Set a sending service and From address (for example
   no-reply@ an emis.asia sending subdomain with SPF, DKIM and DMARC), raise the Auth email rate limit, consider
   CAPTCHA.
3. **Shopify webhooks.** `orders/paid` and `refunds/create`, JSON, to
   `https://pgwenyjjjabzkaztkphd.supabase.co/functions/v1/shopify-webhook`, then set the edge function secret
   `SHOPIFY_WEBHOOK_SECRET` (Dashboard > Edge Functions > Secrets) to the signing secret Shopify shows under
   Settings > Notifications > Webhooks (or the app's client secret if a custom app registers them). It cannot be
   generated here: Shopify chooses it. Until then the function answers 503 and stores nothing.
4. **Auth URL configuration** (only needed for Apple/Google redirects): Site URL and redirect URLs
   `https://momominibot.github.io/emis-plus-app/auth/callback` and `emisapp://auth/callback`.
5. **Apple.** Apple Developer: enable Sign in with Apple on App ID `asia.emis.app`; create a Services ID with return
   URL `https://pgwenyjjjabzkaztkphd.supabase.co/auth/v1/callback`, and a Sign in with Apple key. Supabase Apple
   provider: client IDs with the Services ID first, then `asia.emis.app`; the client secret expires every 6 months.
6. **Google.** Google Cloud OAuth client (type Web) with redirect URI
   `https://pgwenyjjjabzkaztkphd.supabase.co/auth/v1/callback`; client ID and secret into the Supabase Google provider.
7. **App builds.** Values are in `.env.example` (`EXPO_PUBLIC_AUTH_PROVIDERS=email` until 5-6 are done). Web:
   `scripts/deploy-web.sh` (exports with `--clear`). Native: new EAS build (supabase-js, expo-apple-authentication,
   the Apple entitlement; an OTA update is not enough).
8. **Old Vercel `backend`.** `backend-theta-ashen-89.vercel.app/api/loyalty/*` still answers with fake data and its
   webhook stub skips HMAC without a secret. Remove or redeploy it.
9. **Privacy notice.** Sign-in emails live in Supabase Auth; Health Points keep the user id, order IDs, order emails
   and amounts. The project is in **Seoul (ap-northeast-2)**, not Singapore, so say so (PDPA transfer obligations).
10. **Rules.** Confirm the earning, tier and referral rules and the tier perk wording (table above).
11. **Independent review** of commit 5558590 (Codex hit its usage limit on 21 Oct; resets 27 Oct).

### Email template text

Subject for both templates: `Your EMIS+ sign-in code`

Body for both "Confirm signup" and "Magic Link":

```html
<h2>Your EMIS+ sign-in code</h2>
<p>Enter this code in the EMIS+ app to sign in:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">{{ .Token }}</p>
<p>The code works once and expires in 10 minutes. If you did not ask for it, you can ignore this email.</p>
<p>EMIS+ Medical Supplies, emis.asia</p>
```

### First live checks

- Now (after gate 1, before SMTP): Jamie, as a member of the Supabase org, can sign in with his own email on a build
  made with `.env.example`; the code email comes from Supabase's default sender. He sees 0 points until webhooks run.
- Sign in with each method on web and a device build; check the code email arrives from the custom sender.
- Place a small real order with a signed-in test customer's email; Order History and points should appear.
  Refund it; the points come back off. Shopify's webhook page shows delivery status.

## Known limits and follow-ups

- Apple "Hide My Email" relay addresses will not match orders placed with the customer's real email; those
  customers should sign in with email or Google, or use the same address at checkout. Apple users who share a
  real address are asked to confirm it with a code, like Google users on non-Gmail addresses.
- Supabase links a Google sign-in to an existing user with the same verified email. Someone who once controlled
  a company mailbox and made a Google account on it can therefore sign in to the account of whoever holds that
  address now. Health Points show such a session nothing (no points, orders, history or referral claims) until
  it confirms the address with a code, but it is still signed in to that Supabase user, which matters for any
  future feature keyed only to the user. If that is a concern, limit Google to Gmail addresses (an Auth hook)
  or leave Google off.
- An email change made by staff through the Supabase dashboard or admin API leaves the new address unproven; the
  customer confirms it with a code on their next visit.
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
supabase/tests/run.sh            # 79 Deno tests: real Postgres 17 for the ledger, mocked supabase-js for sign-in
npx tsc --noEmit                 # app code (supabase/ and backend/ excluded; deno checks supabase/)
python3 scripts/test-web-auth.py <web-test-export> <web-plain-export>   # 23 browser checks, see the file header
```

`run.sh` covers: awards, idempotency, tiers, refunds (partial, amount-only, foreign currency, tax-exclusive, fees,
before the order, every arrival order), referral rules and reversal, orders before sign-up, email matching
(case, guest checkout, changes), mailbox proof (an unproven session sees nothing even on a proven member,
confirmed and unconfirmed Auth email changes, sign-ins from before an unconfirmed move, deletes and soft deletes,
a stale read cannot undo a change, two-session races between a first sign-in and an email change in both orders,
the trigger's lock order, referral claims need proof), earlier-customer list, concurrency (parallel deliveries, refund-vs-award,
claims, 30 events for one customer at once), API roles locked out, HMAC, 18-digit IDs, CORS, Supabase-user
checks (unconfirmed email refused), and the app's email OTP, Apple id-token and OAuth PKCE steps against a
mocked supabase-js. The browser test drives the real web export with real supabase-js against stand-in Auth
endpoints that verify the PKCE S256 challenge.
