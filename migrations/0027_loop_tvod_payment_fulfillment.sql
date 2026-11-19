-- Explicit Super Admin approval of consumer TVOD pricing; never rely on legacy Loop price defaults.
create table if not exists public.bridge_loop_consumer_pricing (
  bridge_title_id text primary key references public.bridge_titles(id) on delete cascade,
  access_tier text not null default 'TVOD' check (access_tier='TVOD'),
  rental_price_inr numeric(10,2) not null check (rental_price_inr > 0),
  purchase_price_inr numeric(10,2) check (purchase_price_inr is null or purchase_price_inr > 0),
  status text not null default 'APPROVED' check (status in ('APPROVED','REVOKED')),
  approved_by text not null references public.bridge_profiles(user_id) on delete restrict,
  approved_at timestamptz not null,
  approval_note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bridge_loop_consumer_pricing enable row level security;
revoke all on table public.bridge_loop_consumer_pricing from public,anon,authenticated;
grant select,insert,update on table public.bridge_loop_consumer_pricing to service_role;

-- Paid Loop TVOD rental orders. A pending order never creates playback entitlement.
-- Text identity columns keep this migration compatible with legacy text IDs and the current UUID Loop schema.
create table if not exists public.loop_tvod_orders (
  id uuid primary key default gen_random_uuid(),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  user_id text not null,
  loop_title_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  access_type text not null default 'RENTAL' check (access_type = 'RENTAL'),
  status text not null default 'pending' check (status in ('pending','captured','fulfilled','failed','refunded')),
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loop_tvod_orders_user_idx on public.loop_tvod_orders(user_id,created_at desc);
create index if not exists loop_tvod_orders_title_idx on public.loop_tvod_orders(loop_title_id,created_at desc);
alter table public.loop_tvod_orders enable row level security;
revoke all on table public.loop_tvod_orders from public, anon, authenticated;
grant select,insert,update on table public.loop_tvod_orders to service_role;

-- Keep the canonical Loop payment ledger available for older migration targets as well.
create table if not exists public.loop_payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_name text not null,
  razorpay_payment_id text,
  user_id uuid references auth.users(id),
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists loop_payment_events_payment_idx on public.loop_payment_events(razorpay_payment_id);
alter table public.loop_payment_events enable row level security;
revoke all on table public.loop_payment_events from public, anon;
revoke insert,update,delete on table public.loop_payment_events from authenticated;
grant select on table public.loop_payment_events to authenticated;
grant select,insert,update on table public.loop_payment_events to service_role;
drop policy if exists loop_payment_events_own_read on public.loop_payment_events;
create policy loop_payment_events_own_read on public.loop_payment_events
  for select to authenticated using ((select auth.uid())=user_id);

-- Dedicated normalized event ledger avoids coupling this TVOD flow to legacy Loop payment-event shapes.
create table if not exists public.loop_tvod_payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_name text not null,
  razorpay_payment_id text,
  user_id text,
  loop_title_id text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists loop_tvod_payment_events_payment_idx
  on public.loop_tvod_payment_events(razorpay_payment_id);
alter table public.loop_tvod_payment_events enable row level security;
revoke all on table public.loop_tvod_payment_events from public, anon, authenticated;
grant select,insert,update on table public.loop_tvod_payment_events to service_role;

-- One durable row per provider refund; supports retries and multiple partial refunds.
create table if not exists public.loop_tvod_refunds (
  refund_id text primary key,
  payment_id text not null,
  provider_order_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency='INR'),
  created_at timestamptz not null default now()
);
create index if not exists loop_tvod_refunds_payment_idx
  on public.loop_tvod_refunds(payment_id);
alter table public.loop_tvod_refunds enable row level security;
revoke all on table public.loop_tvod_refunds from public,anon,authenticated;
grant select,insert,update on table public.loop_tvod_refunds to service_role;

-- Canonical entitlement table is present in the current Loop schema; create it on legacy installs too.
create table if not exists public.loop_user_tvod_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title_id uuid not null,
  access_type text not null check (access_type in ('RENTAL','PURCHASE')),
  purchased_at timestamptz not null default now(),
  started_watching_at timestamptz,
  expires_at timestamptz,
  payment_transaction_id text not null,
  status text not null default 'ACTIVE',
  unique(user_id,title_id,access_type)
);
create index if not exists loop_user_tvod_entitlements_user_title_idx
  on public.loop_user_tvod_entitlements(user_id,title_id,status);
alter table public.loop_user_tvod_entitlements enable row level security;
revoke all on table public.loop_user_tvod_entitlements from public, anon;
revoke insert,update,delete on table public.loop_user_tvod_entitlements from authenticated;
grant select on table public.loop_user_tvod_entitlements to authenticated;
grant select,insert,update on table public.loop_user_tvod_entitlements to service_role;
drop policy if exists loop_tvod_own_read on public.loop_user_tvod_entitlements;
create policy loop_tvod_own_read on public.loop_user_tvod_entitlements
  for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.loop_fulfill_captured_rental(p_order_id text,p_payment_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  rental public.loop_tvod_orders%rowtype;
  prior_event public.loop_tvod_payment_events%rowtype;
  prior_entitlement public.loop_user_tvod_entitlements%rowtype;
  payload jsonb;
  expiry timestamptz;
begin
  if nullif(p_order_id,'') is null or nullif(p_payment_id,'') is null then raise exception 'TVOD payment identity is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loop-order:' || p_order_id,0));
  select * into rental from public.loop_tvod_orders where provider_order_id=p_order_id for update;
  if not found then raise exception 'TVOD order not found'; end if;
  if rental.provider_payment_id is distinct from p_payment_id then raise exception 'TVOD payment does not match persisted order'; end if;
  if rental.status not in ('captured','fulfilled') or rental.captured_at is null then raise exception 'TVOD order is not captured'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loop-user-title:' || rental.user_id || ':' || rental.loop_title_id,0));
  select * into prior_event from public.loop_tvod_payment_events where event_id='tvod:' || p_payment_id for update;
  payload := pg_catalog.jsonb_build_object('order_id',p_order_id,'title_id',rental.loop_title_id,
    'amount_paise',rental.amount_paise,'currency',rental.currency,'purchased_at',rental.captured_at,
    'expires_at',rental.captured_at + interval '48 hours');
  if found then
    if prior_event.user_id is distinct from rental.user_id or prior_event.razorpay_payment_id is distinct from p_payment_id
       or prior_event.payload is distinct from payload then raise exception 'TVOD payment event identity mismatch'; end if;
    if prior_event.status='processed' then return pg_catalog.jsonb_build_object('deduplicated',true,'status','fulfilled'); end if;
    if prior_event.status='refunded' then raise exception 'Refunded TVOD payment cannot grant playback'; end if;
    raise exception 'TVOD payment event requires reconciliation';
  end if;
  if not exists (
    select 1 from public.loop_titles t
    join public.bridge_loop_publications p on p.loop_title_id::text=t.id::text and p.bridge_title_id=t.bridge_title_id
    join public.bridge_loop_consumer_pricing cp on cp.bridge_title_id=p.bridge_title_id
      and cp.status='APPROVED' and cp.access_tier='TVOD' and cp.rental_price_inr=t.tvod_rental_price
    where t.id::text=rental.loop_title_id and t.status='approved' and t.listed and t.published and t.access_tier='TVOD'
      and pg_catalog.round(t.tvod_rental_price::numeric * 100)::bigint = rental.amount_paise
      and p.authorization_status='authorized' and p.revoked_at is null and p.approved_at is not null
      and p.window_start <= rental.captured_at and p.window_end > rental.captured_at
      and 'WORLDWIDE'=any(p.territories) and 'TVOD'=any(p.exploitation_models)
  ) then raise exception 'TVOD publication, price or rights window is no longer valid'; end if;
  select * into prior_entitlement from public.loop_user_tvod_entitlements
    where user_id=rental.user_id::uuid and title_id=rental.loop_title_id::uuid and access_type='RENTAL' for update;
  if found and prior_entitlement.purchased_at >= rental.captured_at
     and prior_entitlement.payment_transaction_id <> p_payment_id then raise exception 'A newer TVOD entitlement exists; reconcile before fulfillment'; end if;
  if found and prior_entitlement.payment_transaction_id=p_payment_id and prior_entitlement.status <> 'ACTIVE'
     then raise exception 'Revoked TVOD entitlement cannot be reactivated'; end if;
  expiry := rental.captured_at + interval '48 hours';
  insert into public.loop_user_tvod_entitlements(user_id,title_id,access_type,purchased_at,expires_at,payment_transaction_id,status)
  values(rental.user_id::uuid,rental.loop_title_id::uuid,'RENTAL',rental.captured_at,expiry,p_payment_id,'ACTIVE')
  on conflict(user_id,title_id,access_type) do update
    set purchased_at=excluded.purchased_at,expires_at=excluded.expires_at,
        payment_transaction_id=excluded.payment_transaction_id,status='ACTIVE';
  insert into public.loop_tvod_payment_events(event_id,event_name,razorpay_payment_id,user_id,loop_title_id,status,payload,processed_at)
  values('tvod:' || p_payment_id,'tvod_fulfilled',p_payment_id,rental.user_id,rental.loop_title_id,'processed',payload,now());
  update public.loop_tvod_orders set status='fulfilled',updated_at=now() where id=rental.id and status='captured';
  return pg_catalog.jsonb_build_object('deduplicated',false,'status','fulfilled','title_id',rental.loop_title_id,'access_type','RENTAL','expires_at',expiry);
end $$;
revoke all on function public.loop_fulfill_captured_rental(text,text) from public, anon, authenticated;
grant execute on function public.loop_fulfill_captured_rental(text,text) to service_role;

-- Preserve the legacy two-argument rental refund function. The TVOD overload below
-- records every provider refund separately and revokes playback only after a full refund.
create or replace function public.loop_refund_captured_rental(
  p_payment_id text,p_refund_id text,p_order_id text,p_refund_amount_paise bigint
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  prior_event public.loop_tvod_payment_events%rowtype;
  rental public.loop_tvod_orders%rowtype;
  prior_refund public.loop_tvod_refunds%rowtype;
  refund_total bigint;
  inserted_rows integer;
  fully_refunded boolean;
begin
  if nullif(p_payment_id,'') is null or nullif(p_refund_id,'') is null then
    raise exception 'Refund identity is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('loop-payment:' || p_payment_id,0));

  if p_order_id is not null then
    select * into rental from public.loop_tvod_orders where provider_order_id=p_order_id for update;
  else
    select * into rental from public.loop_tvod_orders where provider_payment_id=p_payment_id for update;
  end if;
  if not found then raise exception 'Loop TVOD refund order not found'; end if;
  if rental.provider_payment_id is not null and rental.provider_payment_id<>p_payment_id then
    raise exception 'Refund payment does not match Loop TVOD order';
  end if;
  if p_refund_amount_paise is null or p_refund_amount_paise <= 0 then
    raise exception 'Refund amount must be a positive integer in paise';
  end if;
  if rental.currency <> 'INR' then raise exception 'Only INR TVOD refunds are supported'; end if;

  insert into public.loop_tvod_refunds(refund_id,payment_id,provider_order_id,amount_paise,currency)
  values(p_refund_id,p_payment_id,rental.provider_order_id,p_refund_amount_paise,'INR')
  on conflict(refund_id) do nothing;
  get diagnostics inserted_rows = row_count;

  select * into prior_refund from public.loop_tvod_refunds where refund_id=p_refund_id;
  if prior_refund.payment_id is distinct from p_payment_id
     or prior_refund.provider_order_id is distinct from rental.provider_order_id
     or prior_refund.amount_paise is distinct from p_refund_amount_paise then
    raise exception 'Refund identity collision';
  end if;

  select coalesce(sum(amount_paise),0)::bigint into refund_total
    from public.loop_tvod_refunds where payment_id=p_payment_id;
  if refund_total > rental.amount_paise then
    raise exception 'Cumulative refunds exceed the captured payment amount';
  end if;
  fully_refunded := refund_total >= rental.amount_paise;

  select * into prior_event from public.loop_tvod_payment_events
    where event_id='tvod:' || p_payment_id for update;

  if not found then
    update public.loop_tvod_orders
      set provider_payment_id=coalesce(provider_payment_id,p_payment_id),
          status=case when fully_refunded then 'refunded' else status end,
          updated_at=now()
      where id=rental.id;
    return pg_catalog.jsonb_build_object(
      'processed',true,'refund_before_fulfillment',true,
      'duplicate',inserted_rows=0,'refund_total_paise',refund_total,
      'fully_refunded',fully_refunded
    );
  end if;

  if fully_refunded then
    update public.loop_user_tvod_entitlements set status='REFUNDED'
      where payment_transaction_id=p_payment_id
        and user_id=prior_event.user_id::uuid and title_id=prior_event.loop_title_id::uuid;
  end if;

  update public.loop_tvod_payment_events
    set status=case when fully_refunded then 'refunded' else 'processed' end,
        event_name=case when fully_refunded then 'tvod_refunded' else 'tvod_partially_refunded' end,
        payload=payload || pg_catalog.jsonb_build_object(
          'last_refund_id',p_refund_id,'refund_total_paise',refund_total,
          'fully_refunded',fully_refunded
        ),
        processed_at=now()
    where id=prior_event.id;

  update public.loop_tvod_orders
    set provider_payment_id=coalesce(provider_payment_id,p_payment_id),
        status=case when fully_refunded then 'refunded' else status end,
        updated_at=now()
    where id=rental.id;

  return pg_catalog.jsonb_build_object(
    'processed',true,'duplicate',inserted_rows=0,
    'payment_id',p_payment_id,'refund_id',p_refund_id,
    'refund_total_paise',refund_total,'fully_refunded',fully_refunded,
    'status',case when fully_refunded then 'refunded' else 'partially_refunded' end
  );
end $$;
revoke all on function public.loop_refund_captured_rental(text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.loop_refund_captured_rental(text,text,text,bigint) to service_role;

-- Compatibility overload for existing three-argument TVOD callers: omission of an
-- amount means a full refund, while the webhook always supplies Razorpay's amount.
create or replace function public.loop_refund_captured_rental(
  p_payment_id text,p_refund_id text,p_order_id text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  order_amount bigint;
begin
  select amount_paise into order_amount from public.loop_tvod_orders
    where provider_order_id=p_order_id;
  if order_amount is null then raise exception 'Loop TVOD refund order not found'; end if;
  return public.loop_refund_captured_rental(p_payment_id,p_refund_id,p_order_id,order_amount);
end $$;
revoke all on function public.loop_refund_captured_rental(text,text,text) from public, anon, authenticated;
grant execute on function public.loop_refund_captured_rental(text,text,text) to service_role;

create or replace function public.loop_rental_fulfillment_ready()
returns boolean language sql security invoker set search_path = ''
as $$ select to_regprocedure('public.loop_fulfill_captured_rental(text,text)') is not null $$;
revoke all on function public.loop_rental_fulfillment_ready() from public, anon, authenticated;
grant execute on function public.loop_rental_fulfillment_ready() to service_role;
