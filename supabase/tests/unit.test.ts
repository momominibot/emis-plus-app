// Unit tests for the edge-function core. No database, no network.
// Run: supabase/tests/run.sh   (or: cd supabase && deno test --config deno.json tests/unit.test.ts)

import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1.0.13';
import { idFrom, moneyToCents, normalizeEmail, parseJsonLossless, parsePaidOrder, parseRefund } from '../functions/_shared/parse.ts';
import { handleShopifyWebhook, verifyShopifyHmac } from '../functions/_shared/webhook.ts';
import { handleLoyaltyRequest, mailboxProofAt, type AuthUser } from '../functions/_shared/api.ts';
import type { LoyaltyDb, Member, PaidOrderInput, RefundInput } from '../functions/_shared/types.ts';

const SHOP = '4a6920-67.myshopify.com';

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...mac));
}

function fakeDb(overrides: Partial<LoyaltyDb> = {}) {
  const calls: { paid: PaidOrderInput[]; refunds: RefundInput[]; claims: unknown[][]; members: Member[] } = {
    paid: [], refunds: [], claims: [], members: [],
  };
  const db: LoyaltyDb = {
    recordPaidOrder: async (o) => (calls.paid.push(o), { outcome: 'awarded' }),
    recordRefund: async (r) => (calls.refunds.push(r), { outcome: 'applied' }),
    getMember: async (m) => (calls.members.push(m), { memberId: m.memberId, points: 7 }),
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
    processed_at: '2026-10-01T11:00:00+08:00',
    financial_status: 'paid',
    subtotal_price_set: { shop_money: { amount: '123.45', currency_code: 'SGD' }, presentment_money: { amount: '123.45', currency_code: 'SGD' } },
    email: 'contact@example.com',
    customer: { id: 7012345678901, admin_graphql_api_id: 'gid://shopify/Customer/7012345678901', email: ' X@Example.com ' },
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

Deno.test('normalizeEmail lowercases, trims and rejects non-addresses', () => {
  assertEquals(normalizeEmail('  Pat@Example.COM '), 'pat@example.com');
  for (const bad of ['', 'pat', 'pat@', '@x.com', 'a b@x.com', null, 42]) assertEquals(normalizeEmail(bad), null);
});

Deno.test('parsePaidOrder awards only paid, SGD, non-test orders with an email', () => {
  const opts = { currency: 'SGD', allowTestOrders: false };
  assertEquals(parsePaidOrder(paidPayload(), opts), {
    ok: true, orderId: '6252199051413', email: 'x@example.com', customerId: '7012345678901', orderName: '#1042', amountCents: 12345,
    presentmentCents: 12345, presentmentCurrency: 'SGD', taxesIncluded: true, processedAt: '2026-10-01T11:00:00+08:00',
  });
  const usd = parsePaidOrder(paidPayload({
    taxes_included: false,
    subtotal_price_set: { shop_money: { amount: '135.00', currency_code: 'SGD' }, presentment_money: { amount: '100.00', currency_code: 'USD' } },
  }), opts);
  assertEquals(usd.ok && [usd.amountCents, usd.presentmentCents, usd.presentmentCurrency, usd.taxesIncluded], [13500, 10000, 'USD', false]);
  assertEquals(parsePaidOrder(paidPayload({ test: true }), opts), { ok: false, reason: 'ignored_test_order' });
  assertEquals(parsePaidOrder(paidPayload({ test: true }), { ...opts, allowTestOrders: true }).ok, true);
  // Guest checkout: no customer, the order's contact email is used.
  const guest = parsePaidOrder(paidPayload({ customer: null }), opts);
  assertEquals(guest.ok && [guest.email, guest.customerId], ['contact@example.com', null]);
  assertEquals(parsePaidOrder(paidPayload({ customer: null, email: null, contact_email: 'not an email' }), opts), { ok: false, reason: 'ignored_no_email' });
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

Deno.test('parseRefund reports items, tax, money returned and shipping separately', () => {
  const opts = { currency: 'SGD' };
  const money = (amount: string | number, currency_code = 'SGD') => ({ shop_money: { amount, currency_code } });
  const base = { admin_graphql_api_id: 'gid://shopify/Refund/890088186047892319', order_id: '820982911946154508' };
  const ids = { refundId: '890088186047892319', orderId: '820982911946154508' };
  assertEquals(
    parseRefund({
      ...base,
      refund_line_items: [
        { subtotal_set: money('89.99'), total_tax_set: money('0.00') },
        { subtotal_set: money('19.99'), total_tax_set: money('1.80') },
      ],
      transactions: [
        { kind: 'refund', status: 'success', amount: '100.00', currency: 'SGD' },
        { kind: 'refund', status: 'pending', amount: '20.00', currency: 'SGD' },
        { kind: 'refund', status: 'failure', amount: '999.00', currency: 'SGD' },
        { kind: 'sale', status: 'success', amount: '999.00' },
      ],
      refund_shipping_lines: [{ subtotal_amount_set: money(8), tax_amount_set: money('0.72') }],
      total_duties_set: money('1.00'),
    }, opts),
    { ok: true, ...ids, lineCents: 10998, lineTaxCents: 180, txCents: 12000, txCurrency: null, otherCents: 972, otherPresentmentCents: null, lineTaxPresentmentCents: null },
  );
  // Legacy shipping adjustment (negative amounts), money returned in the customer's currency.
  assertEquals(
    parseRefund({
      ...base, refund_line_items: [],
      transactions: [{ kind: 'refund', status: 'success', amount: '30.00', currency: 'USD' }],
      order_adjustments: [{ kind: 'shipping_refund', amount_set: money('-5.00'), tax_amount_set: money('-0.45') }],
    }, opts),
    { ok: true, ...ids, lineCents: 0, lineTaxCents: 0, txCents: 3000, txCurrency: 'USD', otherCents: 545, otherPresentmentCents: null, lineTaxPresentmentCents: 0 },
  );
  // Extra fees are not merchandise; shipping tax comes from the shipping line when the refund has no tax amount.
  assertEquals(
    parseRefund({
      ...base,
      refund_line_items: [{ subtotal_set: money('20.00'), total_tax_set: money('0.00') }],
      transactions: [{ kind: 'refund', status: 'success', amount: '40.90' }],
      total_additional_fees_set: money('10.00'),
      refund_shipping_lines: [{
        subtotal_amount_set: money('10.00'),
        shipping_line: { price_set: money('10.00'), tax_lines: [{ price_set: money('0.90') }] },
      }],
    }, opts),
    { ok: true, ...ids, lineCents: 2000, lineTaxCents: 0, txCents: 4090, txCurrency: null, otherCents: 2090, otherPresentmentCents: null, lineTaxPresentmentCents: 0 },
  );
  // Both currencies present: exclusions are reported in the customer's currency too.
  const both = (shop: string, usd: string) => ({ shop_money: { amount: shop, currency_code: 'SGD' }, presentment_money: { amount: usd, currency_code: 'USD' } });
  const fx = parseRefund({
    ...base, refund_line_items: [],
    transactions: [{ kind: 'refund', status: 'success', amount: '5.25', currency: 'USD' }],
    refund_shipping_lines: [{ subtotal_amount_set: both('7.04', '5.25'), tax_amount_set: both('0.00', '0.00') }],
  }, opts);
  assertEquals(fx.ok && [fx.txCents, fx.txCurrency, fx.otherCents, fx.otherPresentmentCents], [525, 'USD', 704, 525]);
  // Discounted shipping: S$20 list price cut to S$10, S$0.90 tax, refunded in full.
  const discounted = parseRefund({
    ...base, refund_line_items: [],
    transactions: [{ kind: 'refund', status: 'success', amount: '10.90' }],
    refund_shipping_lines: [{
      subtotal_amount_set: money('10.00'),
      shipping_line: { price_set: money('20.00'), discounted_price_set: money('10.00'), tax_lines: [{ price_set: money('0.90') }] },
    }],
  }, opts);
  assertEquals(discounted.ok && [discounted.txCents, discounted.otherCents], [1090, 1090]);
  assertEquals(parseRefund({ ...base, refund_line_items: [{ subtotal_set: money('1.00', 'USD') }] }, opts), { ok: false, reason: 'ignored_currency' });
  assertEquals(
    parseRefund({ ...base, transactions: [{ kind: 'refund', status: 'success', amount: '1', currency: 'USD' }, { kind: 'refund', status: 'success', amount: '1', currency: 'SGD' }] }, opts),
    { ok: false, reason: 'invalid_payload' },
  );
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
  assertEquals(calls.paid, [{
    webhookId: 'wh-1', orderId: '6252199051413', email: 'x@example.com', customerId: '7012345678901', orderName: '#1042', amountCents: 12345,
    presentmentCents: 12345, presentmentCurrency: 'SGD', taxesIncluded: true, processedAt: '2026-10-01T11:00:00+08:00',
  }]);
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

const USER_A = '6f9619ff-8b86-d011-b42d-00c04fc964ff';
const T = 1792000000; // an amr timestamp (unix seconds)
const AT = new Date(T * 1000).toISOString();
const user = (id: string, email: string | null, confirmed: boolean, method: string, providers: string[]): AuthUser =>
  ({ id, email, emailConfirmed: confirmed, tokenEmail: email, amr: [{ method, timestamp: T }], providers });
const USERS: Record<string, AuthUser> = {
  'token-a': user(USER_A, 'Pat@Example.com', true, 'otp', ['email']),
  'token-unconfirmed': user('11111111-1111-4111-8111-111111111111', 'new@example.com', false, 'otp', ['email']),
  'token-no-email': user('22222222-2222-4222-8222-222222222222', null, true, 'oauth', ['apple']),
  'token-bad-id': user('not-a-uuid', 'x@example.com', true, 'otp', ['email']),
  'token-google-work': user('33333333-3333-4333-8333-333333333333', 'pat@company.sg', true, 'oauth', ['email', 'google']),
};

function apiCfg(db: LoyaltyDb, getUser: (token: string) => Promise<AuthUser | null> = async (t) => USERS[t] ?? null) {
  const seen: string[] = [];
  return {
    seen,
    cfg: {
      db,
      allowedOrigins: ['https://momominibot.github.io'],
      getUser: (token: string) => (seen.push(token), getUser(token)),
    },
  };
}

const get = (token?: string, origin?: string) =>
  new Request('https://ref.supabase.co/functions/v1/loyalty/me?memberId=someone-else', {
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(origin ? { Origin: origin } : {}) },
  });

Deno.test('api: GET /me uses the user Supabase Auth returns, never ids from the client', async () => {
  const { db, calls } = fakeDb();
  const { cfg, seen } = apiCfg(db);
  const res = await handleLoyaltyRequest(get('token-a', 'https://momominibot.github.io'), cfg);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('access-control-allow-origin'), 'https://momominibot.github.io');
  assertEquals(calls.members, [{ memberId: USER_A, email: 'pat@example.com', proofAt: AT }]);
  assertEquals(seen, ['token-a']);
  assertEquals((await handleLoyaltyRequest(get('stolen'), cfg)).status, 401);
  assertEquals((await handleLoyaltyRequest(get(), cfg)).status, 401);
  assertEquals((await handleLoyaltyRequest(get('token-bad-id'), cfg)).status, 401);
  assertEquals(calls.members.length, 1);
});

Deno.test('api: only confirmed emails reach the ledger', async () => {
  const { db, calls } = fakeDb();
  const { cfg } = apiCfg(db);
  const res = await handleLoyaltyRequest(get('token-unconfirmed'), cfg);
  assertEquals([res.status, (await res.json()).error], [403, 'email_not_confirmed']);
  assertEquals((await handleLoyaltyRequest(get('token-no-email'), cfg)).status, 403);
  assertEquals(calls.members.length, 0);
});

Deno.test('api: mailbox proof comes from how the user signed in, not the provider flag', async () => {
  const { db, calls } = fakeDb();
  const { cfg } = apiCfg(db);
  assertEquals((await handleLoyaltyRequest(get('token-google-work'), cfg)).status, 200);
  assertEquals(calls.members, [{ memberId: '33333333-3333-4333-8333-333333333333', email: 'pat@company.sg', proofAt: null }]);
  const u = (amr: [string, number][], providers: string[], email: string, tokenEmail = email): AuthUser =>
    ({ id: USER_A, email, emailConfirmed: true, tokenEmail, amr: amr.map(([method, timestamp]) => ({ method, timestamp })), providers });
  const iso = (t: number) => new Date(t * 1000).toISOString();
  const cases: [AuthUser, string | null][] = [
    [u([['otp', T]], ['email'], 'pat@company.sg'), iso(T)], // emailed 6-digit code
    [u([['magiclink', T]], ['email'], 'pat@company.sg'), iso(T)],
    [u([['token_refresh', T + 50], ['otp', T]], ['email'], 'pat@company.sg'), iso(T)], // when the code was used, not the refresh
    [u([['oauth', T]], ['google'], 'pat@gmail.com'), iso(T)], // Google runs the mailbox
    [u([['oauth', T]], ['google'], 'pat@googlemail.com'), iso(T)],
    [u([['oauth', T]], ['google'], 'pat@company.sg'), null], // Google only vouched for it once
    [u([['oauth', T]], ['email', 'google'], 'pat@company.sg'), null], // linked to an email user: still not this session
    [u([['oauth', T]], ['apple'], 'x1y2@privaterelay.appleid.com'), iso(T)],
    [u([['oauth', T]], ['apple'], 'pat@icloud.com'), null],
    [u([['otp', T]], ['email'], 'new@company.sg', 'old@company.sg'), null], // token from before the email changed
    [u([['otp', T]], ['email'], 'pat@company.sg', 'PAT@Company.sg '), iso(T)],
    [u([['token_refresh', T]], ['email'], 'pat@company.sg'), null],
    [u([], [], 'pat@gmail.com'), null],
  ];
  for (const [user, want] of cases) assertEquals(mailboxProofAt(user, user.email!), want, JSON.stringify(user));
});

Deno.test('api: referral claims go to the database as the signed-in member', async () => {
  const { db, calls } = fakeDb();
  const { cfg } = apiCfg(db);
  const post = (body: string, token = 'token-a') =>
    handleLoyaltyRequest(new Request('https://x/loyalty/referral', { method: 'POST', body, headers: { Authorization: 'Bearer ' + token } }), cfg);
  assertEquals((await post('{"code":"abcd2345"}')).status, 200);
  assertEquals(calls.claims, [[{ memberId: USER_A, email: 'pat@example.com', proofAt: AT }, 'abcd2345']]);
  assertEquals((await post('{}')).status, 400);
  assertEquals((await post('not json')).status, 400);
  assertEquals((await post(JSON.stringify({ code: 'x'.repeat(2000) }))).status, 413);
  assertEquals((await post('{"code":"ABCD2345"}', 'token-unconfirmed')).status, 403);
  assertEquals(calls.claims.length, 1);
});

Deno.test('api: rejection outcomes return 422', async () => {
  const { db } = fakeDb({ claimReferral: async () => ({ outcome: 'self_referral' }) });
  const { cfg } = apiCfg(db);
  const res = await handleLoyaltyRequest(new Request('https://x/loyalty/referral', { method: 'POST', body: '{"code":"ABCD2345"}', headers: { Authorization: 'Bearer token-a' } }), cfg);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { outcome: 'self_referral' });
});

Deno.test('api: an Auth outage is a 502, a database failure a 500', async () => {
  const down = apiCfg(fakeDb().db, () => Promise.reject(new Error('auth 503')));
  assertEquals((await handleLoyaltyRequest(get('token-a'), down.cfg)).status, 502);
  const broken = apiCfg(fakeDb({ getMember: () => Promise.reject(new Error('db down')) }).db);
  assertEquals((await handleLoyaltyRequest(get('token-a'), broken.cfg)).status, 500);
});

Deno.test('api: CORS allowlist, preflight, routing', async () => {
  const { db, calls } = fakeDb();
  const { cfg } = apiCfg(db);
  const evil = await handleLoyaltyRequest(get('token-a', 'https://evil.example'), cfg);
  assertEquals(evil.status, 403);
  assertEquals(evil.headers.get('access-control-allow-origin'), null);
  const pre = await handleLoyaltyRequest(new Request('https://x/loyalty/me', { method: 'OPTIONS', headers: { Origin: 'https://momominibot.github.io' } }), cfg);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get('access-control-allow-headers'), 'authorization, content-type, apikey, x-client-info');
  assertEquals((await handleLoyaltyRequest(new Request('https://x/loyalty/admin', { headers: { Authorization: 'Bearer token-a' } }), cfg)).status, 404);
  assertEquals((await handleLoyaltyRequest(new Request('https://x/loyalty/me', { method: 'POST', headers: { Authorization: 'Bearer token-a' } }), cfg)).status, 405);
  assertEquals(calls.members.length, 0);
});
