// End to end: signed Shopify webhook bodies -> handler -> real Postgres,
// then the app's API calls with a stand-in Customer Account API.

import { assertEquals } from 'jsr:@std/assert@1.0.13';
import { handleShopifyWebhook } from '../functions/_shared/webhook.ts';
import { handleLoyaltyRequest } from '../functions/_shared/api.ts';
import { dbTest, type TestDb } from './pg.ts';

const SHOP = '4a6920-67.myshopify.com';
const SECRET = 'whsec-test-only';
const BIG_ORDER = '820982911946154508'; // larger than Number.MAX_SAFE_INTEGER, like Shopify's samples
const BIG_CUSTOMER = '115310627314723954';
const OTHER_CUSTOMER = '7012345678901';

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
const paidBody = (orderId: string, customerId: string, subtotal: string, gids = true) => `{
  "id": ${orderId},
  ${gids ? `"admin_graphql_api_id": "gid://shopify/Order/${orderId}",` : ''}
  "name": "#1042", "test": false, "financial_status": "paid", "currency": "SGD",
  "subtotal_price": "${subtotal}",
  "subtotal_price_set": {"shop_money": {"amount": "${subtotal}", "currency_code": "SGD"}, "presentment_money": {"amount": "${subtotal}", "currency_code": "SGD"}},
  "total_price": "999.00",
  "customer": {"id": ${customerId}, ${gids ? `"admin_graphql_api_id": "gid://shopify/Customer/${customerId}",` : ''} "email": "someone@example.com"}
}`;

const refundBody = (refundId: string, orderId: string, amount: string) => `{
  "id": ${refundId}, "order_id": ${orderId},
  "admin_graphql_api_id": "gid://shopify/Refund/${refundId}",
  "refund_line_items": [{"id": 1, "quantity": 1, "subtotal": ${amount}, "subtotal_set": {"shop_money": {"amount": "${amount}", "currency_code": "SGD"}}}],
  "refund_shipping_lines": [], "order_adjustments": [],
  "transactions": [{"kind": "refund", "status": "success", "amount": "${amount}", "order_id": ${orderId}}]
}`;

function api(t: TestDb) {
  const tokens: Record<string, { id: string; orders: number }> = {
    'token-big': { id: BIG_CUSTOMER, orders: 1 },
    'token-new': { id: OTHER_CUSTOMER, orders: 0 },
  };
  const fakeShopify = (async (_u: unknown, init?: RequestInit) => {
    const who = tokens[new Headers(init?.headers).get('authorization') || ''];
    if (!who) return new Response('{"errors":"Unauthorized"}', { status: 401 });
    const orders = Array.from({ length: who.orders }, (_, i) => ({ id: 'gid://shopify/Order/' + (i + 1) }));
    return Response.json({ data: { customer: { id: 'gid://shopify/Customer/' + who.id, orders: { nodes: orders } } } });
  }) as typeof fetch;
  const cfg = { db: t.db, customerApiUrl: 'https://shopify.test/graphql', allowedOrigins: ['https://momominibot.github.io'], fetch: fakeShopify };
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

dbTest('signed orders/paid with 18-digit ids lands on the exact order and customer', async (t) => {
  const r = await deliver(t, 'orders/paid', paidBody(BIG_ORDER, BIG_CUSTOMER, '250.00'), 'wh-1');
  assertEquals(r, { status: 200, body: { outcome: 'awarded', points: 250, balance: 250, referral: null } });
  const [row] = await t.sql`select order_id::text as o, customer_id::text as c from loyalty.orders`;
  assertEquals(row, { o: BIG_ORDER, c: BIG_CUSTOMER });

  // Same body without GIDs: ids come from the raw numbers, still exact.
  const r2 = await deliver(t, 'orders/paid', paidBody('820982911946154509', BIG_CUSTOMER, '10.00', false), 'wh-2');
  assertEquals(r2.body.outcome, 'awarded');
  const [row2] = await t.sql`select order_id::text as o from loyalty.orders where amount_cents = 1000`;
  assertEquals(row2.o, '820982911946154509');

  // Shopify retry of the first delivery.
  assertEquals((await deliver(t, 'orders/paid', paidBody(BIG_ORDER, BIG_CUSTOMER, '250.00'), 'wh-1')).body.outcome, 'duplicate_delivery');
});

dbTest('tampered or unsigned bodies change nothing', async (t) => {
  const body = paidBody(BIG_ORDER, BIG_CUSTOMER, '250.00');
  const forged = body.replace('250.00', '25000.00');
  assertEquals((await deliver(t, 'orders/paid', forged, 'wh-x', await sign(body))).status, 401);
  assertEquals((await deliver(t, 'orders/paid', body, 'wh-y', 'AAAA')).status, 401);
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.members`;
  assertEquals(n, 0);
});

dbTest('app flow: order, refund, referral, all through the handlers', async (t) => {
  const a = api(t);
  await deliver(t, 'orders/paid', paidBody(BIG_ORDER, BIG_CUSTOMER, '120.50'), 'wh-1');
  await deliver(t, 'refunds/create', refundBody('890088186047892319', BIG_ORDER, '20.50'), 'wh-2');

  const me = await a.me('token-big');
  assertEquals(me.status, 200);
  assertEquals(me.body.member.customerId, BIG_CUSTOMER);
  assertEquals(me.body.member.points, 100);
  assertEquals(me.body.member.totalSpentCents, 10000);
  assertEquals(me.body.member.transactions.map((x: { points: number }) => x.points), [-20, 120]);

  assertEquals((await a.me('forged')).status, 401);

  // The big-id customer already has orders, so cannot claim; the new one can claim the big one's code.
  const code = me.body.member.referralCode;
  const theirs = (await a.me('token-new')).body.member.referralCode;
  assertEquals(await a.claim('token-big', theirs), { status: 422, body: { outcome: 'not_new_customer' } });
  assertEquals(await a.claim('token-new', code), { status: 200, body: { outcome: 'pending' } });
  assertEquals(await a.claim('token-new', code), { status: 422, body: { outcome: 'already_claimed' } });

  const done = await deliver(t, 'orders/paid', paidBody('6252199051413', OTHER_CUSTOMER, '30.00'), 'wh-3');
  assertEquals(done.body.referral, 'completed');
  assertEquals((await a.me('token-big')).body.member.points, 200);
  assertEquals((await a.me('token-big')).body.member.referralsCompleted, 1);
  assertEquals((await a.me('token-new')).body.member.points, 130);
});
