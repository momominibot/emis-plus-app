// End to end: signed Shopify webhook bodies -> handler -> real Postgres,
// then the app's API calls with a stand-in Supabase Auth.

import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { handleShopifyWebhook } from '../functions/_shared/webhook.ts';
import { handleLoyaltyRequest, type AuthUser } from '../functions/_shared/api.ts';
import { dbTest, type TestDb } from './pg.ts';

const SHOP = '4a6920-67.myshopify.com';
const SECRET = 'whsec-test-only';
const BIG_ORDER = '820982911946154508'; // larger than Number.MAX_SAFE_INTEGER, like Shopify's samples
const BIG_CUSTOMER = '115310627314723954';

// Supabase users the stand-in Auth knows, by access token.
const PAT = { id: '6f9619ff-8b86-4011-b42d-00c04fc964ff', email: 'pat@example.com' };
const SAM = { id: '0b5e3a3c-7f1d-4c2e-9a77-2f3f6a1d9c10', email: 'sam@example.com' };
const USERS: Record<string, AuthUser> = {
  'token-pat': { ...PAT, emailConfirmed: true, methods: ['otp'], providers: ['email'] },
  'token-sam': { ...SAM, email: 'Sam@Example.com', emailConfirmed: true, methods: ['otp'], providers: ['email'] },
};

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))));
}

async function deliver(t: TestDb, topic: string, body: string, webhookId: string, signature?: string) {
  const res = await handleShopifyWebhook(
    new Request('https://ref.supabase.co/functions/v1/shopify-webhook', {
      method: 'POST',
      body,
      headers: {
        'x-shopify-hmac-sha256': signature ?? (await sign(body)),
        'x-shopify-topic': topic,
        'x-shopify-shop-domain': SHOP,
        'x-shopify-webhook-id': webhookId,
        'content-type': 'application/json',
      },
    }),
    { secret: SECRET, shopDomain: SHOP, currency: 'SGD', allowTestOrders: false, db: t.db },
  );
  return { status: res.status, body: await res.json() };
}

// Raw JSON text as Shopify sends it: numeric ids beyond 2^53, money as strings.
const paidBody = (orderId: string, email: string, subtotal: string, gids = true) => `{
  "id": ${orderId},
  ${gids ? `"admin_graphql_api_id": "gid://shopify/Order/${orderId}",` : ''}
  "name": "#1042", "test": false, "financial_status": "paid", "currency": "SGD",
  "processed_at": "2026-10-01T11:00:00+08:00",
  "subtotal_price": "${subtotal}",
  "subtotal_price_set": {"shop_money": {"amount": "${subtotal}", "currency_code": "SGD"}, "presentment_money": {"amount": "${subtotal}", "currency_code": "SGD"}},
  "total_price": "999.00",
  "email": "${email}",
  "customer": {"id": ${BIG_CUSTOMER}, ${gids ? `"admin_graphql_api_id": "gid://shopify/Customer/${BIG_CUSTOMER}",` : ''} "email": "${email}"}
}`;

const refundBody = (refundId: string, orderId: string, amount: string) => `{
  "id": ${refundId}, "order_id": ${orderId},
  "admin_graphql_api_id": "gid://shopify/Refund/${refundId}",
  "refund_line_items": [{"id": 1, "quantity": 1, "subtotal": ${amount}, "subtotal_set": {"shop_money": {"amount": "${amount}", "currency_code": "SGD"}}}],
  "refund_shipping_lines": [], "order_adjustments": [],
  "transactions": [{"kind": "refund", "status": "success", "amount": "${amount}", "order_id": ${orderId}}]
}`;

function api(t: TestDb) {
  const cfg = {
    db: t.db,
    // The stand-in Auth: these users exist in auth.users, as they would in Supabase.
    getUser: async (token: string) => {
      const user = USERS[token];
      if (!user) return null;
      await t.sql`insert into auth.users (id, email, email_confirmed_at) values (${user.id}, ${user.email}, now()) on conflict do nothing`;
      return user;
    },
    allowedOrigins: ['https://momominibot.github.io'],
  };
  return {
    async me(token: string) {
      const res = await handleLoyaltyRequest(new Request('https://ref.supabase.co/functions/v1/loyalty/me', { headers: { Authorization: 'Bearer ' + token } }), cfg);
      return { status: res.status, body: await res.json() };
    },
    async claim(token: string, code: string) {
      const res = await handleLoyaltyRequest(new Request('https://ref.supabase.co/functions/v1/loyalty/referral', {
        method: 'POST', body: JSON.stringify({ code }), headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      }), cfg);
      return { status: res.status, body: await res.json() };
    },
  };
}

dbTest('signed orders/paid with 18-digit ids lands on the exact order, waiting for its customer', async (t) => {
  const r = await deliver(t, 'orders/paid', paidBody(BIG_ORDER, 'PAT@example.com', '250.00'), 'wh-1');
  assertEquals(r, { status: 200, body: { outcome: 'stored_until_sign_up' } });
  const [row] = await t.sql`select order_id::text as o, shopify_customer_id::text as c, customer_email as e from loyalty.orders`;
  assertEquals(row, { o: BIG_ORDER, c: BIG_CUSTOMER, e: 'pat@example.com' });

  // Same body without GIDs: ids come from the raw numbers, still exact.
  await deliver(t, 'orders/paid', paidBody('820982911946154509', 'pat@example.com', '10.00', false), 'wh-2');
  const [row2] = await t.sql`select order_id::text as o from loyalty.orders where amount_cents = 1000`;
  assertEquals(row2.o, '820982911946154509');

  // Shopify retry of the first delivery.
  assertEquals((await deliver(t, 'orders/paid', paidBody(BIG_ORDER, 'pat@example.com', '250.00'), 'wh-1')).body.outcome, 'duplicate_delivery');
});

dbTest('tampered or unsigned bodies change nothing', async (t) => {
  const body = paidBody(BIG_ORDER, 'pat@example.com', '250.00');
  const forged = body.replace('250.00', '25000.00');
  assertEquals((await deliver(t, 'orders/paid', forged, 'wh-x', await sign(body))).status, 401);
  assertEquals((await deliver(t, 'orders/paid', body, 'wh-y', 'AAAA')).status, 401);
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.orders`;
  assertEquals(n, 0);
});

dbTest('app flow: order before sign-up, refund, referral, all through the handlers', async (t) => {
  const a = api(t);
  await deliver(t, 'orders/paid', paidBody(BIG_ORDER, 'pat@example.com', '120.50'), 'wh-1');
  await deliver(t, 'refunds/create', refundBody('890088186047892319', BIG_ORDER, '20.50'), 'wh-2');

  const me = await a.me('token-pat'); // first sign-in links the waiting order
  assertEquals(me.status, 200);
  assertEquals([me.body.member.memberId, me.body.member.email], [PAT.id, PAT.email]);
  assertEquals(me.body.member.points, 100);
  assertEquals(me.body.member.totalSpentCents, 10000);
  assertEquals(me.body.member.orders.map((o: { orderId: string; points: number }) => [o.orderId, o.points]), [[BIG_ORDER, 100]]);

  assertEquals((await a.me('forged')).status, 401);

  // Pat has orders, so cannot claim; Sam (no orders) can claim Pat's code, once.
  const code = me.body.member.referralCode;
  const theirs = (await a.me('token-sam')).body.member.referralCode;
  assertEquals(await a.claim('token-pat', theirs), { status: 422, body: { outcome: 'not_new_customer' } });
  assertEquals(await a.claim('token-sam', code), { status: 200, body: { outcome: 'pending' } });
  assertEquals(await a.claim('token-sam', code), { status: 422, body: { outcome: 'already_claimed' } });

  // Sam's first order (email in another case) completes the referral.
  const done = await deliver(t, 'orders/paid', paidBody('6252199051413', 'Sam@Example.com', '30.00'), 'wh-3');
  assertEquals(done.body.referral, 'completed');
  assertEquals((await a.me('token-pat')).body.member.points, 200);
  assertEquals((await a.me('token-pat')).body.member.referralsCompleted, 1);
  assertEquals((await a.me('token-sam')).body.member.points, 130);
});
