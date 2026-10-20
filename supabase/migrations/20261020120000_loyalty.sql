-- EMIS+ Health Points, keyed to the Shopify customer ID.
--
-- Who touches this schema: only the two edge functions (shopify-webhook and
-- loyalty), connecting as the database owner through SUPABASE_DB_URL. The
-- schema is not exposed through PostgREST and the API roles (anon,
-- authenticated, service_role) get no rights here.
--
-- Rules enforced here, not in the app:
--   * Points come only from paid orders (orders/paid webhook, HMAC checked
--     by the edge function before it calls record_paid_order).
--   * One award per Shopify order, one clawback per Shopify refund.
--   * A referral code belongs to a real member, each customer can claim one
--     code once, only while they have no orders, never their own code and
--     never back to someone they referred. Both bonuses wait for the new
--     customer's first paid order, and both are reversed if that order is
--     later refunded in full.
--
-- Amounts are integer cents (SGD). Tier multipliers are stored x10 so all
-- arithmetic stays in integers: points = floor(cents * multiplier_x10 / 1000).

create schema if not exists loyalty;
revoke all on schema loyalty from public;

create table loyalty.members (
  customer_id       bigint primary key check (customer_id > 0),
  referral_code     text not null unique
                    check (referral_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  points            bigint not null default 0,
  total_spent_cents bigint not null default 0 check (total_spent_cents >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One row per paid order that has been through the award step.
create table loyalty.orders (
  order_id       bigint primary key check (order_id > 0),
  customer_id    bigint not null references loyalty.members,
  order_name     text,
  amount_cents   bigint not null check (amount_cents >= 0),
  multiplier_x10 integer not null check (multiplier_x10 in (10, 15, 20)),
  points_earned  integer not null check (points_earned >= 0),
  refunded_cents bigint not null default 0,
  points_clawed  integer not null default 0,
  created_at     timestamptz not null default now(),
  check (refunded_cents between 0 and amount_cents),
  check (points_clawed between 0 and points_earned)
);
create index orders_customer_idx on loyalty.orders (customer_id);

-- Refunds are stored even when their order has not been awarded yet
-- (webhook order is not guaranteed); record_paid_order applies them later.
create table loyalty.refunds (
  refund_id    bigint primary key check (refund_id > 0),
  order_id     bigint not null check (order_id > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  applied      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index refunds_pending_idx on loyalty.refunds (order_id) where not applied;

create table loyalty.referrals (
  id                  bigint generated always as identity primary key,
  referrer_id         bigint not null references loyalty.members,
  referee_id          bigint not null unique references loyalty.members,
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
  customer_id   bigint not null references loyalty.members,
  kind          text not null
                check (kind in ('order', 'refund', 'referral_welcome', 'referral_reward', 'referral_reversal')),
  points        integer not null check (points <> 0),
  balance_after bigint not null,
  order_id      bigint,
  refund_id     bigint,
  referral_id   bigint references loyalty.referrals,
  description   text not null,
  created_at    timestamptz not null default now()
);
create unique index ledger_one_order_award on loyalty.ledger (order_id) where kind = 'order';
create unique index ledger_one_refund on loyalty.ledger (refund_id) where kind = 'refund';
create unique index ledger_one_referral_entry on loyalty.ledger (referral_id, kind, customer_id)
  where referral_id is not null;
create index ledger_customer_idx on loyalty.ledger (customer_id, id desc);

-- Audit trail of deliveries; also drops exact redeliveries early.
create table loyalty.webhook_events (
  webhook_id  text primary key check (length(webhook_id) between 1 and 200),
  topic       text not null,
  outcome     text not null,
  received_at timestamptz not null default now()
);

-- Defence in depth: the owner bypasses RLS, everyone else sees nothing.
alter table loyalty.members enable row level security;
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

create function loyalty.ensure_member(p_customer_id bigint) returns loyalty.members
language plpgsql volatile set search_path = '' as $$
declare
  m loyalty.members;
begin
  if p_customer_id is null or p_customer_id <= 0 then
    raise exception 'invalid customer id';
  end if;
  select * into m from loyalty.members where customer_id = p_customer_id;
  if found then
    return m;
  end if;
  for attempt in 1..5 loop
    begin
      insert into loyalty.members (customer_id, referral_code)
      values (p_customer_id, loyalty.new_referral_code())
      on conflict (customer_id) do nothing
      returning * into m;
      if m.customer_id is null then
        -- A concurrent call created the member first.
        select * into strict m from loyalty.members where customer_id = p_customer_id;
      end if;
      return m;
    exception when unique_violation then
      null; -- referral code collision, draw another
    end;
  end loop;
  raise exception 'could not allocate a referral code';
end
$$;

create function loyalty.add_points(
  p_customer_id bigint, p_kind text, p_points integer, p_description text,
  p_order_id bigint default null, p_refund_id bigint default null, p_referral_id bigint default null
) returns bigint
language plpgsql volatile set search_path = '' as $$
declare
  v_balance bigint;
begin
  update loyalty.members
     set points = points + p_points, updated_at = now()
   where customer_id = p_customer_id
  returning points into strict v_balance;
  insert into loyalty.ledger (customer_id, kind, points, balance_after, order_id, refund_id, referral_id, description)
  values (p_customer_id, p_kind, p_points, v_balance, p_order_id, p_refund_id, p_referral_id, p_description);
  return v_balance;
end
$$;

-- Applies one stored refund to its awarded order. Caller holds lock_order
-- and the member row lock. Returns points clawed back, or null when the
-- order has not been awarded yet (refund stays pending).
create function loyalty.apply_refund(p_refund_id bigint) returns integer
language plpgsql volatile set search_path = '' as $$
declare
  r loyalty.refunds;
  o loyalty.orders;
  ref loyalty.referrals;
  v_refunded bigint;
  v_target integer;
  v_claw integer;
begin
  select * into strict r from loyalty.refunds where refund_id = p_refund_id for update;
  if r.applied then
    return 0;
  end if;
  select * into o from loyalty.orders where order_id = r.order_id for update;
  if not found then
    return null;
  end if;

  v_refunded := least(o.refunded_cents + r.amount_cents, o.amount_cents);
  -- Clawback so far should equal what the refunded part earned, computed on
  -- the running total so repeated partial refunds never drift.
  v_target := o.points_earned - ((o.amount_cents - v_refunded) * o.multiplier_x10 / 1000)::integer;
  v_claw := greatest(v_target - o.points_clawed, 0);

  update loyalty.orders
     set refunded_cents = v_refunded, points_clawed = points_clawed + v_claw
   where order_id = o.order_id;
  update loyalty.members
     set total_spent_cents = greatest(total_spent_cents - (v_refunded - o.refunded_cents), 0), updated_at = now()
   where customer_id = o.customer_id;
  if v_claw > 0 then
    perform loyalty.add_points(o.customer_id, 'refund', -v_claw,
      'Refund on order ' || coalesce(o.order_name, '#' || o.order_id::text),
      o.order_id, r.refund_id, null);
  end if;

  -- A referral that this order completed is undone once nothing of the
  -- order is kept, so refunded orders cannot farm referral bonuses.
  if v_refunded = o.amount_cents and o.refunded_cents < o.amount_cents then
    select * into ref from loyalty.referrals
      where qualifying_order_id = o.order_id and status = 'completed' for update;
    if found then
      perform 1 from loyalty.members where customer_id = ref.referrer_id for update;
      update loyalty.referrals set status = 'reversed' where id = ref.id;
      perform loyalty.add_points(ref.referee_id, 'referral_reversal', -100,
        'Welcome bonus reversed: first order refunded', o.order_id, r.refund_id, ref.id);
      perform loyalty.add_points(ref.referrer_id, 'referral_reversal', -100,
        'Referral bonus reversed: friend''s first order refunded', o.order_id, r.refund_id, ref.id);
    end if;
  end if;
  update loyalty.refunds set applied = true where refund_id = r.refund_id;
  return v_claw;
end
$$;

-- --------------------------------------------------------------- entry points

create function loyalty.record_paid_order(
  p_webhook_id text, p_order_id bigint, p_customer_id bigint, p_order_name text, p_amount_cents bigint
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_referrer bigint;
  ref loyalty.referrals;
  v_spent bigint;
  v_mult integer;
  v_points integer;
  v_balance bigint;
  v_refund record;
  v_referral text := null;
  v_result jsonb;
begin
  if p_order_id is null or p_order_id <= 0 then raise exception 'invalid order id'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'invalid amount'; end if;

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
    v_result := jsonb_build_object('outcome', 'already_awarded');
  else
    perform loyalty.ensure_member(p_customer_id);

    -- Lock the member rows in id order (customer, and referrer if this order
    -- completes a referral) so concurrent orders cannot deadlock.
    select referrer_id into v_referrer
      from loyalty.referrals where referee_id = p_customer_id and status = 'pending';
    perform 1 from loyalty.members
      where customer_id in (p_customer_id, v_referrer)
      order by customer_id for update;

    select total_spent_cents into strict v_spent from loyalty.members where customer_id = p_customer_id;
    v_mult := loyalty.multiplier_x10(v_spent);
    v_points := (p_amount_cents * v_mult / 1000)::integer;

    insert into loyalty.orders (order_id, customer_id, order_name, amount_cents, multiplier_x10, points_earned)
    values (p_order_id, p_customer_id, p_order_name, p_amount_cents, v_mult, v_points);
    update loyalty.members
       set total_spent_cents = total_spent_cents + p_amount_cents, updated_at = now()
     where customer_id = p_customer_id;
    if v_points > 0 then
      perform loyalty.add_points(p_customer_id, 'order', v_points,
        'Order ' || coalesce(p_order_name, '#' || p_order_id::text), p_order_id, null, null);
    end if;

    -- Refunds that arrived before this award.
    for v_refund in
      select refund_id from loyalty.refunds where order_id = p_order_id and not applied order by refund_id
    loop
      perform loyalty.apply_refund(v_refund.refund_id);
    end loop;

    -- First paid order completes a pending referral (never a free order).
    select * into ref from loyalty.referrals
      where referee_id = p_customer_id and status = 'pending' for update;
    if found and p_amount_cents > 0 then
      if v_referrer is distinct from ref.referrer_id then
        -- Claimed between our lookup and our lock: take the referrer lock now.
        perform 1 from loyalty.members where customer_id = ref.referrer_id for update;
      end if;
      update loyalty.referrals
         set status = 'completed', qualifying_order_id = p_order_id, completed_at = now()
       where id = ref.id;
      perform loyalty.add_points(p_customer_id, 'referral_welcome', 100,
        'Welcome bonus: referred by a friend', p_order_id, null, ref.id);
      perform loyalty.add_points(ref.referrer_id, 'referral_reward', 100,
        'Referral bonus: a friend placed their first order', p_order_id, null, ref.id);
      v_referral := 'completed';
    end if;

    select points into strict v_balance from loyalty.members where customer_id = p_customer_id;
    v_result := jsonb_build_object(
      'outcome', 'awarded', 'points', v_points, 'balance', v_balance, 'referral', v_referral);
  end if;

  if p_webhook_id is not null then
    update loyalty.webhook_events set outcome = v_result ->> 'outcome' where webhook_id = p_webhook_id;
  end if;
  return v_result;
end
$$;

create function loyalty.record_refund(
  p_webhook_id text, p_refund_id bigint, p_order_id bigint, p_amount_cents bigint
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_customer bigint;
  v_claw integer;
  v_result jsonb;
begin
  if p_refund_id is null or p_refund_id <= 0 then raise exception 'invalid refund id'; end if;
  if p_order_id is null or p_order_id <= 0 then raise exception 'invalid order id'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'invalid amount'; end if;

  perform loyalty.lock_order(p_order_id);

  if p_webhook_id is not null then
    insert into loyalty.webhook_events (webhook_id, topic, outcome)
    values (p_webhook_id, 'refunds/create', 'processing')
    on conflict (webhook_id) do nothing;
    if not found then
      return jsonb_build_object('outcome', 'duplicate_delivery');
    end if;
  end if;

  insert into loyalty.refunds (refund_id, order_id, amount_cents)
  values (p_refund_id, p_order_id, p_amount_cents)
  on conflict (refund_id) do nothing;

  select customer_id into v_customer from loyalty.orders where order_id = p_order_id;
  if not found then
    v_result := jsonb_build_object('outcome', 'stored_until_order_awarded');
  else
    perform 1 from loyalty.members where customer_id = v_customer for update;
    v_claw := loyalty.apply_refund(p_refund_id);
    v_result := jsonb_build_object('outcome', 'applied', 'clawed_back', v_claw);
  end if;

  if p_webhook_id is not null then
    update loyalty.webhook_events set outcome = v_result ->> 'outcome' where webhook_id = p_webhook_id;
  end if;
  return v_result;
end
$$;

create function loyalty.claim_referral(p_customer_id bigint, p_code text, p_has_shopify_orders boolean)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_referrer bigint;
begin
  if p_has_shopify_orders is null then raise exception 'order check required'; end if;
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;
  perform loyalty.ensure_member(p_customer_id);
  select customer_id into v_referrer from loyalty.members where referral_code = v_code;
  if not found then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;
  if v_referrer = p_customer_id then
    return jsonb_build_object('outcome', 'self_referral');
  end if;

  perform 1 from loyalty.members
    where customer_id in (p_customer_id, v_referrer)
    order by customer_id for update;

  if exists (select 1 from loyalty.referrals where referee_id = p_customer_id) then
    return jsonb_build_object('outcome', 'already_claimed');
  end if;
  if p_has_shopify_orders or exists (select 1 from loyalty.orders where customer_id = p_customer_id) then
    return jsonb_build_object('outcome', 'not_new_customer');
  end if;
  if exists (select 1 from loyalty.referrals where referee_id = v_referrer and referrer_id = p_customer_id) then
    return jsonb_build_object('outcome', 'mutual_referral');
  end if;

  insert into loyalty.referrals (referrer_id, referee_id, code) values (v_referrer, p_customer_id, v_code);
  return jsonb_build_object('outcome', 'pending');
end
$$;

create function loyalty.get_member(p_customer_id bigint) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  m loyalty.members;
begin
  m := loyalty.ensure_member(p_customer_id);
  return jsonb_build_object(
    'customerId', m.customer_id::text,
    'points', m.points,
    'tier', loyalty.tier(m.total_spent_cents),
    'totalSpentCents', m.total_spent_cents,
    'referralCode', m.referral_code,
    'referralsCompleted', (select count(*) from loyalty.referrals where referrer_id = m.customer_id and status = 'completed'),
    'referralsPending', (select count(*) from loyalty.referrals where referrer_id = m.customer_id and status = 'pending'),
    'referredStatus', (select status from loyalty.referrals where referee_id = m.customer_id),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id::text, 'date', l.created_at, 'kind', l.kind, 'points', l.points,
               'balanceAfter', l.balance_after, 'description', l.description) order by l.id desc)
        from (select * from loyalty.ledger where customer_id = m.customer_id order by id desc limit 50) l
    ), '[]'::jsonb)
  );
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
