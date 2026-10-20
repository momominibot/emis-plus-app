// Unit tests for the edge-function core. No database, no network.
// Run: supabase/tests/run.sh   (or: cd supabase && deno test --config deno.json tests/unit.test.ts)

import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1.0.13';
import { idFrom, moneyToCents, parseJsonLossless, parsePaidOrder, parseRefund } from '../functions/_shared/parse.ts';
import { handleShopifyWebhook, verifyShopifyHmac } from '../functions/_shared/webhook.ts';
import { handleLoyaltyRequest } from '../functions/_shared/api.ts';
import type { LoyaltyDb, PaidOrderInput, RefundInput } from '../functions/_shared/types.ts';

const SHOP = '4a6920-67.myshopify.com';

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...mac));
}

function fakeDb(overrides: Partial<LoyaltyDb> = {}) {
  const calls: { paid: PaidOrderInput[]; refunds: RefundInput[]; claims: unknown[][]; members: string[] } = {
    paid: [], refunds: [], claims: [], members: [],
  };
  const db: LoyaltyDb = {
    recordPaidOrder: async (o) => (calls.paid.push(o), { outcome: 'awarded' }),
    recordRefund: async (r) => (calls.refunds.push(r), { outcome: 'applied' }),
    getMember: async (id) => (calls.members.push(id), { customerId: id, points: 7 }),
    claimReferral: async (...args) => (calls.claims.push(args), { outcome: 'pending' }),
    ...overrides,
  };
  return { db, calls };
}

function paidPayload(extra: Record<string, unknown> = {}) {
  return {
    id: 6252199051413,
    admin_graphql_api_id: 'gid://shopify/Order/6252199051413',
    name: '#1042',
    test: false,
    financial_status: 'paid',
    subtotal_price_set: { shop_money: { amount: '123.45', currency_code: 'SGD' }, presentment_money: { amount: '123.45', currency_code: 'SGD' } },
    customer: { id: 7012345678901, admin_graphql_api_id: 'gid://shopify/Customer/7012345678901', email: 'x@example.com' },
    ...extra,
  };
}

// ------------------------------------------------------------------ parsing

Deno.test('moneyToCents parses decimal strings exactly', () => {
  assertEquals(moneyToCents('404.95'), 40495);
  assertEquals(moneyToCents('0.1'), 10);
  assertEquals(moneyToCents('7'), 700);
  assertEquals(moneyToCents('19.999'), 1999);
  assertEquals(moneyToCents(5), 500);
  assertEquals(moneyToCents(3.65), 365);
  for (const bad of ['-1.00', '1e3', '', 'abc', null, undefined, '1.2.3', NaN]) {
    assertThrows(() => moneyToCents(bad));
  }
});

Deno.test('idFrom accepts exact ids and matching gids only', () => {
  assertEquals(idFrom(6252199051413), '6252199051413');
  assertEquals(idFrom('820982911946154508'), '820982911946154508');
  assertEquals(idFrom('gid://shopify/Customer/115310627314723954', 'Customer'), '115310627314723954');
  assertThrows(() => idFrom('gid://shopify/Order/1', 'Customer'));
  assertThrows(() => idFrom(820982911946154508)); // unsafe number: precision already lost
  assertThrows(() => idFrom('0'));
  assertThrows(() => idFrom('-5'));
  assertThrows(() => idFrom('99999999999999999999')); // beyond bigint
  assertThrows(() => idFrom(1.5));
});

Deno.test('parseJsonLossless keeps ids beyond MAX_SAFE_INTEGER exact', () => {
  const parsed = parseJsonLossless('{"id":820982911946154508,"order_id":820982911946154508,"small":42,"price":89.99}') as Record<string, unknown>;
  assertEquals(parsed.id, '820982911946154508');
  assertEquals(parsed.order_id, '820982911946154508');
  assertEquals(parsed.small, 42);
  assertEquals(parsed.price, 89.99);
  // Plain JSON.parse would have changed the id:
  assert(String(JSON.parse('{"id":820982911946154508}').id) !== '820982911946154508');
});

Deno.test('parsePaidOrder awards only paid, SGD, non-test, customer orders', () => {
  const opts = { currency: 'SGD', allowTestOrders: false };
  assertEquals(parsePaidOrder(paidPayload(), opts), {
    ok: true, orderId: '6252199051413', customerId: '7012345678901', orderName: '#1042', amountCents: 12345,
  });
  assertEquals(parsePaidOrder(paidPayload({ test: true }), opts), { ok: false, reason: 'ignored_test_order' });
  assertEquals(parsePaidOrder(paidPayload({ test: true }), { ...opts, allowTestOrders: true }).ok, true);
  assertEquals(parsePaidOrder(paidPayload({ customer: null }), opts), { ok: false, reason: 'ignored_guest_checkout' });
  for (const status of ['pending', 'authorized', 'partially_paid', 'voided', 'expired', undefined]) {
    assertEquals(parsePaidOrder(paidPayload({ financial_status: status }), opts), { ok: false, reason: 'ignored_not_paid' });
  }
  assertEquals(parsePaidOrder(paidPayload({ financial_status: 'partially_refunded' }), opts).ok, true);
  assertEquals(
    parsePaidOrder(paidPayload({ subtotal_price_set: { shop_money: { amount: '10.00', currency_code: 'USD' } } }), opts),
    { ok: false, reason: 'ignored_currency' },
  );
  assertEquals(parsePaidOrder(paidPayload({ subtotal_price_set: null }), opts), { ok: false, reason: 'invalid_payload' });
  assertEquals(
    parsePaidOrder(paidPayload({ admin_graphql_api_id: undefined, id: 820982911946154508 }), opts),
    { ok: false, reason: 'invalid_payload' },
    'a lossy numeric id must be rejected, not guessed',
  );
});

Deno.test('parseRefund counts refunded merchandise, never shipping', () => {
  const opts = { currency: 'SGD' };
  const money = (amount: string | number) => ({ shop_money: { amount, currency_code: 'SGD' } });
  const base = { id: 890088186047892319n.toString(), admin_graphql_api_id: 'gid://shopify/Refund/890088186047892319', order_id: '820982911946154508' };
  assertEquals(
    parseRefund({ ...base, refund_line_items: [{ subtotal_set: money('89.99') }, { subtotal_set: money('19.99') }], transactions: [{ kind: 'refund', status: 'success', amount: '200.00' }] }, opts),
    { ok: true, refundId: '890088186047892319', orderId: '820982911946154508', amountCents: 10998 },
  );
  // Shipping-only refund: transaction covers shipping, so nothing is clawed back.
  assertEquals(
    parseRefund({ ...base, refund_line_items: [], transactions: [{ kind: 'refund', status: 'success', amount: '8.00', currency: 'SGD' }], refund_shipping_lines: [{ subtotal_amount_set: money(8) }] }, opts),
    { ok: true, refundId: '890088186047892319', orderId: '820982911946154508', amountCents: 0 },
  );
  // Amount-only refund with shipping inside it (legacy order adjustment), failed transactions ignored.
  assertEquals(
    parseRefund({
      ...base, refund_line_items: [],
      transactions: [
        { kind: 'refund', status: 'success', amount: '30.00', currency: null },
        { kind: 'refund', status: 'failure', amount: '30.00' },
      ],
      order_adjustments: [{ kind: 'shipping_refund', amount_set: money('-5.00') }],
    }, opts),
    { ok: true, refundId: '890088186047892319', orderId: '820982911946154508', amountCents: 2500 },
  );
  assertEquals(parseRefund({ ...base, refund_line_items: [{ subtotal_set: { shop_money: { amount: '1.00', currency_code: 'USD' } } }] }, opts), { ok: false, reason: 'ignored_currency' });
  assertEquals(parseRefund({ ...base, order_id: 'nope' }, opts), { ok: false, reason: 'invalid_payload' });
});

// --------------------------------------------------------------------- HMAC

Deno.test('verifyShopifyHmac matches the RFC 4231 style known vector', async () => {
  // HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
  const hex = 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8';
  const b64 = btoa(String.fromCharCode(...hex.match(/../g)!.map((h) => parseInt(h, 16))));
  const body = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
  assert(await verifyShopifyHmac(body, b64, 'key'));
  assert(!(await verifyShopifyHmac(body, b64, 'other-key')));
  assert(!(await verifyShopifyHmac(new TextEncoder().encode('The quick brown fox jumps over the lazy cog'), b64, 'key')));
  assert(!(await verifyShopifyHmac(body, null, 'key')));
  assert(!(await verifyShopifyHmac(body, 'not base64!!', 'key')));
  assert(!(await verifyShopifyHmac(body, b64, '')));
});

// ------------------------------------------------------------ webhook handler

function webhookRequest(body: string, headers: Record<string, string>) {
  return new Request('https://example.supabase.co/functions/v1/shopify-webhook', { method: 'POST', body, headers });
}

Deno.test('webhook: signed orders/paid is passed to the database', async () => {
  const { db, calls } = fakeDb();
  const body = JSON.stringify(paidPayload());
  const res = await handleShopifyWebhook(webhookRequest(body, {
    'x-shopify-hmac-sha256': await sign(body, 's3cret'), 'x-shopify-topic': 'orders/paid',
    'x-shopify-shop-domain': SHOP, 'x-shopify-webhook-id': 'wh-1',
  }), { secret: 's3cret', shopDomain: SHOP, currency: 'SGD', allowTestOrders: false, db });
  assertEquals(res.status, 200);
  assertEquals(calls.paid, [{ webhookId: 'wh-1', orderId: '6252199051413', customerId: '7012345678901', orderName: '#1042', amountCents: 12345 }]);
});

Deno.test('webhook: rejects bad signatures, other shops, missing secret, wrong method', async () => {
  const { db, calls } = fakeDb();
  const cfg = { secret: 's3cret', shopDomain: SHOP, currency: 'SGD', allowTestOrders: false, db };
  const body = JSON.stringify(paidPayload());
  const good = await sign(body, 's3cret');
  const h = { 'x-shopify-topic': 'orders/paid', 'x-shopify-shop-domain': SHOP };

  assertEquals((await handleShopifyWebhook(webhookRequest(body, h), cfg)).status, 401);
  assertEquals((await handleShopifyWebhook(webhookRequest(body + ' ', { ...h, 'x-shopify-hmac-sha256': good }), cfg)).status, 401);
  assertEquals((await handleShopifyWebhook(webhookRequest(body, { ...h, 'x-shopify-hmac-sha256': await sign(body, 'guess') }), cfg)).status, 401);
  assertEquals((await handleShopifyWebhook(webhookRequest(body, { ...h, 'x-shopify-hmac-sha256': good, 'x-shopify-shop-domain': 'evil.myshopify.com' }), cfg)).status, 403);
  assertEquals((await handleShopifyWebhook(webhookRequest(body, { ...h, 'x-shopify-hmac-sha256': good }), { ...cfg, secret: '' })).status, 503);
  assertEquals((await handleShopifyWebhook(new Request('https://x/', { method: 'GET' }), cfg)).status, 405);
  assertEquals(calls.paid.length, 0);
});

Deno.test('webhook: unknown topics are acknowledged; database failures ask Shopify to retry', async () => {
  const body = JSON.stringify(paidPayload());
  const sig = await sign(body, 's3cret');
  const ok = fakeDb();
  const r1 = await handleShopifyWebhook(webhookRequest(body, { 'x-shopify-hmac-sha256': sig, 'x-shopify-topic': 'orders/create', 'x-shopify-shop-domain': SHOP }),
    { secret: 's3cret', shopDomain: SHOP, currency: 'SGD', allowTestOrders: false, db: ok.db });
  assertEquals(r1.status, 200);
  assertEquals((await r1.json()).outcome, 'ignored_topic');

  const failing = fakeDb({ recordPaidOrder: () => Promise.reject(new Error('connection reset')) });
  const r2 = await handleShopifyWebhook(webhookRequest(body, { 'x-shopify-hmac-sha256': sig, 'x-shopify-topic': 'orders/paid', 'x-shopify-shop-domain': SHOP }),
    { secret: 's3cret', shopDomain: SHOP, currency: 'SGD', allowTestOrders: false, db: failing.db });
  assertEquals(r2.status, 500);
});

// ---------------------------------------------------------------- loyalty API

type FakeShopify = (token: string, query: string, headers: Headers) => Response;

function shopifyFetch(handler: FakeShopify): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const { query } = JSON.parse(String(init?.body));
    return handler(headers.get('authorization') || '', query, headers);
  }) as typeof fetch;
}

const customerResponse = (id: string, orders?: unknown[]) =>
  Response.json({ data: { customer: { id: 'gid://shopify/Customer/' + id, ...(orders ? { orders: { nodes: orders } } : {}) } } });

function apiCfg(db: LoyaltyDb, handler: FakeShopify) {
  return { db, customerApiUrl: 'https://shopify.com/1/account/customer/api/2026-10/graphql', allowedOrigins: ['https://momominibot.github.io'], fetch: shopifyFetch(handler) };
}

Deno.test('api: GET /me resolves the customer through Shopify, never from the client', async () => {
  const { db, calls } = fakeDb();
  const seen: { token: string; origin: string | null }[] = [];
  const cfg = apiCfg(db, (token, _q, headers) => {
    seen.push({ token, origin: headers.get('origin') });
    return token === 'good-token' ? customerResponse('7012345678901') : new Response('{}', { status: 401 });
  });
  const res = await handleLoyaltyRequest(new Request('https://x/functions/v1/loyalty/me?customerId=999', {
    headers: { Authorization: 'Bearer good-token', Origin: 'https://momominibot.github.io' },
  }), cfg);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), 'https://momominibot.github.io');
  assertEquals(calls.members, ['7012345678901']);
  assertEquals(seen, [{ token: 'good-token', origin: 'https://momominibot.github.io' }]);

  const bad = await handleLoyaltyRequest(new Request('https://x/loyalty/me', { headers: { Authorization: 'Bearer stolen' } }), cfg);
  assertEquals(bad.status, 401);
  const none = await handleLoyaltyRequest(new Request('https://x/loyalty/me'), cfg);
  assertEquals(none.status, 401);
  assertEquals(calls.members.length, 1);
});

Deno.test('api: referral claims pass Shopify order history to the database', async () => {
  const { db, calls } = fakeDb();
  const cfg = apiCfg(db, (token) =>
    token === 'new' ? customerResponse('11', []) : customerResponse('22', [{ id: 'gid://shopify/Order/5' }]));
  const post = (token: string, body: string) =>
    handleLoyaltyRequest(new Request('https://x/loyalty/referral', { method: 'POST', body, headers: { Authorization: 'Bearer ' + token } }), cfg);
  assertEquals((await post('new', '{"code":"abcd2345"}')).status, 200);
  assertEquals((await post('old', '{"code":"ABCD2345"}')).status, 200);
  assertEquals(calls.claims, [['11', 'abcd2345', false], ['22', 'ABCD2345', true]]);
  assertEquals((await post('new', '{}')).status, 400);
  assertEquals((await post('new', 'not json')).status, 400);
  assertEquals((await post('new', JSON.stringify({ code: 'x'.repeat(2000) }))).status, 413);
});

Deno.test('api: rejection outcomes return 422', async () => {
  const { db } = fakeDb({ claimReferral: async () => ({ outcome: 'self_referral' }) });
  const cfg = apiCfg(db, () => customerResponse('11', []));
  const res = await handleLoyaltyRequest(new Request('https://x/loyalty/referral', { method: 'POST', body: '{"code":"ABCD2345"}', headers: { Authorization: 'Bearer t' } }), cfg);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { outcome: 'self_referral' });
});

Deno.test('api: Shopify outages and auth errors are told apart', async () => {
  const { db } = fakeDb();
  const req = () => new Request('https://x/loyalty/me', { headers: { Authorization: 'Bearer t' } });
  assertEquals((await handleLoyaltyRequest(req(), apiCfg(db, () => new Response('oops', { status: 503 })))).status, 502);
  assertEquals((await handleLoyaltyRequest(req(), apiCfg(db, () => Response.json({ errors: [{ message: 'x', extensions: { code: 'UNAUTHENTICATED' } }] })))).status, 401);
  assertEquals((await handleLoyaltyRequest(req(), apiCfg(db, () => Response.json({ errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] })))).status, 502);
  assertEquals((await handleLoyaltyRequest(req(), apiCfg(db, () => Response.json({ data: { customer: null } })))).status, 401);
  assertEquals((await handleLoyaltyRequest(req(), apiCfg(db, () => Response.json({ data: { customer: { id: 'gid://shopify/Order/1' } } })))).status, 502);
  const throwing = { ...apiCfg(db, () => customerResponse('1')), fetch: (() => Promise.reject(new TypeError('dns'))) as typeof fetch };
  assertEquals((await handleLoyaltyRequest(req(), throwing)).status, 502);
});

Deno.test('api: CORS allowlist, preflight, routing', async () => {
  const { db, calls } = fakeDb();
  const cfg = apiCfg(db, () => customerResponse('1'));
  const evil = await handleLoyaltyRequest(new Request('https://x/loyalty/me', { headers: { Authorization: 'Bearer t', Origin: 'https://evil.example' } }), cfg);
  assertEquals(evil.status, 403);
  assertEquals(evil.headers.get('access-control-allow-origin'), null);
  const pre = await handleLoyaltyRequest(new Request('https://x/loyalty/me', { method: 'OPTIONS', headers: { Origin: 'https://momominibot.github.io' } }), cfg);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get('access-control-allow-headers'), 'authorization, content-type');
  assertEquals((await handleLoyaltyRequest(new Request('https://x/loyalty/admin', { headers: { Authorization: 'Bearer t' } }), cfg)).status, 404);
  assertEquals((await handleLoyaltyRequest(new Request('https://x/loyalty/me', { method: 'POST', headers: { Authorization: 'Bearer t' } }), cfg)).status, 405);
  assertEquals(calls.members.length, 0);
});
