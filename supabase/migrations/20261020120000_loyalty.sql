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
--     customer's first paid order of at least S$1, and both are reversed if
--     refunds leave less than S$1 of that order.
--   * Arrival order does not matter: after every order or refund the
--     customer's tier rates are re-priced in payment order (processed_at)
--     and the referral is worked out from the order that was really paid
--     first, so the final balances are the same however Shopify's webhooks
--     arrive (see reconcile_customer).
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
  multiplier_x10 integer not null check (multiplier_x10 in (10, 15, 20)),
  points_earned  integer not null check (points_earned >= 0),
  refunded_cents bigint not null default 0,
  points_clawed  integer not null default 0,
  created_at     timestamptz not null default now(),
  check (refunded_cents between 0 and amount_cents),
  check (points_clawed between 0 and points_earned)
);
create index orders_customer_idx on loyalty.orders (customer_id, processed_at, order_id);

-- Refunds are stored as Shopify reported them, even before their order has
-- been awarded (webhook order is not guaranteed); record_paid_order applies
-- them later. The merchandise amount is worked out against the order when
-- applied (see apply_refund) and kept in amount_cents.
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
create unique index ledger_one_refund on loyalty.ledger (refund_id) where kind = 'refund';
-- Referral entries are not unique: reconcile_customer posts whatever brings
-- each side's net bonus to 100 or 0, so a referral can be undone and redone.
create index ledger_referral_idx on loyalty.ledger (referral_id, customer_id) where referral_id is not null;
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
-- and the member row locks. Returns points clawed back, or null when the
-- order has not been awarded yet (refund stays pending).
--
-- Merchandise refunded is the larger of the refunded items' subtotal and the
-- money returned minus shipping, duties, extra fees and (for tax-exclusive
-- prices) the items' tax. That covers item refunds, amount-only refunds and
-- refunds where staff returned more than the items. Money returned in the
-- customer's currency has its exclusions taken off in that currency, is
-- added to the order's running total of merchandise refunded in that
-- currency, and only the running total is converted with the order's own
-- exchange ratio, so refunding everything adds up to the whole order. An
-- unknown currency falls back to the items' subtotal.
create function loyalty.apply_refund(p_refund_id bigint) returns integer
language plpgsql volatile set search_path = '' as $$
declare
  r loyalty.refunds;
  o loyalty.orders;
  v_tx_merch bigint;
  v_merch_p bigint;
  v_presentment_after bigint;
  v_amount bigint;
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

  v_presentment_after := o.refunded_presentment_cents;
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
    v_presentment_after := o.refunded_presentment_cents + v_merch_p;
    v_tx_merch := round(v_presentment_after::numeric * o.amount_cents / o.presentment_cents)::bigint
                - round(o.refunded_presentment_cents::numeric * o.amount_cents / o.presentment_cents)::bigint;
  else
    v_tx_merch := null;
  end if;
  v_amount := greatest(r.line_cents, coalesce(v_tx_merch, 0), 0);

  v_refunded := least(o.refunded_cents + v_amount, o.amount_cents);
  -- Clawback so far should equal what the refunded part earned, computed on
  -- the running total so repeated partial refunds never drift.
  v_target := o.points_earned - ((o.amount_cents - v_refunded) * o.multiplier_x10 / 1000)::integer;
  v_claw := greatest(v_target - o.points_clawed, 0);

  update loyalty.orders
     set refunded_cents = v_refunded, points_clawed = points_clawed + v_claw,
         refunded_presentment_cents = v_presentment_after
   where order_id = o.order_id;
  update loyalty.members
     set total_spent_cents = greatest(total_spent_cents - (v_refunded - o.refunded_cents), 0), updated_at = now()
   where customer_id = o.customer_id;
  if v_claw > 0 then
    perform loyalty.add_points(o.customer_id, 'refund', -v_claw,
      'Refund on order ' || coalesce(o.order_name, '#' || o.order_id::text),
      o.order_id, r.refund_id, null);
  end if;

  update loyalty.refunds set applied = true, amount_cents = v_amount where refund_id = r.refund_id;
  return v_claw;
end
$$;

-- Brings one customer's awards in line with the full history we know of,
-- independent of the order in which webhooks arrived:
--   1. each order's tier rate comes from the net spend (after refunds) of the
--      orders paid before it (processed_at); any change is posted as a
--      tier_adjustment entry;
--   2. their referral (as the new customer) follows their first paid order
--      of at least S$1: completed while it keeps at least S$1, reversed once
--      it keeps less, pending while there is none. Each side's net referral
--      points are brought to 100 or 0.
-- Caller holds the member locks of the customer and of their referrer.
create function loyalty.reconcile_customer(p_customer_id bigint) returns void
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
    select * from loyalty.orders where customer_id = p_customer_id
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
        perform loyalty.add_points(p_customer_id, 'tier_adjustment', v_delta,
          'Tier rate updated for order ' || coalesce(o.order_name, '#' || o.order_id::text), o.order_id, null, null);
      end if;
    end if;
    v_before := v_before + o.amount_cents - o.refunded_cents;
  end loop;

  select * into ref from loyalty.referrals where referee_id = p_customer_id for update;
  if not found then
    return;
  end if;
  select * into v_first from loyalty.orders
   where customer_id = p_customer_id and amount_cents >= 100
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
    select ref.referee_id as customer_id, 'referral_welcome' as up, 'Welcome bonus: referred by a friend' as up_text,
           'Welcome bonus reversed: first order refunded' as down_text
    union all
    select ref.referrer_id, 'referral_reward', 'Referral bonus: a friend placed their first order',
           'Referral bonus reversed: friend''s first order refunded'
  loop
    select coalesce(sum(points), 0)::integer into v_have
      from loyalty.ledger where referral_id = ref.id and customer_id = v_side.customer_id;
    if v_want <> v_have then
      perform loyalty.add_points(v_side.customer_id,
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
  p_webhook_id text, p_order_id bigint, p_customer_id bigint, p_order_name text, p_amount_cents bigint,
  p_presentment_cents bigint default null, p_presentment_currency text default null, p_taxes_included boolean default true,
  p_processed_at timestamptz default null
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_referrer bigint;
  v_referrer_now bigint;
  v_processed timestamptz := coalesce(p_processed_at, now());
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

    -- Lock the member rows in id order (customer, and their referrer if they
    -- were referred) so concurrent orders cannot deadlock.
    select referrer_id into v_referrer from loyalty.referrals where referee_id = p_customer_id;
    perform 1 from loyalty.members
      where customer_id in (p_customer_id, v_referrer)
      order by customer_id for update;
    select referrer_id into v_referrer_now from loyalty.referrals where referee_id = p_customer_id;
    if v_referrer is distinct from v_referrer_now then
      -- Claimed between our lookup and our lock: retry with the right lock order.
      raise exception 'referral changed while locking' using errcode = '40001';
    end if;

    -- Tier rate from what was paid before this order (later orders are
    -- re-priced by reconcile_customer if this one arrived late).
    select coalesce(sum(amount_cents - refunded_cents), 0) into v_spent
      from loyalty.orders
     where customer_id = p_customer_id and (processed_at, order_id) < (v_processed, p_order_id);
    v_mult := loyalty.multiplier_x10(v_spent);
    v_points := (p_amount_cents * v_mult / 1000)::integer;

    insert into loyalty.orders (order_id, customer_id, order_name, processed_at, amount_cents, multiplier_x10, points_earned,
                                presentment_cents, presentment_currency, taxes_included)
    values (p_order_id, p_customer_id, p_order_name, v_processed, p_amount_cents, v_mult, v_points,
            p_presentment_cents, p_presentment_currency, coalesce(p_taxes_included, true));
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

    perform loyalty.reconcile_customer(p_customer_id);

    select status into v_referral from loyalty.referrals
      where referee_id = p_customer_id and qualifying_order_id = p_order_id;

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
  p_webhook_id text, p_refund_id bigint, p_order_id bigint,
  p_line_cents bigint, p_line_tax_cents bigint, p_tx_cents bigint, p_tx_currency text, p_other_cents bigint,
  p_other_presentment_cents bigint default null, p_line_tax_presentment_cents bigint default null
) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_customer bigint;
  v_referrer bigint;
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

  select customer_id into v_customer from loyalty.orders where order_id = p_order_id;
  if not found then
    v_result := jsonb_build_object('outcome', 'stored_until_order_awarded');
  else
    -- Lock the customer and, if they were referred, their referrer, in id
    -- order like every other path.
    select referrer_id into v_referrer from loyalty.referrals where referee_id = v_customer;
    perform 1 from loyalty.members
      where customer_id in (v_customer, v_referrer)
      order by customer_id for update;
    if v_referrer is distinct from (select referrer_id from loyalty.referrals where referee_id = v_customer) then
      raise exception 'referral changed while locking' using errcode = '40001';
    end if;
    v_claw := loyalty.apply_refund(p_refund_id);
    perform loyalty.reconcile_customer(v_customer);
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
  perform loyalty.ensure_member(p_customer_id);
  -- Hold the member row so no award or claim commits while we read the
  -- balance, history and referral counts.
  select * into strict m from loyalty.members where customer_id = p_customer_id for share;
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
