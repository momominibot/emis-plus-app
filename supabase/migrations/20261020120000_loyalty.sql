-- EMIS+ Health Points, keyed to the Supabase Auth user.
--
-- Who touches this schema: only the two edge functions (shopify-webhook and
-- loyalty), connecting as the database owner through SUPABASE_DB_URL. The
-- schema is not exposed through PostgREST and the API roles (anon,
-- authenticated, service_role) get no rights here.
--
-- Identity: a member is a Supabase Auth user (member_id = auth user id).
-- Shopify orders are matched to members by email (lowercased, trimmed), but
-- only once the member has proven they control that mailbox
-- (email_proven_at): by signing in with an emailed code, or with an address
-- the identity provider itself owns (see the loyalty API). A provider's
-- "email verified" flag alone is not enough, because a Google account can
-- keep an address on another domain after that mailbox changes hands.
-- members.email follows auth.users.email through a trigger, so an address a
-- member gave up is released at once. Orders that arrive before their
-- customer signs up (or proves the email) wait unassigned and are awarded
-- the next time that customer opens the app. members.shopify_customer_id is
-- kept so a later migration can link by Shopify customer ID instead.
--
-- Lock order, everywhere: order advisory locks (ascending order id), then
-- member rows (member and referrer, ascending uuid), then everything else.
--
-- Rules enforced here, not in the app:
--   * Points come only from paid orders (orders/paid webhook, HMAC checked
--     by the edge function before it calls record_paid_order).
--   * One award per Shopify order; refunds are recalculated per order.
--   * A referral code belongs to a member. Each member can claim one code,
--     once, only while no order is known for their email (and their email is
--     not on the imported list of earlier Shopify customers), never their
--     own code and never back to someone they referred. Both bonuses wait
--     for the new customer's first paid order of at least S$1, and both are
--     reversed if refunds leave less than S$1 of that order.
--   * Arrival order does not matter: after every order or refund the
--     member's tier rates are re-priced in payment order (processed_at)
--     and the referral is worked out from the order that was really paid
--     first, so the final balances are the same however Shopify's webhooks
--     arrive (see reconcile_member).
--
-- Amounts are integer cents (SGD). Tier multipliers are stored x10 so all
-- arithmetic stays in integers: points = floor(cents * multiplier_x10 / 1000).

create schema if not exists loyalty;
revoke all on schema loyalty from public;

create table loyalty.members (
  member_id           uuid primary key,  -- Supabase auth.users.id
  email               text check (email is null or (email = lower(btrim(email)) and email like '%@%')),
  email_proven_at     timestamptz,       -- when the member last proved they control `email`
  shopify_customer_id bigint check (shopify_customer_id > 0),
  referral_code       text not null unique
                      check (referral_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  points              bigint not null default 0,
  total_spent_cents   bigint not null default 0 check (total_spent_cents >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (email_proven_at is null or email is not null)
);
-- Only a proven address is a binding orders can follow, and only one member
-- can hold it. An unproven address is just what Auth last told us.
create unique index members_proven_email on loyalty.members (email) where email_proven_at is not null;
create index members_email on loyalty.members (email);

-- Emails of people who ordered on emis.asia before Health Points started
-- (imported once from a Shopify customer export). They are not "new
-- customers" for referrals.
create table loyalty.prior_customers (
  email text primary key check (email = lower(btrim(email)))
);

-- One row per paid order. member_id stays null until a member with the
-- order's email exists; points are only posted once it is set.
create table loyalty.orders (
  order_id       bigint primary key check (order_id > 0),
  member_id      uuid references loyalty.members,
  customer_email text not null check (customer_email = lower(btrim(customer_email)) and customer_email like '%@%'),
  shopify_customer_id bigint check (shopify_customer_id > 0),
  order_name     text,
  processed_at   timestamptz not null default now(),  -- when Shopify says the order was placed
  amount_cents   bigint not null check (amount_cents >= 0),
  -- Same subtotal in the currency the customer paid in, to convert refunds
  -- whose transactions are in that currency.
  presentment_cents    bigint check (presentment_cents >= 0),
  presentment_currency text check (presentment_currency ~ '^[A-Z]{3}$'),
  taxes_included boolean not null default true,
  -- Merchandise refunded so far, measured in the presentment currency, so
  -- conversion always works on the running total: refunding everything adds
  -- up to the whole order whatever shipping refunds came in between.
  refunded_presentment_cents bigint not null default 0 check (refunded_presentment_cents >= 0),
  multiplier_x10 integer not null default 10 check (multiplier_x10 in (10, 15, 20)),
  points_earned  integer not null default 0 check (points_earned >= 0),
  refunded_cents bigint not null default 0,
  points_clawed  integer not null default 0,
  created_at     timestamptz not null default now(),
  check (refunded_cents between 0 and amount_cents),
  check (points_clawed between 0 and points_earned),
  check (member_id is not null or (points_earned = 0 and points_clawed = 0))
);
create index orders_member_idx on loyalty.orders (member_id, processed_at, order_id);
create index orders_email_idx on loyalty.orders (customer_email);

-- Refunds are stored as Shopify reported them, even before their order has
-- arrived (webhook order is not guaranteed). The merchandise amount is
-- worked out against the order (see refresh_order_refunds) and kept in
-- amount_cents.
create table loyalty.refunds (
  refund_id      bigint primary key check (refund_id > 0),
  order_id       bigint not null check (order_id > 0),
  line_cents     bigint not null default 0 check (line_cents >= 0),     -- refunded items' subtotals, shop money
  line_tax_cents bigint not null default 0 check (line_tax_cents >= 0), -- their tax, shop money
  tx_cents       bigint not null default 0 check (tx_cents >= 0),       -- money returned (successful or pending)
  tx_currency    text check (tx_currency ~ '^[A-Z]{3}$'),               -- null: shop currency
  other_cents    bigint not null default 0 check (other_cents >= 0),    -- shipping, shipping tax, duties, extra fees
  -- The same exclusions and item tax in the presentment currency (null: not in the payload).
  other_presentment_cents    bigint check (other_presentment_cents >= 0),
  line_tax_presentment_cents bigint check (line_tax_presentment_cents >= 0),
  amount_cents   bigint check (amount_cents >= 0),
  applied        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index refunds_order_idx on loyalty.refunds (order_id, refund_id);

create table loyalty.referrals (
  id                  bigint generated always as identity primary key,
  referrer_id         uuid not null references loyalty.members,
  referee_id          uuid not null unique references loyalty.members,
  code                text not null,
  status              text not null default 'pending' check (status in ('pending', 'completed', 'reversed')),
  qualifying_order_id bigint unique,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  check (referrer_id <> referee_id),
  check ((status <> 'pending') = (qualifying_order_id is not null and completed_at is not null))
);
create index referrals_referrer_idx on loyalty.referrals (referrer_id);

create table loyalty.ledger (
  id            bigint generated always as identity primary key,
  member_id     uuid not null references loyalty.members,
  kind          text not null
                check (kind in ('order', 'refund', 'tier_adjustment', 'referral_welcome', 'referral_reward', 'referral_reversal')),
  points        integer not null check (points <> 0),
  balance_after bigint not null,
  order_id      bigint,
  refund_id     bigint,
  referral_id   bigint references loyalty.referrals,
  description   text not null,
  created_at    timestamptz not null default now()
);
create unique index ledger_one_order_award on loyalty.ledger (order_id) where kind = 'order';
-- Referral entries are not unique: reconcile_member posts whatever brings
-- each side's net bonus to 100 or 0, so a referral can be undone and redone.
create index ledger_referral_idx on loyalty.ledger (referral_id, member_id) where referral_id is not null;
create index ledger_member_idx on loyalty.ledger (member_id, id desc);

-- Audit trail of deliveries; also drops exact redeliveries early.
create table loyalty.webhook_events (
  webhook_id  text primary key check (length(webhook_id) between 1 and 200),
  topic       text not null,
  outcome     text not null,
  received_at timestamptz not null default now()
);

-- Defence in depth: the owner bypasses RLS, everyone else sees nothing.
alter table loyalty.members enable row level security;
alter table loyalty.prior_customers enable row level security;
alter table loyalty.orders enable row level security;
alter table loyalty.refunds enable row level security;
alter table loyalty.referrals enable row level security;
alter table loyalty.ledger enable row level security;
alter table loyalty.webhook_events enable row level security;

-- ---------------------------------------------------------------- helpers

-- Mirrors TIER_CONFIG in lib/types.ts (S$500 gold 1.5x, S$2000 diamond 2x).
create function loyalty.multiplier_x10(p_total_spent_cents bigint) returns integer
language sql immutable set search_path = '' as $$
  select case
    when p_total_spent_cents >= 200000 then 20
    when p_total_spent_cents >= 50000 then 15
    else 10
  end
$$;

create function loyalty.tier(p_total_spent_cents bigint) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_total_spent_cents >= 200000 then 'diamond'
    when p_total_spent_cents >= 50000 then 'gold'
    else 'silver'
  end
$$;

create function loyalty.normalize_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select nullif(lower(btrim(p_email)), '')
$$;

-- 8 characters from a 32-letter alphabet without 0/O/1/I. Bytes 0-5, 7 and
-- 9 of a v4 UUID are fully random; 256 % 32 = 0 so there is no modulo bias.
create function loyalty.new_referral_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  code text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 7, 9] loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end
$$;

-- Serialises everything that touches one Shopify order (paid + refunds).
create function loyalty.lock_order(p_order_id bigint) returns void
language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(7731, pg_catalog.hashtext(p_order_id::text))
$$;

-- Creates the member on first use, with no email yet: the binding is set
-- under the member lock in get_member, or by the auth.users trigger.
create function loyalty.ensure_member_row(p_member_id uuid) returns void
language plpgsql volatile set search_path = '' as $$
begin
  if p_member_id is null then raise exception 'invalid member id'; end if;
  if exists (select 1 from loyalty.members where member_id = p_member_id) then
    return;
  end if;
  for attempt in 1..5 loop
    begin
      insert into loyalty.members (member_id, referral_code)
      values (p_member_id, loyalty.new_referral_code())
      on conflict (member_id) do nothing;
      return;
    exception when unique_violation then
      null; -- referral code collision: try again
    end;
  end loop;
  raise exception 'could not create the member';
end
$$;

create function loyalty.add_points(
  p_member_id uuid, p_kind text, p_points integer, p_description text,
  p_order_id bigint default null, p_refund_id bigint default null, p_referral_id bigint default null
) returns bigint
language plpgsql volatile set search_path = '' as $$
declare
  v_balance bigint;
begin
  update loyalty.members
     set points = points + p_points, updated_at = now()
   where member_id = p_member_id
  returning points into strict v_balance;
  insert into loyalty.ledger (member_id, kind, points, balance_after, order_id, refund_id, referral_id, description)
  values (p_member_id, p_kind, p_points, v_balance, p_order_id, p_refund_id, p_referral_id, p_description);
  return v_balance;
end
$$;

-- Locks a member and, if they were referred, their referrer, in id order
-- (the order every path uses, so concurrent work cannot deadlock). Raises
-- 40001 (retry) if a referral claim slipped in between the lookup and the
-- lock.
create function loyalty.lock_member(p_member_id uuid) returns void
language plpgsql volatile set search_path = '' as $$
declare
  v_referrer uuid;
begin
  select referrer_id into v_referrer from loyalty.referrals where referee_id = p_member_id;
  perform 1 from loyalty.members
    where member_id in (p_member_id, v_referrer)
    order by member_id for update;
  if v_referrer is distinct from (select referrer_id from loyalty.referrals where referee_id = p_member_id) then
    raise exception 'referral changed while locking' using errcode = '40001';
  end if;
end
$$;

-- Works out an order's refunds from scratch, from every refund stored for
-- it, taken in refund-ID order, so the result depends only on which refunds
-- exist and never on the order their webhooks arrived in. Caller holds
-- lock_order and, for an assigned order, the member locks. For an assigned
-- order it posts the change in points clawed back (negative if an earlier
-- over-claw is restored) and returns it; for an unassigned order it only
-- updates the totals and returns 0; null when the order has not arrived.
--
-- Merchandise refunded is the larger of the refunded items' subtotal and the
-- money returned minus shipping, duties, extra fees and (for tax-exclusive
-- prices) the items' tax. That covers item refunds, amount-only refunds and
-- refunds where staff returned more than the items. Money returned in the
-- customer's currency has its exclusions taken off in that currency, is
-- added to a running total of merchandise refunded in that currency, and
-- only the running total is converted with the order's own exchange ratio,
-- so refunding everything adds up to the whole order. An unknown currency
-- falls back to the items' subtotal.
create function loyalty.refresh_order_refunds(p_order_id bigint, p_trigger_refund_id bigint) returns integer
language plpgsql volatile set search_path = '' as $$
declare
  o loyalty.orders;
  r loyalty.refunds;
  v_cum_p bigint := 0;
  v_merch_p bigint;
  v_tx_merch bigint;
  v_amount bigint;
  v_refunded bigint := 0;
  v_clawed integer;
  v_delta integer;
begin
  select * into o from loyalty.orders where order_id = p_order_id for update;
  if not found then
    return null;
  end if;

  for r in select * from loyalty.refunds where order_id = p_order_id order by refund_id for update loop
    if r.tx_cents = 0 then
      v_tx_merch := 0;
    elsif r.tx_currency is null then
      v_tx_merch := r.tx_cents - r.other_cents - case when o.taxes_included then 0 else r.line_tax_cents end;
    elsif r.tx_currency = o.presentment_currency and o.presentment_cents > 0 and o.amount_cents > 0 then
      v_merch_p := greatest(
        r.tx_cents
        - coalesce(r.other_presentment_cents, round(r.other_cents::numeric * o.presentment_cents / o.amount_cents)::bigint)
        - case when o.taxes_included then 0
               else coalesce(r.line_tax_presentment_cents, round(r.line_tax_cents::numeric * o.presentment_cents / o.amount_cents)::bigint)
          end,
        0);
      v_tx_merch := round((v_cum_p + v_merch_p)::numeric * o.amount_cents / o.presentment_cents)::bigint
                  - round(v_cum_p::numeric * o.amount_cents / o.presentment_cents)::bigint;
      v_cum_p := v_cum_p + v_merch_p;
    else
      v_tx_merch := null;
    end if;
    v_amount := greatest(r.line_cents, coalesce(v_tx_merch, 0), 0);
    v_refunded := v_refunded + v_amount;
    if not r.applied or r.amount_cents is distinct from v_amount then
      update loyalty.refunds set applied = true, amount_cents = v_amount where refund_id = r.refund_id;
    end if;
  end loop;
  v_refunded := least(v_refunded, o.amount_cents);

  if o.member_id is null then
    update loyalty.orders set refunded_cents = v_refunded, refunded_presentment_cents = v_cum_p where order_id = o.order_id;
    return 0;
  end if;

  -- Points clawed back = what the refunded part earned at this order's rate.
  v_clawed := o.points_earned - ((o.amount_cents - v_refunded) * o.multiplier_x10 / 1000)::integer;
  v_delta := v_clawed - o.points_clawed;
  update loyalty.orders
     set refunded_cents = v_refunded, points_clawed = v_clawed, refunded_presentment_cents = v_cum_p
   where order_id = o.order_id;
  update loyalty.members
     set total_spent_cents = greatest(total_spent_cents - (v_refunded - o.refunded_cents), 0), updated_at = now()
   where member_id = o.member_id;
  if v_delta <> 0 then
    perform loyalty.add_points(o.member_id, 'refund', -v_delta,
      case when v_delta > 0 then 'Refund on order ' else 'Refund recalculated on order ' end
        || coalesce(o.order_name, '#' || o.order_id::text),
      o.order_id, p_trigger_refund_id, null);
  end if;
  return v_delta;
end
$$;

-- Gives an unassigned order to a member and posts its points: the award at
-- the tier their earlier-paid orders put them in, less what any refunds
-- already known took back. Caller holds lock_order and the member locks.
create function loyalty.award_order(p_order_id bigint, p_member_id uuid) returns integer
language plpgsql volatile set search_path = '' as $$
declare
  o loyalty.orders;
  v_spent bigint;
  v_mult integer;
  v_earned integer;
  v_clawed integer;
begin
  select * into strict o from loyalty.orders where order_id = p_order_id for update;
  if o.member_id is not null then
    return 0;
  end if;
  select coalesce(sum(amount_cents - refunded_cents), 0) into v_spent
    from loyalty.orders
   where member_id = p_member_id and (processed_at, order_id) < (o.processed_at, o.order_id);
  v_mult := loyalty.multiplier_x10(v_spent);
  v_earned := (o.amount_cents * v_mult / 1000)::integer;
  v_clawed := v_earned - ((o.amount_cents - o.refunded_cents) * v_mult / 1000)::integer;
  update loyalty.orders
     set member_id = p_member_id, multiplier_x10 = v_mult, points_earned = v_earned, points_clawed = v_clawed
   where order_id = o.order_id;
  update loyalty.members
     set total_spent_cents = total_spent_cents + (o.amount_cents - o.refunded_cents),
         shopify_customer_id = coalesce(shopify_customer_id, o.shopify_customer_id),
         updated_at = now()
   where member_id = p_member_id;
  if v_earned > 0 then
    perform loyalty.add_points(p_member_id, 'order', v_earned,
      'Order ' || coalesce(o.order_name, '#' || o.order_id::text), o.order_id, null, null);
  end if;
  if v_clawed > 0 then
    perform loyalty.add_points(p_member_id, 'refund', -v_clawed,
      'Refund on order ' || coalesce(o.order_name, '#' || o.order_id::text), o.order_id, null, null);
  end if;
  return v_earned - v_clawed;
end
$$;

-- Brings one member's awards in line with the full history we know of,
-- independent of the order in which webhooks arrived:
--   1. each order's tier rate comes from the net spend (after refunds) of the
--      orders paid before it (processed_at); any change is posted as a
--      tier_adjustment entry;
--   2. their referral (as the new customer) follows their first paid order
--      of at least S$1: completed while it keeps at least S$1, reversed once
--      it keeps less, pending while there is none. Each side's net referral
--      points are brought to 100 or 0.
-- Caller holds the member locks of the member and of their referrer.
create function loyalty.reconcile_member(p_member_id uuid) returns void
language plpgsql volatile set search_path = '' as $$
declare
  o record;
  v_before bigint := 0;
  v_mult integer;
  v_earned integer;
  v_clawed integer;
  v_delta integer;
  ref loyalty.referrals;
  v_first loyalty.orders;
  v_status text;
  v_want integer;
  v_have integer;
  v_side record;
begin
  for o in
    select * from loyalty.orders where member_id = p_member_id
     order by processed_at, order_id for update
  loop
    v_mult := loyalty.multiplier_x10(v_before);
    if v_mult <> o.multiplier_x10 then
      v_earned := (o.amount_cents * v_mult / 1000)::integer;
      v_clawed := v_earned - ((o.amount_cents - o.refunded_cents) * v_mult / 1000)::integer;
      v_delta := (v_earned - v_clawed) - (o.points_earned - o.points_clawed);
      update loyalty.orders set multiplier_x10 = v_mult, points_earned = v_earned, points_clawed = v_clawed
       where order_id = o.order_id;
      if v_delta <> 0 then
        perform loyalty.add_points(p_member_id, 'tier_adjustment', v_delta,
          'Tier rate updated for order ' || coalesce(o.order_name, '#' || o.order_id::text), o.order_id, null, null);
      end if;
    end if;
    v_before := v_before + o.amount_cents - o.refunded_cents;
  end loop;

  select * into ref from loyalty.referrals where referee_id = p_member_id for update;
  if not found then
    return;
  end if;
  select * into v_first from loyalty.orders
   where member_id = p_member_id and amount_cents >= 100
   order by processed_at, order_id limit 1;
  if v_first.order_id is null then
    v_status := 'pending';
  elsif v_first.amount_cents - v_first.refunded_cents >= 100 then
    v_status := 'completed';
  else
    v_status := 'reversed';
  end if;
  v_want := case when v_status = 'completed' then 100 else 0 end;

  for v_side in
    select ref.referee_id as member_id, 'referral_welcome' as up, 'Welcome bonus: referred by a friend' as up_text,
           'Welcome bonus reversed: first order refunded' as down_text
    union all
    select ref.referrer_id, 'referral_reward', 'Referral bonus: a friend placed their first order',
           'Referral bonus reversed: friend''s first order refunded'
  loop
    select coalesce(sum(points), 0)::integer into v_have
      from loyalty.ledger where referral_id = ref.id and member_id = v_side.member_id;
    if v_want <> v_have then
      perform loyalty.add_points(v_side.member_id,
        case when v_want > v_have then v_side.up else 'referral_reversal' end, v_want - v_have,
        case when v_want > v_have then v_side.up_text else v_side.down_text end,
        v_first.order_id, null, ref.id);
    end if;
  end loop;

  if v_status <> 'pending' and (ref.status <> v_status or ref.qualifying_order_id is distinct from v_first.order_id) then
    update loyalty.referrals
       set status = v_status, qualifying_order_id = v_first.order_id, completed_at = coalesce(completed_at, now())
     where id = ref.id;
  end if;
end
$$;

-- --------------------------------------------------------------- entry points

create function loyalty.record_paid_order(
  p_webhook_id text, p_order_id bigint, p_email text, p_shopify_customer_id bigint, p_order_name text,
  p_amount_cents bigint, p_presentment_cents bigint default null, p_presentment_currency text default null,
  p_taxes_included boolean default true, p_processed_at timestamptz default null
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_email text := loyalty.normalize_email(p_email);
  v_member uuid;
  v_points integer;
  v_balance bigint;
  v_referral text := null;
  v_result jsonb;
begin
  if p_order_id is null or p_order_id <= 0 then raise exception 'invalid order id'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'invalid amount'; end if;
  if v_email is null or v_email not like '%@%' then raise exception 'invalid email'; end if;

  perform loyalty.lock_order(p_order_id);

  if p_webhook_id is not null then
    insert into loyalty.webhook_events (webhook_id, topic, outcome)
    values (p_webhook_id, 'orders/paid', 'processing')
    on conflict (webhook_id) do nothing;
    if not found then
      return jsonb_build_object('outcome', 'duplicate_delivery');
    end if;
  end if;

  if exists (select 1 from loyalty.orders where order_id = p_order_id) then
    v_result := jsonb_build_object('outcome', 'already_recorded');
  else
    insert into loyalty.orders (order_id, customer_email, shopify_customer_id, order_name, processed_at, amount_cents,
                                presentment_cents, presentment_currency, taxes_included)
    values (p_order_id, v_email, p_shopify_customer_id, p_order_name, coalesce(p_processed_at, now()), p_amount_cents,
            p_presentment_cents, p_presentment_currency, coalesce(p_taxes_included, true));
    -- Refunds that arrived before this order.
    if exists (select 1 from loyalty.refunds where order_id = p_order_id) then
      perform loyalty.refresh_order_refunds(p_order_id, null);
    end if;

    select member_id into v_member from loyalty.members where email = v_email and email_proven_at is not null;
    if v_member is not null then
      perform loyalty.lock_member(v_member);
      -- Re-check under the lock: the binding may have moved meanwhile.
      if not exists (select 1 from loyalty.members
                      where member_id = v_member and email = v_email and email_proven_at is not null) then
        v_member := null;
      end if;
    end if;
    if v_member is null then
      v_result := jsonb_build_object('outcome', 'stored_until_sign_up');
    else
      v_points := loyalty.award_order(p_order_id, v_member);
      perform loyalty.reconcile_member(v_member);
      select status into v_referral from loyalty.referrals
        where referee_id = v_member and qualifying_order_id = p_order_id;
      select points into strict v_balance from loyalty.members where member_id = v_member;
      v_result := jsonb_build_object(
        'outcome', 'awarded', 'points', v_points, 'balance', v_balance, 'referral', v_referral);
    end if;
  end if;

  if p_webhook_id is not null then
    update loyalty.webhook_events set outcome = v_result ->> 'outcome' where webhook_id = p_webhook_id;
  end if;
  return v_result;
end
$$;

create function loyalty.record_refund(
  p_webhook_id text, p_refund_id bigint, p_order_id bigint,
  p_line_cents bigint, p_line_tax_cents bigint, p_tx_cents bigint, p_tx_currency text, p_other_cents bigint,
  p_other_presentment_cents bigint default null, p_line_tax_presentment_cents bigint default null
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_member uuid;
  v_claw integer;
  v_result jsonb;
begin
  if p_refund_id is null or p_refund_id <= 0 then raise exception 'invalid refund id'; end if;
  if p_order_id is null or p_order_id <= 0 then raise exception 'invalid order id'; end if;

  perform loyalty.lock_order(p_order_id);

  if p_webhook_id is not null then
    insert into loyalty.webhook_events (webhook_id, topic, outcome)
    values (p_webhook_id, 'refunds/create', 'processing')
    on conflict (webhook_id) do nothing;
    if not found then
      return jsonb_build_object('outcome', 'duplicate_delivery');
    end if;
  end if;

  insert into loyalty.refunds (refund_id, order_id, line_cents, line_tax_cents, tx_cents, tx_currency, other_cents,
                               other_presentment_cents, line_tax_presentment_cents)
  values (p_refund_id, p_order_id, coalesce(p_line_cents, 0), coalesce(p_line_tax_cents, 0),
          coalesce(p_tx_cents, 0), p_tx_currency, coalesce(p_other_cents, 0),
          p_other_presentment_cents, p_line_tax_presentment_cents)
  on conflict (refund_id) do nothing;

  if not exists (select 1 from loyalty.orders where order_id = p_order_id) then
    v_result := jsonb_build_object('outcome', 'stored_until_order_arrives');
  else
    select member_id into v_member from loyalty.orders where order_id = p_order_id;
    if v_member is null then
      perform loyalty.refresh_order_refunds(p_order_id, p_refund_id);
      v_result := jsonb_build_object('outcome', 'stored_until_sign_up');
    else
      perform loyalty.lock_member(v_member);
      v_claw := loyalty.refresh_order_refunds(p_order_id, p_refund_id);
      perform loyalty.reconcile_member(v_member);
      v_result := jsonb_build_object('outcome', 'applied', 'clawed_back', v_claw);
    end if;
  end if;

  if p_webhook_id is not null then
    update loyalty.webhook_events set outcome = v_result ->> 'outcome' where webhook_id = p_webhook_id;
  end if;
  return v_result;
end
$$;

create function loyalty.claim_referral(p_member_id uuid, p_email text, p_code text)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_email text := loyalty.normalize_email(p_email);
  v_referrer uuid;
begin
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;
  if v_email is null or v_email not like '%@%' then raise exception 'invalid email'; end if;
  perform loyalty.ensure_member_row(p_member_id);
  select member_id into v_referrer from loyalty.members where referral_code = v_code;
  if not found then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;
  if v_referrer = p_member_id then
    return jsonb_build_object('outcome', 'self_referral');
  end if;

  perform 1 from loyalty.members
    where member_id in (p_member_id, v_referrer)
    order by member_id for update;

  if exists (select 1 from loyalty.referrals where referee_id = p_member_id) then
    return jsonb_build_object('outcome', 'already_claimed');
  end if;
  if exists (select 1 from loyalty.orders where member_id = p_member_id or customer_email = v_email)
     or exists (select 1 from loyalty.prior_customers where email = v_email) then
    return jsonb_build_object('outcome', 'not_new_customer');
  end if;
  if exists (select 1 from loyalty.referrals where referee_id = v_referrer and referrer_id = p_member_id) then
    return jsonb_build_object('outcome', 'mutual_referral');
  end if;

  insert into loyalty.referrals (referrer_id, referee_id, code) values (v_referrer, p_member_id, v_code);
  return jsonb_build_object('outcome', 'pending');
end
$$;

-- Everything the app shows: balance, tier, referral, history and the orders
-- matched to the member. Creates the member on first use, keeps the email
-- binding in step with Supabase Auth, records proof of mailbox control
-- (p_email_proven, decided by the loyalty API from how the user signed in)
-- and gives a proven member any orders that were waiting for their email.
create function loyalty.get_member(p_member_id uuid, p_email text, p_email_proven boolean default false) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_email text := loyalty.normalize_email(p_email);
  m loyalty.members;
  v_ids bigint[];
  v_id bigint;
  v_linked integer := 0;
begin
  if v_email is null or v_email not like '%@%' then raise exception 'invalid email'; end if;
  perform loyalty.ensure_member_row(p_member_id);

  -- Lock order: the waiting orders' locks, then the member (and referrer).
  select array_agg(order_id order by order_id) into v_ids
    from loyalty.orders where customer_email = v_email and member_id is null;
  if v_ids is not null then
    foreach v_id in array v_ids loop
      perform loyalty.lock_order(v_id);
    end loop;
  end if;
  perform loyalty.lock_member(p_member_id);

  select * into strict m from loyalty.members where member_id = p_member_id;
  -- Only rebind if Auth still has this address for the user: the API read it
  -- a moment ago, and an email change since then has already been applied
  -- by the auth.users trigger, which must not be undone.
  if (m.email is distinct from v_email or (p_email_proven and m.email_proven_at is null))
     and loyalty.auth_email_is(p_member_id, v_email) then
    if p_email_proven and exists (select 1 from loyalty.members
                                   where email = v_email and email_proven_at is not null
                                     and member_id <> p_member_id) then
      raise exception 'email belongs to another member';
    end if;
    update loyalty.members
       set email = v_email,
           email_proven_at = case when p_email_proven then now()
                                  when m.email = v_email then m.email_proven_at end,
           updated_at = now()
     where member_id = p_member_id;
  end if;
  select * into strict m from loyalty.members where member_id = p_member_id;

  if m.email_proven_at is not null and v_ids is not null then
    for v_id in
      select order_id from loyalty.orders
       where order_id = any (v_ids) and member_id is null and customer_email = m.email
       order by processed_at, order_id
    loop
      perform loyalty.award_order(v_id, p_member_id);
      v_linked := v_linked + 1;
    end loop;
    if v_linked > 0 then
      perform loyalty.reconcile_member(p_member_id);
    end if;
    select * into strict m from loyalty.members where member_id = p_member_id;
  end if;

  -- The member row stays locked until we return, so the figures agree.
  return jsonb_build_object(
    'memberId', m.member_id,
    'email', m.email,
    'ordersLinked', m.email_proven_at is not null,
    'points', m.points,
    'tier', loyalty.tier(m.total_spent_cents),
    'totalSpentCents', m.total_spent_cents,
    'referralCode', m.referral_code,
    'referralsCompleted', (select count(*) from loyalty.referrals where referrer_id = m.member_id and status = 'completed'),
    'referralsPending', (select count(*) from loyalty.referrals where referrer_id = m.member_id and status = 'pending'),
    'referredStatus', (select status from loyalty.referrals where referee_id = m.member_id),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id::text, 'date', l.created_at, 'kind', l.kind, 'points', l.points,
               'balanceAfter', l.balance_after, 'description', l.description) order by l.id desc)
        from (select * from loyalty.ledger where member_id = m.member_id order by id desc limit 50) l
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'orderId', o.order_id::text, 'name', o.order_name, 'processedAt', o.processed_at,
               'amountCents', o.amount_cents, 'refundedCents', o.refunded_cents,
               'points', o.points_earned - o.points_clawed) order by o.processed_at desc, o.order_id desc)
        from (select * from loyalty.orders where member_id = m.member_id
               order by processed_at desc, order_id desc limit 50) o
    ), '[]'::jsonb)
  );
end
$$;

-- Keeps members.email in step with Supabase Auth. Supabase changes
-- auth.users.email only after the new address is confirmed, so the new
-- binding counts as proven. A deleted user releases their address. Auth is
-- the source of truth: any other member still holding the new address
-- (which can only be stale) lets it go.
-- Whether Supabase Auth currently has this confirmed address for the user.
-- Outside Supabase (no auth.users) the loyalty API's word is all there is.
create function loyalty.auth_email_is(p_member_id uuid, p_email text) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  v_ok boolean;
begin
  if pg_catalog.to_regclass('auth.users') is null then
    return true;
  end if;
  execute 'select exists (select 1 from auth.users where id = $1 and email_confirmed_at is not null '
       || 'and loyalty.normalize_email(email) = $2)'
     into v_ok using p_member_id, p_email;
  return v_ok;
end
$$;

do $$
begin
  if pg_catalog.to_regclass('auth.users') is null then
    return; -- not a Supabase database (local tests create a stand-in first)
  end if;
  execute $f$
    create function loyalty.sync_auth_email() returns trigger
    language plpgsql security definer set search_path = '' as $body$
    declare
      v_email text;
    begin
      if tg_op = 'DELETE' then
        update loyalty.members set email = null, email_proven_at = null, updated_at = now()
         where member_id = old.id;
        return old;
      end if;
      if new.email is distinct from old.email then
        v_email := loyalty.normalize_email(new.email);
        -- Member rows in id order, like every other path.
        perform 1 from loyalty.members
          where member_id = new.id or (v_email is not null and email = v_email)
          order by member_id for update;
        if v_email is not null then
          update loyalty.members set email = null, email_proven_at = null, updated_at = now()
           where email = v_email and member_id <> new.id;
        end if;
        update loyalty.members
           set email = v_email,
               email_proven_at = case when v_email is not null and new.email_confirmed_at is not null then now() end,
               updated_at = now()
         where member_id = new.id;
      end if;
      return new;
    end
    $body$
  $f$;
  execute 'create trigger loyalty_sync_email after update of email or delete on auth.users '
       || 'for each row execute function loyalty.sync_auth_email()';
end
$$;

-- Functions get EXECUTE for PUBLIC by default; only the owner may call these.
-- Supabase's API roles are revoked explicitly in case default privileges
-- granted them anything.
revoke all on all functions in schema loyalty from public;
revoke all on all tables in schema loyalty from public;
revoke all on all sequences in schema loyalty from public;
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute format('revoke all on schema loyalty from %I', r);
      execute format('revoke all on all tables in schema loyalty from %I', r);
      execute format('revoke all on all sequences in schema loyalty from %I', r);
      execute format('revoke all on all functions in schema loyalty from %I', r);
    end if;
  end loop;
end
$$;
