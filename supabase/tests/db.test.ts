// Database rules against a real Postgres 17 (run via supabase/tests/run.sh).

import { assert, assertEquals, assertMatch, assertRejects } from 'jsr:@std/assert@1.0.13';
import { dbTest, type TestDb } from './pg.ts';

let seq = 0;
const wh = () => `wh-${Date.now()}-${seq++}`;

// Customer n is the Supabase user uid(n) with the confirmed email mail(n).
const uid = (n: number | string) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mail = (n: number | string) => `c${n}@example.com`;
const now = () => new Date().toISOString();
/** Customer n signed in; proven: with an emailed code just now (the default), or not (Google on a company address). */
const who = (n: number | string, proven = true, email = mail(n)) => ({ memberId: uid(n), email, proofAt: proven ? now() : null });
/** Customer n exists in (stand-in) Supabase Auth with a confirmed email. */
const authUser = (t: TestDb, n: number | string, email = mail(n)) =>
  t.sql`insert into auth.users (id, email, email_confirmed_at) values (${uid(n)}, ${email}, now()) on conflict do nothing`;
/**
 * Supabase Auth changes customer n's email: 'confirmed' is its own email
 * change flow (email_change becomes email), 'direct' is any other update
 * (identity promotion after unlinking, an admin edit).
 */
async function changeEmail(t: TestDb, n: number | string, email: string, how: 'confirmed' | 'direct' = 'confirmed') {
  if (how === 'confirmed') {
    await t.sql`update auth.users set email_change = ${email} where id = ${uid(n)}`;
    await t.sql`update auth.users set email = email_change, email_change = '' where id = ${uid(n)}`;
  } else {
    await t.sql`update auth.users set email = ${email} where id = ${uid(n)}`;
  }
}
/**
 * The customer opens the app signed in (creates the member, links waiting
 * orders when the sign-in proves the mailbox).
 */
async function signIn(t: TestDb, n: number | string, proven = true) {
  await authUser(t, n);
  return t.db.getMember(who(n, proven));
}
/** Customer n (signed in, as the app always is before a claim) enters a referral code. */
async function claim(t: TestDb, n: number | string, code: string, proven = true) {
  await signIn(t, n, proven);
  return t.db.claimReferral(who(n, proven), code);
}

/** orders/paid for customer n's email, with the customer already signed up. */
async function paid(t: TestDb, order: number | string, customer: number | string, cents: number, webhookId: string | null = wh()) {
  await signIn(t, customer);
  return t.db.recordPaidOrder({ webhookId, orderId: String(order), email: mail(customer), customerId: null, orderName: `#${order}`, amountCents: cents });
}
type OrderExtras = { presentmentCents?: number; presentmentCurrency?: string; taxesIncluded?: boolean; processedAt?: string };
async function paidWith(t: TestDb, order: number, customer: number, cents: number, extras: OrderExtras) {
  await signIn(t, customer);
  return t.db.recordPaidOrder({
    webhookId: wh(), orderId: String(order), email: mail(customer), customerId: null, orderName: '#' + order,
    amountCents: cents, ...extras,
  });
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
const member = async (t: TestDb, c: number | string, proven = true) => (await signIn(t, c, proven)) as any;
/** What customer n sees when signed in (proven) with the address Auth now has. */
// deno-lint-ignore no-explicit-any
const memberAs = async (t: TestDb, n: number, email: string, proofAt: string | null = now()) =>
  (await t.db.getMember({ memberId: uid(n), email, proofAt })) as any;
const points = async (t: TestDb, c: number | string) => (await member(t, c)).points as number;

/** Balance always equals the ledger sum, and balance_after runs in order. */
async function assertLedgerConsistent(t: TestDb) {
  const rows = await t.sql`
    select m.member_id::text as c, m.points::text as p,
           coalesce((select sum(points) from loyalty.ledger l where l.member_id = m.member_id), 0)::text as s
      from loyalty.members m`;
  for (const r of rows) assertEquals(r.p, r.s, `member ${r.c} balance vs ledger`);
  const chain = await t.sql`
    select member_id::text as c, balance_after::text as b,
           (sum(points) over (partition by member_id order by id))::text as running
      from loyalty.ledger`;
  for (const r of chain) assertEquals(r.b, r.running, `balance_after chain for ${r.c}`);
}

// ------------------------------------------------------------------- earning

dbTest('paid order earns floor(subtotal) points and creates the member', async (t) => {
  const r = await paid(t, 1001, 42, 12345);
  assertEquals(r, { outcome: 'awarded', points: 123, balance: 123, referral: null });
  const m = await member(t, 42);
  assertEquals([m.memberId, m.email], [uid(42), mail(42)]);
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
  assertEquals((await paid(t, 2001, 7, 5000, 'wh-b')).outcome, 'already_recorded');
  assertEquals((await paid(t, 2001, 7, 99999, null)).outcome, 'already_recorded');
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

// ------------------------------------------------------------- identity

dbTest('orders placed before sign-up wait for the member and are awarded on first sign-in', async (t) => {
  const r = await t.db.recordPaidOrder({
    webhookId: wh(), orderId: '501', email: '  C7@Example.COM ', customerId: '7012345678901', orderName: '#501', amountCents: 12000,
  });
  assertEquals(r, { outcome: 'stored_until_sign_up' });
  await refund(t, 9001, 501, 2000); // a refund before sign-up too
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.members`;
  assertEquals(n, 0);
  const m = await member(t, 7); // signs in as c7@example.com
  assertEquals(m.points, 100);
  assertEquals(m.totalSpentCents, 10000);
  assertEquals(m.orders.map((o: { orderId: string; points: number; refundedCents: number }) => [o.orderId, o.points, o.refundedCents]), [['501', 100, 2000]]);
  const [row] = await t.sql`select shopify_customer_id::text as s from loyalty.members`;
  assertEquals(row.s, '7012345678901');
  // A later order for the same email is awarded straight away.
  assertEquals((await t.db.recordPaidOrder({ webhookId: wh(), orderId: '502', email: mail(7), customerId: null, orderName: '#502', amountCents: 500 })).outcome, 'awarded');
  assertEquals(await points(t, 7), 105);
  await assertLedgerConsistent(t);
});

dbTest('guest checkouts count by email; other emails never reach the member', async (t) => {
  await signIn(t, 8);
  await t.db.recordPaidOrder({ webhookId: wh(), orderId: '601', email: mail(8), customerId: null, orderName: '#601', amountCents: 3000 });
  await t.db.recordPaidOrder({ webhookId: wh(), orderId: '602', email: 'someone.else@example.com', customerId: null, orderName: '#602', amountCents: 9000 });
  assertEquals(await points(t, 8), 30);
  const [o] = await t.sql`select member_id from loyalty.orders where order_id = 602`;
  assertEquals(o.member_id, null);
});

dbTest('a known order or an earlier-customer email blocks referral claims', async (t) => {
  const code = await codeOf(t, 1);
  await t.db.recordPaidOrder({ webhookId: wh(), orderId: '701', email: mail(2), customerId: null, orderName: '#701', amountCents: 3000 });
  assertEquals(await claim(t, 2, code), { outcome: 'not_new_customer' }); // waiting order with their email
  await t.sql`insert into loyalty.prior_customers values (${mail(3)})`;
  assertEquals(await claim(t, 3, code), { outcome: 'not_new_customer' });
  assertEquals(await claim(t, 4, code), { outcome: 'pending' });
});

const order = (t: TestDb, id: number, email: string, cents: number) =>
  t.db.recordPaidOrder({ webhookId: wh(), orderId: String(id), email, customerId: null, orderName: '#' + id, amountCents: cents });

dbTest('a member who changes email keeps their orders and picks up the new email ones', async (t) => {
  await paid(t, 801, 9, 2000);
  await order(t, 802, 'new9@example.com', 1000);
  await changeEmail(t, 9, 'NEW9@example.com');
  const m = await memberAs(t, 9, 'new9@example.com');
  assertEquals([m.email, m.ordersLinked, m.points], ['new9@example.com', true, 30]);
});

dbTest('a sign-in that does not prove the mailbox sees nothing, even on a proven member', async (t) => {
  assertEquals((await order(t, 901, mail(11), 4000)).outcome, 'stored_until_sign_up');
  const m = await member(t, 11, false); // Google on a company address
  assertEquals([m.email, m.ordersLinked, m.points, m.orders.length, m.referralCode], [mail(11), false, 0, 0, null]);
  assertEquals((await order(t, 902, mail(11), 1000)).outcome, 'stored_until_sign_up');
  const proven = await member(t, 11, true); // signs in with an emailed code
  assertEquals([proven.ordersLinked, proven.points, proven.orders.length], [true, 50, 2]);
  // Supabase links a later Google sign-in on the same address to this user:
  // that session gets nothing, though orders keep reaching the member.
  const google = await member(t, 11, false);
  assertEquals([google.ordersLinked, google.points, google.transactions.length, google.referralCode], [false, 0, 0, null]);
  assertEquals((await order(t, 903, mail(11), 1000)).outcome, 'awarded');
  assertEquals((await member(t, 11, true)).points, 60);
});

dbTest('an email change in Supabase Auth moves the binding at once', async (t) => {
  await paid(t, 1101, 12, 2000);
  await changeEmail(t, 12, 'new12@example.com');
  const [row] = await t.sql`select email, email_proven_at is not null as proven from loyalty.members where member_id = ${uid(12)}`;
  assertEquals(row, { email: 'new12@example.com', proven: true });
  // The old address now belongs to nobody, so its next order waits for whoever signs up with it.
  assertEquals((await order(t, 1102, mail(12), 3000)).outcome, 'stored_until_sign_up');
  assertEquals((await order(t, 1103, 'new12@example.com', 1000)).outcome, 'awarded');
  await authUser(t, 13, mail(12));
  const newcomer = await memberAs(t, 13, mail(12));
  assertEquals([newcomer.points, newcomer.orders.map((o: { orderId: string }) => o.orderId)], [30, ['1102']]);
  assertEquals((await memberAs(t, 12, 'new12@example.com')).points, 30); // keeps 1101 and earns 1103
});

dbTest('an address Auth moved without a confirmation needs a sign-in after the move', async (t) => {
  const before = new Date(Date.now() - 60_000).toISOString(); // an emailed code a minute ago
  await authUser(t, 30);
  await t.db.getMember({ memberId: uid(30), email: mail(30), proofAt: before });
  await changeEmail(t, 30, 'promoted@example.com', 'direct'); // e.g. identity promotion after unlinking
  const [row] = await t.sql`select email, email_proven_at, email_unproven_since is not null as moved from loyalty.members where member_id = ${uid(30)}`;
  assertEquals(row, { email: 'promoted@example.com', email_proven_at: null, moved: true });
  assertEquals((await order(t, 3001, 'promoted@example.com', 2000)).outcome, 'stored_until_sign_up');
  const old = await memberAs(t, 30, 'promoted@example.com', before); // the session from before the move
  assertEquals([old.ordersLinked, old.points], [false, 0]);
  assertEquals((await t.db.claimReferral({ memberId: uid(30), email: 'promoted@example.com', proofAt: before }, 'ABCDEFGH')).outcome, 'email_not_proven');
  const fresh = await memberAs(t, 30, 'promoted@example.com', new Date(Date.now() + 1000).toISOString());
  assertEquals([fresh.ordersLinked, fresh.points], [true, 20]);
});

dbTest('a sign-in that read the old address cannot undo an email change', async (t) => {
  await signIn(t, 14);
  await changeEmail(t, 14, 'new14@example.com');
  // The API looked the user up just before the change and still says c14.
  const m = await memberAs(t, 14, mail(14));
  assertEquals([m.email, m.ordersLinked], ['new14@example.com', false]);
  assertEquals((await order(t, 1401, mail(14), 1000)).outcome, 'stored_until_sign_up');
  // Nor can a caller name an address Auth never gave them.
  await signIn(t, 15);
  const other = await memberAs(t, 15, 'new14@example.com');
  assertEquals([other.email, other.ordersLinked], [mail(15), false]);
  assertEquals((await order(t, 1402, 'new14@example.com', 1000)).outcome, 'awarded');
  assertEquals((await memberAs(t, 14, 'new14@example.com')).points, 10);
});

dbTest('deleting a Supabase user releases their address', async (t) => {
  await paid(t, 1601, 16, 2000);
  await t.sql`delete from auth.users where id = ${uid(16)}`;
  const [row] = await t.sql`select email, email_proven_at from loyalty.members where member_id = ${uid(16)}`;
  assertEquals(row, { email: null, email_proven_at: null });
  assertEquals((await order(t, 1602, mail(16), 1000)).outcome, 'stored_until_sign_up');
  await authUser(t, 17, mail(16));
  assertEquals((await memberAs(t, 17, mail(16))).points, 10);
});

dbTest('a soft delete (obfuscated email) succeeds and releases the address', async (t) => {
  await paid(t, 3101, 31, 2000);
  // What auth.admin.deleteUser(id, true) writes: a hash instead of the email, and deleted_at.
  await t.sql`update auth.users set email = 'a1b2c3d4e5', deleted_at = now() where id = ${uid(31)}`;
  const [row] = await t.sql`select email, email_proven_at from loyalty.members where member_id = ${uid(31)}`;
  assertEquals(row, { email: null, email_proven_at: null });
  assertEquals((await order(t, 3102, mail(31), 1000)).outcome, 'stored_until_sign_up');
});

dbTest('Auth giving an address to someone releases any stale holder', async (t) => {
  await signIn(t, 19);
  await signIn(t, 18);
  // A stale binding (for example restored from a backup) on member 19.
  await t.sql`update loyalty.members set email = 'shared@example.com', email_proven_at = now() where member_id = ${uid(19)}`;
  await changeEmail(t, 18, 'shared@example.com');
  const rows = await t.sql`select member_id::text as id, email, email_proven_at is not null as proven from loyalty.members order by member_id`;
  assertEquals([...rows], [
    { id: uid(18), email: 'shared@example.com', proven: true },
    { id: uid(19), email: null, proven: false },
  ]);
  assertEquals((await order(t, 1801, 'shared@example.com', 1000)).outcome, 'awarded');
  assertEquals((await memberAs(t, 18, 'shared@example.com')).points, 10);
});

/** Waits until another session is blocked on a lock, or `done` settles (then nobody waited). */
async function lockWaitOrDone(t: TestDb, done: Promise<unknown>) {
  let settled = false;
  done.then(() => (settled = true), () => (settled = true));
  for (let i = 0; i < 300 && !settled; i++) {
    const [w] = await t.sql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()`;
    if (w.n > 0) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

dbTest('the email trigger locks members in id order, like a referral claim', async (t) => {
  // Member 21 (lower id) takes over an address member 22 still holds. A
  // referral claim between them locks 21 then 22; the trigger must too.
  await signIn(t, 21);
  await signIn(t, 22);
  await t.sql`update loyalty.members set email = 'taken@example.com', email_proven_at = now() where member_id = ${uid(22)}`;
  const claimer = await t.sql.reserve();
  let change: Promise<unknown> = Promise.resolve(null);
  try {
    await claimer`begin`;
    await claimer`select 1 from loyalty.members where member_id = ${uid(21)} for update`;
    change = t.sql`update auth.users set email = 'taken@example.com' where id = ${uid(21)}`.execute().then(() => null, (err) => err);
    assert(await lockWaitOrDone(t, change), 'the email change never waited for the claim');
    // Deadlocks if the trigger took member 22 before 21.
    await claimer`select 1 from loyalty.members where member_id = ${uid(22)} for update`;
    await claimer`commit`;
  } finally {
    await claimer`rollback`.catch(() => {});
    claimer.release();
  }
  assertEquals(await change, null);
  const [row] = await t.sql`select email from loyalty.members where member_id = ${uid(21)}`;
  assertEquals(row.email, 'taken@example.com');
});

dbTest('a first sign-in racing an email change ends on the new address (sign-in first)', async (t) => {
  await authUser(t, 40);
  const signin = await t.sql.reserve();
  let change: Promise<unknown> = Promise.resolve(null);
  try {
    await signin`begin`;
    // Creates member 40 bound to the old address, not yet committed.
    await signin`select loyalty.get_member(${uid(40)}::uuid, ${mail(40)}, ${now()}::timestamptz)`;
    await t.sql`update auth.users set email_change = 'moved40@example.com' where id = ${uid(40)}`;
    change = t.sql`update auth.users set email = email_change, email_change = '' where id = ${uid(40)}`.execute()
      .then(() => null, (err) => err);
    await lockWaitOrDone(t, change);
    await signin`commit`;
  } finally {
    await signin`rollback`.catch(() => {});
    signin.release();
  }
  assertEquals(await change, null);
  const [row] = await t.sql`select email, email_proven_at is not null as proven from loyalty.members where member_id = ${uid(40)}`;
  assertEquals(row, { email: 'moved40@example.com', proven: true });
  assertEquals((await order(t, 4001, mail(40), 1000)).outcome, 'stored_until_sign_up');
});

dbTest('a first sign-in racing an email change ends on the new address (Auth first)', async (t) => {
  await authUser(t, 41);
  const auth = await t.sql.reserve();
  let signin: Promise<unknown> = Promise.resolve(null);
  try {
    await auth`begin`;
    await auth`update auth.users set email_change = 'moved41@example.com' where id = ${uid(41)}`;
    await auth`update auth.users set email = email_change, email_change = '' where id = ${uid(41)}`;
    // The API read the old address just before; the change is not committed yet.
    signin = t.db.getMember({ memberId: uid(41), email: mail(41), proofAt: now() }).then((r) => r, (err) => err);
    await lockWaitOrDone(t, signin);
    await auth`commit`;
  } finally {
    await auth`rollback`.catch(() => {});
    auth.release();
  }
  // deno-lint-ignore no-explicit-any
  const m = (await signin) as any;
  assertEquals(m.ordersLinked, false);
  const [row] = await t.sql`select email, email_proven_at from loyalty.members where member_id = ${uid(41)}`;
  assertEquals(row.email_proven_at, null);
  assert(row.email !== mail(41), 'the old address must not be bound');
  assertEquals((await order(t, 4101, mail(41), 1000)).outcome, 'stored_until_sign_up');
});

dbTest('referral claims need a sign-in that proves the mailbox', async (t) => {
  const code = await codeOf(t, 1);
  await signIn(t, 42, false);
  assertEquals(await claim(t, 42, code, false), { outcome: 'email_not_proven' });
  await signIn(t, 42, true);
  assertEquals(await claim(t, 42, code, true), { outcome: 'pending' });
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
  assertEquals((await refund(t, 601, 88, 2000)).outcome, 'stored_until_order_arrives');
  const r = await paid(t, 88, 3, 5000);
  assertEquals(r.points, 30); // net: 50 earned, 20 for the refund we already knew of
  assertEquals(await points(t, 3), 30);
  assertEquals((await member(t, 3)).totalSpentCents, 3000);
  await assertLedgerConsistent(t);
});

dbTest('refunds for orders that never earned touch nobody', async (t) => {
  assertEquals((await refund(t, 701, 999, 5000)).outcome, 'stored_until_order_arrives');
  const [{ n }] = await t.sql`select count(*)::int as n from loyalty.members`;
  assertEquals(n, 0);
});

// ----------------------------------------------------------------- referrals

async function codeOf(t: TestDb, c: number) {
  return (await member(t, c)).referralCode as string;
}

dbTest('referral codes are validated and single use', async (t) => {
  const alice = await codeOf(t, 100);
  assertEquals(await claim(t, 200, 'NOPE'), { outcome: 'invalid_code' });
  assertEquals(await claim(t, 200, 'ABCDEFGH'), { outcome: 'invalid_code' }); // well-formed, unknown
  assertEquals(await claim(t, 100, alice), { outcome: 'self_referral' });
  await t.sql`insert into loyalty.prior_customers values (${mail(500)})`;
  assertEquals(await claim(t, 500, alice), { outcome: 'not_new_customer' }); // ordered before Health Points began
  await paid(t, 5, 300, 1000);
  assertEquals(await claim(t, 300, alice), { outcome: 'not_new_customer' }); // we saw a paid order
  assertEquals(await claim(t, 200, '  ' + alice.toLowerCase() + ' '), { outcome: 'pending' });
  assertEquals(await claim(t, 200, alice), { outcome: 'already_claimed' });
  const bob = await codeOf(t, 400);
  assertEquals(await claim(t, 200, bob), { outcome: 'already_claimed' });
  // 200 cannot refer 100 back... 100 referred 200, so 100 claiming 200's code is mutual.
  assertEquals(await claim(t, 100, await codeOf(t, 200)), { outcome: 'mutual_referral' });
  assertEquals((await member(t, 200)).referredStatus, 'pending');
  assertEquals((await member(t, 100)).referralsPending, 1);
  assertEquals(await points(t, 100), 0); // nothing is paid for a claim
  assertEquals(await points(t, 200), 0);
});

dbTest('both bonuses arrive with the first paid order, once', async (t) => {
  const code = await codeOf(t, 1);
  await claim(t, 2, code);
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
  await claim(t, 2, await codeOf(t, 1));
  assertEquals((await paid(t, 10, 2, 0)).referral, null);
  assertEquals((await member(t, 2)).referredStatus, 'pending');
  assertEquals((await paid(t, 11, 2, 100)).referral, 'completed');
});

dbTest('fully refunding the qualifying order reverses both bonuses', async (t) => {
  await claim(t, 2, await codeOf(t, 1));
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
  assertEquals(await claim(t, 2, await codeOf(t, 3)), { outcome: 'already_claimed' });
  await assertLedgerConsistent(t);
});

// ------------------------------------------------------------ arrival order

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

function paidAt(t: TestDb, order: number, customer: number, cents: number, processedAt: string) {
  return paidWith(t, order, customer, cents, { processedAt });
}

dbTest('final balances do not depend on the order webhooks arrive in', async (t) => {
  // Paid in this order: A S$450, B S$100, C S$200; A later part-refunded S$80.
  // Spend before B is S$370 and before C S$470, so every order earns 1x.
  const runs = permutations(['A', 'B', 'C', 'refundA']);
  assertEquals(runs.length, 24);
  for (const [k, run] of runs.entries()) {
    const referrer = 10_000 + k * 10, referee = referrer + 1, base = 100_000 + k * 10;
    await claim(t, referee, await codeOf(t, referrer));
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
        await paidWith(t, base + 1, customer, 56667, { presentmentCents: 42500, presentmentCurrency: 'USD', taxesIncluded: true, processedAt: '2026-10-01T10:00:00+08:00' });
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
    await claim(t, referee, await codeOf(t, referrer));
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
    const out = await Promise.all([claim(t, a, cb), claim(t, b, ca)]);
    assertEquals(out.filter((o) => o.outcome === 'pending').length, 1, JSON.stringify(out));
  }
});

dbTest('a claim racing the first payment never leaves a stranded referral', async (t) => {
  for (let i = 0; i < 12; i++) {
    const referee = 500 + i;
    const code = await codeOf(t, 1);
    await Promise.all([claim(t, referee, code), paidRetrying(t, 9000 + i, referee, 2000)]);
  }
  const [{ stranded }] = await t.sql`
    select count(*)::int as stranded from loyalty.referrals r
     where r.status = 'pending' and exists (select 1 from loyalty.orders o where o.member_id = r.referee_id and o.amount_cents > 0)`;
  assertEquals(stranded, 0);
  await assertLedgerConsistent(t);
});

dbTest('many orders and refunds for one customer at once end like the same history one by one', async (t) => {
  // 20 orders crossing both tier lines plus 10 refunds, all fired together for customer 70,
  // then the same events one at a time for customer 71. Balances must match exactly.
  const events = (customer: number, base: number) => [
    ...Array.from({ length: 20 }, (_, i) => () =>
      paidWith(t, base + i, customer, 15000 + i * 777, { processedAt: `2026-10-${String(1 + i).padStart(2, '0')}T10:00:00+08:00` })),
    ...Array.from({ length: 10 }, (_, i) => () => refund(t, base + 500 + i, base + i * 2, 3000 + i * 101)),
  ];
  await signIn(t, 70);
  await signIn(t, 71);
  await Promise.all(events(70, 70_000).map((run) => retrying(run)));
  for (const run of events(71, 71_000)) await run();
  const [a, b] = [await member(t, 70), await member(t, 71)];
  assertEquals([a.points, a.totalSpentCents, a.tier], [b.points, b.totalSpentCents, b.tier]);
  await assertLedgerConsistent(t);
});

/** What Shopify does with a 5xx: deliver again. */
async function retrying<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt < 8 && /referral changed while locking|deadlock|could not serialize/.test(String(err))) continue;
      throw err;
    }
  }
}

dbTest('concurrent first visits create one member with one code', async (t) => {
  const ms = await Promise.all(Array.from({ length: 20 }, () => member(t, 77)));
  assertEquals(new Set(ms.map((m) => m.referralCode)).size, 1);
});

// ------------------------------------------------- refund amounts (review)

dbTest('a first order refunded in full before its payment arrives earns no referral bonus', async (t) => {
  await claim(t, 2, await codeOf(t, 1));
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
  await claim(t, 2, await codeOf(t, 1));
  await paid(t, 10, 2, 10000);
  // S$20 of items plus an S$80 goodwill adjustment: the whole order was refunded.
  await refundParts(t, 1, 10, { lineCents: 2000, txCents: 10000 });
  assertEquals(await points(t, 2), 0);
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
});

dbTest('refunds paid in the customer currency convert at the order rate', async (t) => {
  await paidWith(t, 10, 2, 13500, { presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true }); // S$135 = US$100 -> 135 points
  assertEquals((await refundParts(t, 1, 10, { txCents: 4000, txCurrency: 'USD' })).clawed_back, 54); // US$40 = S$54
  // A currency we cannot convert falls back to the refunded items' subtotal (none here).
  assertEquals((await refundParts(t, 2, 10, { txCents: 4000, txCurrency: 'EUR' })).clawed_back, 0);
});

dbTest('refunding a foreign-currency order in parts still adds up to a full refund', async (t) => {
  await claim(t, 2, await codeOf(t, 1));
  await paidWith(t, 10, 2, 10000, { presentmentCents: 7500, presentmentCurrency: 'USD', taxesIncluded: true }); // S$100 paid as US$75
  for (const id of [1, 2, 3]) await refundParts(t, id, 10, { txCents: 2500, txCurrency: 'USD' });
  const [o] = await t.sql`select refunded_cents::int as r, refunded_presentment_cents::int as p from loyalty.orders`;
  assertEquals(o, { r: 10000, p: 7500 }); // per-part rounding would leave 9999
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  assertEquals(await points(t, 1), 0);
  assertEquals(await points(t, 2), 0);
});

dbTest('a shipping refund between foreign-currency part refunds cannot keep the bonuses', async (t) => {
  await claim(t, 2, await codeOf(t, 1));
  await paidWith(t, 10, 2, 13500, { presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true }); // S$135 of goods paid as US$100
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
    await paidWith(t, order, customer, 13400, { presentmentCents: 10000, presentmentCurrency: 'USD', taxesIncluded: true });
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
  await claim(t, 2, await codeOf(t, 1));
  assertEquals((await paid(t, 10, 2, 99)).referral, null);
  assertEquals((await paid(t, 11, 2, 500)).referral, 'completed');
  await refund(t, 1, 11, 400); // S$1.00 kept: bonuses stay
  assertEquals((await member(t, 2)).referredStatus, 'completed');
  await refund(t, 2, 11, 1); // S$0.99 kept: reversed
  assertEquals((await member(t, 2)).referredStatus, 'reversed');
  await assertLedgerConsistent(t);
});

dbTest('tax-exclusive orders do not count item tax as merchandise', async (t) => {
  await paidWith(t, 10, 2, 10000, { taxesIncluded: false });
  // Items S$50 + S$4.50 tax returned as one S$54.50 transaction.
  assertEquals((await refundParts(t, 1, 10, { lineCents: 5000, lineTaxCents: 450, txCents: 5450 })).clawed_back, 50);
});

dbTest('a full refund racing repeated claims never deadlocks', async (t) => {
  for (let i = 0; i < 10; i++) {
    const referrer = 1000 + i * 2, referee = 1001 + i * 2;
    const code = await codeOf(t, referrer);
    await claim(t, referee, code);
    await paid(t, 7000 + i, referee, 3000);
    const out = await Promise.all([
      refund(t, 7500 + i, 7000 + i, 3000),
      claim(t, referee, code),
      claim(t, referee, code),
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
    await assertRejects(() => conn`select loyalty.get_member(${uid(1)}::uuid, ${mail(1)}, true)`, Error, 'permission denied');
    await assertRejects(() => conn`select loyalty.auth_email_is(${uid(1)}::uuid, ${mail(1)})`, Error, 'permission denied');
    await assertRejects(() => conn`select loyalty.record_paid_order('x', 2, ${mail(1)}, null, 'x', 100000)`, Error, 'permission denied');
  }
});

dbTest('referral codes are well formed and unique across many members', async (t) => {
  await t.sql`select loyalty.ensure_member_row(('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid)
                from generate_series(1, 3000) g`;
  const [r] = await t.sql`
    select count(*)::int as n, count(distinct referral_code)::int as d,
           bool_and(referral_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$') as ok
      from loyalty.members`;
  assertEquals(r, { n: 3000, d: 3000, ok: true });
  const [chars] = await t.sql`
    select count(distinct c)::int as used from loyalty.members, regexp_split_to_table(referral_code, '') c`;
  assertEquals(chars.used, 32);
});
