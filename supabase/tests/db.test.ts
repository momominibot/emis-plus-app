// Database rules against a real Postgres 17 (run via supabase/tests/run.sh).

import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1.0.13';
import { dbTest, type TestDb } from './pg.ts';

let seq = 0;
const wh = () => `wh-${Date.now()}-${seq++}`;

function paid(t: TestDb, order: number | string, customer: number | string, cents: number, webhookId: string | null = wh()) {
  return t.db.recordPaidOrder({ webhookId, orderId: String(order), customerId: String(customer), orderName: `#${order}`, amountCents: cents });
}
/** Item refund: `cents` of refunded line items, the same money returned. */
function refund(t: TestDb, refundId: number | string, order: number | string, cents: number, webhookId: string | null = wh()) {
  return t.db.recordRefund({
    webhookId, refundId: String(refundId), orderId: String(order),
    lineCents: cents, lineTaxCents: 0, txCents: cents, txCurrency: null, otherCents: 0,
  });
}
type RefundParts = {
  lineCents?: number; lineTaxCents?: number; txCents?: number; txCurrency?: string | null; otherCents?: number;
  otherPresentmentCents?: number | null; lineTaxPresentmentCents?: number | null;
};
function refundParts(t: TestDb, refundId: number, order: number, parts: RefundParts) {
  return t.db.recordRefund({
    webhookId: wh(), refundId: String(refundId), orderId: String(order),
    lineCents: 0, lineTaxCents: 0, txCents: 0, txCurrency: null, otherCents: 0, ...parts,
  });
}
/** What Shopify does with a 5xx: deliver again. */
async function paidRetrying(t: TestDb, order: number, customer: number, cents: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await paid(t, order, customer, cents);
    } catch (err) {
      if (attempt < 5 && /referral changed while locking|deadlock/.test(String(err))) continue;
      throw err;
    }
  }
}
// deno-lint-ignore no-explicit-any
const member = async (t: TestDb, c: number | string) => (await t.db.getMember(String(c))) as any;
const points = async (t: TestDb, c: number | string) => (await member(t, c)).points as number;

/** Balance always equals the ledger sum, and balance_after runs in order. */
async function assertLedgerConsistent(t: TestDb) {
  const rows = await t.sql`
    select m.customer_id::text as c, m.points::text as p,
           coalesce((select sum(points) from loyalty.ledger l where l.customer_id = m.customer_id), 0)::text as s
      from loyalty.members m`;
  for (const r of rows) assertEquals(r.p, r.s, `member ${r.c} balance vs ledger`);
  const chain = await t.sql`
    select customer_id::text as c, balance_after::text as b,
           (sum(points) over (partition by customer_id order by id))::text as running
      from loyalty.ledger`;
  for (const r of chain) assertEquals(r.b, r.running, `balance_after chain for ${r.c}`);
}

// ------------------------------------------------------------------- earning

dbTest('paid order earns floor(subtotal) points and creates the member', async (t) => {
  const r = await paid(t, 1001, 42, 12345);
  assertEquals(r, { outcome: 'awarded', points: 123, balance: 123, referral: null });
  const m = await member(t, 42);
  assertEquals(m.customerId, '42');
  assertEquals(m.points, 123);
  assertEquals(m.tier, 'silver');
  assertEquals(m.totalSpentCents, 12345);
  assertMatch(m.referralCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assertEquals(m.referredStatus, null);
  assertEquals(m.transactions.length, 1);
  assertEquals(m.transactions[0].kind, 'order');
  assertEquals(m.transactions[0].description, 'Order #1001');
  await assertLedgerConsistent(t);
});

dbTest('the same order is awarded once whatever the delivery', async (t) => {
  assertEquals((await paid(t, 2001, 7, 5000, 'wh-a')).outcome, 'awarded');
  assertEquals((await paid(t, 2001, 7, 5000, 'wh-a')).outcome, 'duplicate_delivery');
  assertEquals((await paid(t, 2001, 7, 5000, 'wh-b')).outcome, 'already_awarded');
  assertEquals((await paid(t, 2001, 7, 99999, null)).outcome, 'already_awarded');
  assertEquals(await points(t, 7), 50);
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.webhook_events`;
  assertEquals(n, 2);
});

dbTest('tier multiplier comes from lifetime spend before the order', async (t) => {
  await paid(t, 1, 5, 49999); // 499 points, spend now S$499.99
  assertEquals((await paid(t, 2, 5, 1)).points, 0); // 1 cent at 1x, spend reaches S$500
  assertEquals((await paid(t, 3, 5, 333)).points, 4); // 1.5x: floor(4.995)
  assertEquals((await member(t, 5)).tier, 'gold');
  await paid(t, 4, 5, 149667); // 1.5x -> floor(2245.005) = 2245, spend S$2000.00
  assertEquals((await member(t, 5)).tier, 'diamond');
  assertEquals((await paid(t, 5, 5, 1050)).points, 21); // 2x
  assertEquals(await points(t, 5), 499 + 0 + 4 + 2245 + 21);
  await assertLedgerConsistent(t);
});

dbTest('SQL tiers match TIER_CONFIG in lib/types.ts', async (t) => {
  const src = await Deno.readTextFile(new URL('../../lib/types.ts', import.meta.url));
  const tier = (name: string) => {
    const block = new RegExp(name + `:\\s*\\{[^}]*?minSpend:\\s*(\\d+)[^}]*?pointsMultiplier:\\s*([\\d.]+)`, 's').exec(src);
    assert(block, 'TIER_CONFIG.' + name + ' not found');
    return { minCents: Number(block[1]) * 100, x10: Math.round(Number(block[2]) * 10) };
  };
  for (const name of ['silver', 'gold', 'diamond']) {
    const { minCents, x10 } = tier(name);
    const [row] = await t.sql`select loyalty.multiplier_x10(${minCents}) as m, loyalty.tier(${minCents}) as t`;
    assertEquals(row.m, x10, name + ' multiplier');
    assertEquals(row.t, name);
    if (minCents > 0) {
      const [below] = await t.sql`select loyalty.tier(${minCents - 1}) as t`;
      assert(below.t !== name, name + ' threshold is exclusive below');
    }
  }
});

// ------------------------------------------------------------------- refunds

dbTest('partial refunds claw back exactly what the refunded part earned', async (t) => {
  await paid(t, 1, 9, 50000); // reach gold first
  await paid(t, 77, 9, 10001); // 1.5x: floor(150.015) = 150
  const before = await points(t, 9);
  assertEquals((await refund(t, 501, 77, 3333)).clawed_back, 50); // keeps floor(66.68*1.5)=100
  assertEquals((await refund(t, 502, 77, 3333)).clawed_back, 50); // keeps 50
  assertEquals((await refund(t, 502, 77, 3333, 'other-delivery')).clawed_back, 0); // same refund id again
  assertEquals((await refund(t, 503, 77, 999999)).clawed_back, 50); // capped at the order
  assertEquals(await points(t, 9), before - 150);
  assertEquals((await member(t, 9)).totalSpentCents, 50000);
  const [o] = await t.sql`select refunded_cents::int as r, points_clawed as c from loyalty.orders where order_id = 77`;
  assertEquals(o, { r: 10001, c: 150 });
  await assertLedgerConsistent(t);
});

dbTest('a refund that arrives before the award is applied when the award lands', async (t) => {
  assertEquals((await refund(t, 601, 88, 2000)).outcome, 'stored_until_order_awarded');
  const r = await paid(t, 88, 3, 5000);
  assertEquals(r.points, 50);
  assertEquals(await points(t, 3), 30);
  assertEquals((await member(t, 3)).totalSpentCents, 3000);
  await assertLedgerConsistent(t);
});

dbTest('refunds for orders that never earned touch nobody', async (t) => {
  assertEquals((await refund(t, 701, 999, 5000)).outcome, 'stored_until_order_awarded');
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.members`;
  assertEquals(n, 0);
});

// ----------------------------------------------------------------- referrals

async function codeOf(t: TestDb, c: number) {
  return (await member(t, c)).referralCode as string;
}

dbTest('referral codes are validated and single use', async (t) => {
  const alice = await codeOf(t, 100);
  assertEquals(await t.db.claimReferral('200', 'NOPE', false), { outcome: 'invalid_code' });
  assertEquals(await t.db.claimReferral('200', 'ABCDEFGH', false), { outcome: 'invalid_code' }); // well-formed, unknown
  assertEquals(await t.db.claimReferral('100', alice, false), { outcome: 'self_referral' });
  assertEquals(await t.db.claimReferral('200', alice, true), { outcome: 'not_new_customer' }); // Shopify says has orders
  await paid(t, 5, 300, 1000);
  assertEquals(await t.db.claimReferral('300', alice, false), { outcome: 'not_new_customer' }); // we saw a paid order
  assertEquals(await t.db.claimReferral('200', '  ' + alice.toLowerCase() + ' ', false), { outcome: 'pending' });
  assertEquals(await t.db.claimReferral('200', alice, false), { outcome: 'already_claimed' });
  const bob = await codeOf(t, 400);
  assertEquals(await t.db.claimReferral('200', bob, false), { outcome: 'already_claimed' });
  // 200 cannot refer 100 back... 100 referred 200, so 100 claiming 200's code is mutual.
  assertEquals(await t.db.claimReferral('100', await codeOf(t, 200), false), { outcome: 'mutual_referral' });
  assertEquals((await member(t, 200)).referredStatus, 'pending');
  assertEquals((await member(t, 100)).referralsPending, 1);
  assertEquals(await points(t, 100), 0); // nothing is paid for a claim
  assertEquals(await points(t, 200), 0);
});

dbTest('both bonuses arrive with the first paid order, once', async (t) => {
  const code = await codeOf(t, 1);
  await t.db.claimReferral('2', code, false);
  const r = await paid(t, 10, 2, 2500);
  assertEquals(r, { outcome: 'awarded', points: 25, balance: 125, referral: 'completed' });
  assertEquals(await points(t, 1), 100);
  assertEquals((await member(t, 1)).referralsCompleted, 1);
  assertEquals((await member(t, 2)).referredStatus, 'completed');
  assertEquals((await paid(t, 11, 2, 2500)).referral, null);
  assertEquals(await points(t, 1), 100);
  assertEquals(await points(t, 2), 150);
  await assertLedgerConsistent(t);
});

dbTest('a free first order does not complete a referral', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  assertEquals((await paid(t, 10, 2, 0)).referral, null);
  assertEquals((await member(t, 2)).referredStatus, 'pending');
  assertEquals((await paid(t, 11, 2, 100)).referral, 'completed');
});

dbTest('fully refunding the qualifying order reverses both bonuses', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  await paid(t, 10, 2, 4000); // 40 + 100 welcome; referrer +100
  await refund(t, 900, 10, 1000); // partial: bonuses stay
  assertEquals((await member(t, 2)).referredStatus, 'completed');
  assertEquals(await points(t, 1), 100);
  await refund(t, 901, 10, 3000); // now nothing of the order is kept
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  assertEquals(await points(t, 1), 0);
  assertEquals(await points(t, 2), 0);
  assertEquals((await member(t, 1)).referralsCompleted, 0);
  await refund(t, 901, 10, 3000, 'replayed'); // replay changes nothing
  assertEquals(await points(t, 2), 0);
  // Still one claim per customer for life.
  assertEquals(await t.db.claimReferral('2', await codeOf(t, 3), false), { outcome: 'already_claimed' });
  await assertLedgerConsistent(t);
});

// ------------------------------------------------------------ arrival order

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

function paidAt(t: TestDb, order: number, customer: number, cents: number, processedAt: string) {
  return t.db.recordPaidOrder({
    webhookId: wh(), orderId: String(order), customerId: String(customer), orderName: '#' + order,
    amountCents: cents, processedAt,
  });
}

dbTest('final balances do not depend on the order webhooks arrive in', async (t) => {
  // Paid in this order: A S$450, B S$100, C S$200; A later part-refunded S$80.
  // Spend before B is S$370 and before C S$470, so every order earns 1x.
  const runs = permutations(['A', 'B', 'C', 'refundA']);
  assertEquals(runs.length, 24);
  for (const [k, run] of runs.entries()) {
    const referrer = 10_000 + k * 10, referee = referrer + 1, base = 100_000 + k * 10;
    await t.db.claimReferral(String(referee), await codeOf(t, referrer), false);
    for (const event of run) {
      if (event === 'A') await paidAt(t, base + 1, referee, 45000, '2026-10-01T10:00:00+08:00');
      if (event === 'B') await paidAt(t, base + 2, referee, 10000, '2026-10-02T10:00:00+08:00');
      if (event === 'C') await paidAt(t, base + 3, referee, 20000, '2026-10-03T10:00:00+08:00');
      if (event === 'refundA') await refund(t, base + 9, base + 1, 8000);
    }
    const m = await member(t, referee);
    assertEquals([m.points, m.totalSpentCents, m.referredStatus], [450 - 80 + 100 + 200 + 100, 67000, 'completed'], run.join(','));
    assertEquals(await points(t, referrer), 100, run.join(','));
  }
  // Without the refund, C is paid after S$550 of spend and earns at gold (1.5x) whatever arrives first.
  for (const [k, run] of permutations(['A', 'B', 'C']).entries()) {
    const customer = 30_000 + k, base = 300_000 + k * 10;
    for (const event of run) {
      if (event === 'A') await paidAt(t, base + 1, customer, 45000, '2026-10-01T10:00:00+08:00');
      if (event === 'B') await paidAt(t, base + 2, customer, 10000, '2026-10-02T10:00:00+08:00');
      if (event === 'C') await paidAt(t, base + 3, customer, 20000, '2026-10-03T10:00:00+08:00');
    }
    assertEquals(await points(t, customer), 450 + 100 + 300, run.join(','));
  }
  await assertLedgerConsistent(t);
});

dbTest('several foreign-currency refunds on one order give the same balance in any arrival order', async (t) => {
  // Review example: A is S$566.67 paid as US$425; two refunds of US$25 against it, then B S$100 paid later.
  const balances = new Set<number>();
  for (const [k, run] of permutations(['A', 'B', 'R1', 'R2']).entries()) {
    const customer = 40_000 + k, base = 400_000 + k * 10;
    for (const event of run) {
      if (event === 'A') {
        await t.db.recordPaidOrder({
          webhookId: wh(), orderId: String(base + 1), customerId: String(customer), orderName: 'A', amountCents: 56667,
          presentmentCents: 42500, presentmentCurrency: 'USD', taxesIncluded: true, processedAt: '2026-10-01T10:00:00+08:00',
        });
      }
      if (event === 'B') await paidAt(t, base + 2, customer, 10000, '2026-10-02T10:00:00+08:00');
      if (event === 'R1') await refundParts(t, base + 5, base + 1, { lineCents: 3334, txCents: 2500, txCurrency: 'USD' });
      if (event === 'R2') await refundParts(t, base + 6, base + 1, { lineCents: 3333, txCents: 2500, txCurrency: 'USD' });
    }
    balances.add(await points(t, customer));
  }
  assertEquals([...balances], [599]);
  await assertLedgerConsistent(t);
});

dbTest('the referral follows the order paid first, even when it arrives last', async (t) => {
  // A (paid first) is refunded in full; B was paid later and kept. The referral rides on A, so it ends reversed.
  for (const [k, run] of permutations(['A', 'B', 'refundA']).entries()) {
    const referrer = 20_000 + k * 10, referee = referrer + 1, base = 200_000 + k * 10;
    await t.db.claimReferral(String(referee), await codeOf(t, referrer), false);
    for (const event of run) {
      if (event === 'A') await paidAt(t, base + 1, referee, 5000, '2026-10-01T10:00:00+08:00');
      if (event === 'B') await paidAt(t, base + 2, referee, 3000, '2026-10-02T10:00:00+08:00');
      if (event === 'refundA') await refund(t, base + 9, base + 1, 5000);
    }
    assertEquals((await member(t, referee)).referredStatus, 'reversed', run.join(','));
    assertEquals(await points(t, referee), 30, run.join(','));
    assertEquals(await points(t, referrer), 0, run.join(','));
  }
  await assertLedgerConsistent(t);
});

dbTest('a late earlier order re-prices the later ones', async (t) => {
  await paidAt(t, 2, 5, 10000, '2026-10-02T10:00:00+08:00'); // arrives first: 1x = 100
  await paidAt(t, 1, 5, 50000, '2026-10-01T10:00:00+08:00'); // paid first: 1x = 500, B now at gold
  assertEquals(await points(t, 5), 500 + 150);
  const m = await member(t, 5);
  assertEquals(m.transactions.map((x: { kind: string; points: number }) => [x.kind, x.points]),
    [['tier_adjustment', 50], ['order', 500], ['order', 100]]);
  await assertLedgerConsistent(t);
});

// --------------------------------------------------------------- concurrency

dbTest('parallel deliveries of one order award it exactly once', async (t) => {
  const results = await Promise.all(Array.from({ length: 24 }, () => paid(t, 3001, 55, 7000)));
  assertEquals(results.filter((r) => r.outcome === 'awarded').length, 1);
  assertEquals(await points(t, 55), 70);
  await assertLedgerConsistent(t);
});

dbTest('a refund racing its own award is applied exactly once', async (t) => {
  // Many independent orders at once, each with its refund racing its award.
  const N = 150;
  await Promise.all(Array.from({ length: N }, (_, i) =>
    Promise.all([refund(t, 8000 + i, 4000 + i, 1500), paid(t, 4000 + i, 6600 + i, 6000)])));
  const [o] = await t.sql`select count(*)::int as n, sum(points_clawed)::int as c from loyalty.orders where refunded_cents = 1500`;
  assertEquals(o, { n: N, c: N * 15 });
  const [{ wrong }] = await t.sql`select count(*)::int as wrong from loyalty.members where points <> 45`;
  assertEquals(wrong, 0);
  const [{ pending }] = await t.sql`select count(*)::int as pending from loyalty.refunds where not applied`;
  assertEquals(pending, 0);
  await assertLedgerConsistent(t);
});

dbTest('two customers claiming each other at once cannot both win', async (t) => {
  for (let i = 0; i < 10; i++) {
    const a = 10 + i * 2, b = 11 + i * 2;
    const [ca, cb] = [await codeOf(t, a), await codeOf(t, b)];
    const out = await Promise.all([t.db.claimReferral(String(a), cb, false), t.db.claimReferral(String(b), ca, false)]);
    assertEquals(out.filter((o) => o.outcome === 'pending').length, 1, JSON.stringify(out));
  }
});

dbTest('a claim racing the first payment never leaves a stranded referral', async (t) => {
  for (let i = 0; i < 12; i++) {
    const referee = 500 + i;
    const code = await codeOf(t, 1);
    await Promise.all([t.db.claimReferral(String(referee), code, false), paidRetrying(t, 9000 + i, referee, 2000)]);
  }
  const [{ stranded }] = await t.sql`
    select count(*)::int as stranded from loyalty.referrals r
     where r.status = 'pending' and exists (select 1 from loyalty.orders o where o.customer_id = r.referee_id and o.amount_cents > 0)`;
  assertEquals(stranded, 0);
  await assertLedgerConsistent(t);
});

dbTest('concurrent first visits create one member with one code', async (t) => {
  const ms = await Promise.all(Array.from({ length: 20 }, () => member(t, 77)));
  assertEquals(new Set(ms.map((m) => m.referralCode)).size, 1);
});

// ------------------------------------------------- refund amounts (review)

dbTest('a first order refunded in full before its payment arrives earns no referral bonus', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  await refund(t, 900, 10, 4000); // refund webhook overtakes orders/paid
  const r = await paid(t, 10, 2, 4000);
  assertEquals(r.referral, 'reversed');
  assertEquals(await points(t, 1), 0);
  assertEquals(await points(t, 2), 0);
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  await assertLedgerConsistent(t);
});

dbTest('amount-only refunds count, minus shipping, shipping tax and duties', async (t) => {
  await paid(t, 10, 2, 10000); // 100 points
  // S$30 returned, of which S$8 shipping and S$0.72 shipping tax: S$21.28 of goods.
  assertEquals((await refundParts(t, 1, 10, { txCents: 3000, otherCents: 872 })).clawed_back, 22); // keeps floor(78.72)
  // Shipping-only refund takes nothing.
  assertEquals((await refundParts(t, 2, 10, { txCents: 500, otherCents: 500 })).clawed_back, 0);
  const [r] = await t.sql`select amount_cents::int as a from loyalty.refunds where refund_id = 1`;
  assertEquals(r.a, 2128);
});

dbTest('extra money returned on top of refunded items is clawed back too', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  await paid(t, 10, 2, 10000);
  // S$20 of items plus an S$80 goodwill adjustment: the whole order was refunded.
  await refundParts(t, 1, 10, { lineCents: 2000, txCents: 10000 });
  assertEquals(await points(t, 2), 0);
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
});

dbTest('refunds paid in the customer currency convert at the order rate', async (t) => {
  await t.db.recordPaidOrder({
    webhookId: wh(), orderId: '10', customerId: '2', orderName: '#10', amountCents: 13500,
    presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true,
  }); // S$135 = US$100 -> 135 points
  assertEquals((await refundParts(t, 1, 10, { txCents: 4000, txCurrency: 'USD' })).clawed_back, 54); // US$40 = S$54
  // A currency we cannot convert falls back to the refunded items' subtotal (none here).
  assertEquals((await refundParts(t, 2, 10, { txCents: 4000, txCurrency: 'EUR' })).clawed_back, 0);
});

dbTest('refunding a foreign-currency order in parts still adds up to a full refund', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  await t.db.recordPaidOrder({
    webhookId: wh(), orderId: '10', customerId: '2', orderName: '#10', amountCents: 10000,
    presentmentCents: 7500, presentmentCurrency: 'USD', taxesIncluded: true,
  }); // S$100 paid as US$75
  for (const id of [1, 2, 3]) await refundParts(t, id, 10, { txCents: 2500, txCurrency: 'USD' });
  const [o] = await t.sql`select refunded_cents::int as r, refunded_presentment_cents::int as p from loyalty.orders`;
  assertEquals(o, { r: 10000, p: 7500 }); // per-part rounding would leave 9999
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  assertEquals(await points(t, 1), 0);
  assertEquals(await points(t, 2), 0);
});

dbTest('a shipping refund between foreign-currency part refunds cannot keep the bonuses', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  await t.db.recordPaidOrder({
    webhookId: wh(), orderId: '10', customerId: '2', orderName: '#10', amountCents: 13500,
    presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true,
  }); // S$135 of goods paid as US$100
  await refundParts(t, 1, 10, { txCents: 3335, txCurrency: 'USD' });
  await refundParts(t, 2, 10, { txCents: 741, txCurrency: 'USD', otherCents: 1001 }); // shipping only
  await refundParts(t, 3, 10, { txCents: 6665, txCurrency: 'USD' });
  const [o] = await t.sql`select amount_cents - refunded_cents as kept from loyalty.orders`;
  assert(Number(o.kept) < 100, 'at most a rounding cent is left: ' + o.kept);
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  assertEquals(await points(t, 1), 0);
});

dbTest('a shipping refund in between never changes what the goods refunds add up to', async (t) => {
  // Review example: S$134 of goods paid as US$100, S$7.04 shipping paid as US$5.25.
  async function keptAfter(withShipping: boolean, presentmentGiven: boolean) {
    const order = withShipping ? (presentmentGiven ? 21 : 22) : 20;
    const customer = 100 + order;
    await t.db.recordPaidOrder({
      webhookId: wh(), orderId: String(order), customerId: String(customer), orderName: '#' + order, amountCents: 13400,
      presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true,
    });
    await refundParts(t, order * 10 + 1, order, { txCents: 2500, txCurrency: 'USD' });
    if (withShipping) {
      await refundParts(t, order * 10 + 2, order, {
        txCents: 525, txCurrency: 'USD', otherCents: 704, otherPresentmentCents: presentmentGiven ? 525 : null,
      });
    }
    await refundParts(t, order * 10 + 3, order, { txCents: 7426, txCurrency: 'USD' });
    const [o] = await t.sql`select (amount_cents - refunded_cents)::int as kept from loyalty.orders where order_id = ${order}`;
    return o.kept;
  }
  const plain = await keptAfter(false, false);
  assertEquals(plain, 99);
  assertEquals(await keptAfter(true, true), plain);
  assertEquals(await keptAfter(true, false), plain);
});

dbTest('referrals need a first order of at least S$1 that keeps at least S$1', async (t) => {
  await t.db.claimReferral('2', await codeOf(t, 1), false);
  assertEquals((await paid(t, 10, 2, 99)).referral, null);
  assertEquals((await paid(t, 11, 2, 500)).referral, 'completed');
  await refund(t, 1, 11, 400); // S$1.00 kept: bonuses stay
  assertEquals((await member(t, 2)).referredStatus, 'completed');
  await refund(t, 2, 11, 1); // S$0.99 kept: reversed
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  await assertLedgerConsistent(t);
});

dbTest('tax-exclusive orders do not count item tax as merchandise', async (t) => {
  await t.db.recordPaidOrder({
    webhookId: wh(), orderId: '10', customerId: '2', orderName: '#10', amountCents: 10000, taxesIncluded: false,
  });
  // Items S$50 + S$4.50 tax returned as one S$54.50 transaction.
  assertEquals((await refundParts(t, 1, 10, { lineCents: 5000, lineTaxCents: 450, txCents: 5450 })).clawed_back, 50);
});

dbTest('a full refund racing repeated claims never deadlocks', async (t) => {
  for (let i = 0; i < 10; i++) {
    const referrer = 1000 + i * 2, referee = 1001 + i * 2;
    const code = await codeOf(t, referrer);
    await t.db.claimReferral(String(referee), code, false);
    await paid(t, 7000 + i, referee, 3000);
    const out = await Promise.all([
      refund(t, 7500 + i, 7000 + i, 3000),
      t.db.claimReferral(String(referee), code, false),
      t.db.claimReferral(String(referee), code, false),
    ]);
    assertEquals(out[0].outcome, 'applied');
    assertEquals((await member(t, referee)).referredStatus, 'reversed');
  }
  await assertLedgerConsistent(t);
});

// --------------------------------------------------------------- privileges

dbTest('API roles cannot read or call anything in the loyalty schema', async (t) => {
  await paid(t, 1, 1, 1000);
  for (const role of ['anon', 'authenticated', 'service_role'] as const) {
    const conn = await t.as(role);
    await assertRejects(() => conn`select * from loyalty.members`, Error, 'permission denied');
    await assertRejects(() => conn`select loyalty.get_member(1)`, Error, 'permission denied');
    await assertRejects(() => conn`select loyalty.record_paid_order('x', 2, 1, 'x', 100000)`, Error, 'permission denied');
  }
});

dbTest('referral codes are well formed and unique across many members', async (t) => {
  await t.sql`select loyalty.ensure_member(g) from generate_series(1, 3000) g`;
  const [r] = await t.sql`
    select count(*)::int as n, count(distinct referral_code)::int as d,
           bool_and(referral_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$') as ok
      from loyalty.members`;
  assertEquals(r, { n: 3000, d: 3000, ok: true });
  const [chars] = await t.sql`
    select count(distinct c)::int as used from loyalty.members, regexp_split_to_table(referral_code, '') c`;
  assertEquals(chars.used, 32);
});
