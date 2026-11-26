-- Enforce append-only plan versions and membership lifecycle events.
begin;

create or replace function public.bridge_reject_immutable_membership_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Bridge membership plan versions and membership events are immutable; create a new plan version or append a new event.';
end;
$$;

revoke all on function public.bridge_reject_immutable_membership_change() from public, anon, authenticated;

drop trigger if exists bridge_membership_plans_immutable on public.bridge_membership_plans;
create trigger bridge_membership_plans_immutable
before update or delete on public.bridge_membership_plans
for each row execute function public.bridge_reject_immutable_membership_change();

drop trigger if exists bridge_membership_events_immutable on public.bridge_membership_events;
create trigger bridge_membership_events_immutable
before update or delete on public.bridge_membership_events
for each row execute function public.bridge_reject_immutable_membership_change();

commit;
