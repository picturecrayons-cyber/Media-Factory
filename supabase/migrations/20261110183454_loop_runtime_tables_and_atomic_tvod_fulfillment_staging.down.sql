-- STAGING rollback for 20261110183454.
-- This rollback is intentionally blocked once any runtime data exists.
do $guard$
begin
  if exists (select 1 from public.loop_plans)
     or exists (select 1 from public.loop_subscriptions)
     or exists (select 1 from public.loop_user_tvod_entitlements)
     or exists (select 1 from public.loop_payment_events)
     or exists (select 1 from public.loop_watch_progress)
     or exists (select 1 from public.loop_media_migration_queue) then
    raise exception 'Rollback blocked: Loop runtime tables contain data; export and reconcile before any destructive action';
  end if;
end
$guard$;

drop function if exists public.loop_refund_captured_rental(text,text);
drop function if exists public.loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz);

drop table if exists public.loop_media_migration_queue;
drop table if exists public.loop_watch_progress;
drop table if exists public.loop_payment_events;
drop table if exists public.loop_user_tvod_entitlements;
drop table if exists public.loop_subscriptions;
drop table if exists public.loop_plans;
