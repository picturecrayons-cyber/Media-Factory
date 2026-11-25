-- Backend owns service execution by default; approval decisions are routed separately.
-- assigned_provider remains the external/vendor provider field.
--
-- This service-request schema currently exists in Testing but not in the
-- Production baseline. Apply routing only where the complete table exists;
-- do not manufacture a partial Production table to satisfy migration replay.
DO $migration$
BEGIN
  IF to_regclass('public.bridge_service_requests') IS NULL THEN
    RAISE NOTICE 'Skipping service-request routing: public.bridge_service_requests is not installed in this environment';
    RETURN;
  END IF;

  EXECUTE $ddl$
-- Backend owns service execution by default; approval decisions are routed separately.
-- assigned_provider remains the external/vendor provider field.
alter table public.bridge_service_requests
  add column if not exists assigned_team text not null default 'backend',
  add column if not exists decision_required boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_service_requests_assigned_team_check'
      and conrelid = 'public.bridge_service_requests'::regclass
  ) then
    alter table public.bridge_service_requests
      add constraint bridge_service_requests_assigned_team_check
      check (assigned_team in ('backend', 'decision_queue'));
  end if;
end $$;

create or replace function public.bridge_route_service_request_team()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  -- Human decision checkpoints stay in a restricted decision queue.
  -- All other request lifecycle work is owned by backend services.
  if new.status in ('UNDER_REVIEW', 'QUOTE_READY', 'REVIEW') then
    new.assigned_team := 'decision_queue';
    new.decision_required := true;
  else
    new.assigned_team := 'backend';
    new.decision_required := false;
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_service_request_team_routing on public.bridge_service_requests;
create trigger bridge_service_request_team_routing
before insert or update of status on public.bridge_service_requests
for each row execute function public.bridge_route_service_request_team();

create index if not exists bridge_service_requests_team_queue_idx
  on public.bridge_service_requests (assigned_team, decision_required, status, created_at desc);

comment on column public.bridge_service_requests.assigned_team is
  'Internal execution ownership: backend for automated processing; decision_queue for authorized human decisions.';
comment on column public.bridge_service_requests.decision_required is
  'True only at explicit human decision checkpoints; not a request for Super Admin to perform backend execution.';

  $ddl$;
END
$migration$;
