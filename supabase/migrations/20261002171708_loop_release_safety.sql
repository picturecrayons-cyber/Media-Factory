-- Reviewed migration candidate; do not apply without reconciliation against shared history.
-- Consumer catalog is served by /api/titles/public, which checks Bridge authorization.
-- Browser table reads must not bypass that service or disclose raw playback keys/metadata.
-- No policies granting additional rights and no fabricated business rows.
alter table public.loop_titles enable row level security;
drop policy if exists loop_titles_public_read on public.loop_titles;
create policy loop_titles_public_read on public.loop_titles for select to anon, authenticated using (false);
create policy loop_titles_consumer_api_only on public.loop_titles as restrictive for select to anon, authenticated using (false);

-- Called only after provider capture/product/owner/signature reconciliation by the server.
-- Invoker permissions + execute revocations keep this RPC unavailable to browser callers.
create or replace function public.loop_fulfill_captured_rental(
  p_payment_id text, p_order_id text, p_user_id uuid, p_title_id uuid,
  p_purchased_at timestamptz, p_expires_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.loop_payment_events%rowtype;
  entitlement public.loop_user_tvod_entitlements%rowtype;
  payload jsonb;
begin
  if nullif(p_payment_id,'') is null or nullif(p_order_id,'') is null or
     p_user_id is null or p_title_id is null or p_purchased_at is null or
     p_expires_at is null or p_purchased_at > now() + interval '1 minute' or
     p_expires_at <> p_purchased_at + interval '48 hours' then
    raise exception 'Invalid rental inputs';
  end if;
  -- Serialize callbacks for one payment, then concurrent purchases of the same title.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment:' || p_payment_id, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_title_id::text, 0));
  select * into existing from public.loop_payment_events where event_id='tvod:' || p_payment_id for update;
  payload := pg_catalog.jsonb_build_object('order_id',p_order_id,'title_id',p_title_id,
    'purchased_at',p_purchased_at,'expires_at',p_expires_at);
  if found then
    if existing.user_id is distinct from p_user_id or existing.razorpay_payment_id is distinct from p_payment_id
       or existing.payload is distinct from payload then raise exception 'Payment identity mismatch'; end if;
    if existing.status not in ('processed','refunded') then raise exception 'Payment reconciliation required'; end if;
    return pg_catalog.jsonb_build_object('deduplicated',true,'status',existing.status,'expires_at',p_expires_at);
  end if;
  -- Authorization can be revoked between checkout and capture. Hold for reconciliation.
  if not exists (
    select 1 from public.loop_titles t join public.bridge_loop_publications p
      on p.loop_title_id=t.id and p.bridge_title_id=t.bridge_title_id
    where t.id=p_title_id and t.status='approved' and t.listed and t.published and t.access_tier='TVOD'
      and p.authorization_status='authorized' and p.revoked_at is null and p.approved_at is not null
      and p.window_start <= now() and p.window_end > now()
      and 'WORLDWIDE'=any(p.territories) and 'TVOD'=any(p.exploitation_models)
  ) then raise exception 'Publication unavailable'; end if;
  select * into entitlement from public.loop_user_tvod_entitlements
    where user_id=p_user_id and title_id=p_title_id and access_type='RENTAL' for update;
  -- An older delayed callback cannot overwrite a newer purchase or revive a revoked one.
  if found and entitlement.purchased_at >= p_purchased_at and entitlement.payment_transaction_id <> p_payment_id then
    raise exception 'Newer entitlement requires reconciliation';
  end if;
  if found and entitlement.payment_transaction_id=p_payment_id and entitlement.status <> 'ACTIVE' then
    raise exception 'Revoked entitlement requires reconciliation';
  end if;
  insert into public.loop_user_tvod_entitlements(user_id,title_id,access_type,purchased_at,expires_at,payment_transaction_id,status)
    values(p_user_id,p_title_id,'RENTAL',p_purchased_at,p_expires_at,p_payment_id,'ACTIVE')
    on conflict(user_id,title_id,access_type) do update
    set purchased_at=excluded.purchased_at, expires_at=excluded.expires_at,
        payment_transaction_id=excluded.payment_transaction_id, status=excluded.status;
  insert into public.loop_payment_events(event_id,event_name,razorpay_payment_id,user_id,status,payload,processed_at)
    values('tvod:' || p_payment_id,'tvod_fulfilled',p_payment_id,p_user_id,'processed',payload,now());
  return pg_catalog.jsonb_build_object('type','TVOD','title_id',p_title_id,'access_type','RENTAL','status','ACTIVE','expires_at',p_expires_at);
end $$;
revoke all on function public.loop_fulfill_captured_rental(text,text,uuid,uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.loop_fulfill_captured_rental(text,text,uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.loop_refund_captured_rental(p_payment_id text, p_refund_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.loop_payment_events%rowtype;
begin
  if nullif(p_payment_id,'') is null or nullif(p_refund_id,'') is null then raise exception 'Refund identity missing'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment:' || p_payment_id, 0));
  select * into existing from public.loop_payment_events where event_id='tvod:' || p_payment_id for update;
  if not found then
    -- Refund-before-capture: preserve a tombstone so delayed capture cannot grant access.
    insert into public.loop_payment_events(event_id,event_name,razorpay_payment_id,status,payload,processed_at)
      values('tvod:' || p_payment_id,'tvod_refunded',p_payment_id,'refunded',pg_catalog.jsonb_build_object('refund_id',p_refund_id),now());
    return pg_catalog.jsonb_build_object('processed',true,'refund_before_capture',true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(existing.user_id::text || ':' || (existing.payload->>'title_id'), 0));
  update public.loop_user_tvod_entitlements set status='REFUNDED'
    where payment_transaction_id=p_payment_id and user_id=existing.user_id and title_id=(existing.payload->>'title_id')::uuid;
  update public.loop_payment_events set status='refunded',processed_at=now() where id=existing.id;
  return pg_catalog.jsonb_build_object('processed',true,'payment_id',p_payment_id,'refund_id',p_refund_id);
end $$;
revoke all on function public.loop_refund_captured_rental(text,text) from public, anon, authenticated;
grant execute on function public.loop_refund_captured_rental(text,text) to service_role;

-- Read-only preflight prevents creating a payable order before this migration exists.
create or replace function public.loop_rental_fulfillment_ready() returns boolean
language sql security invoker set search_path = '' as $$ select true $$;
revoke all on function public.loop_rental_fulfillment_ready() from public, anon, authenticated;
grant execute on function public.loop_rental_fulfillment_ready() to service_role;
