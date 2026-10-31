-- Manual handoff evidence only. Applying this migration never publishes a title.
create table if not exists public.bridge_loop_deliveries (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  version integer not null check (version > 0),
  rights_grant_id uuid not null references public.bridge_rights_grants(id) on delete restrict,
  model text not null check (model in ('TVOD', 'AVOD')),
  status text not null default 'PREPARED' check (status in ('PREPARED','DELIVERED','APPROVED','REJECTED','PUBLISHED')),
  snapshot_hash text not null,
  manifest jsonb not null,
  prepared_by text not null,
  created_at timestamptz not null default now(),
  delivered_by text,
  delivered_at timestamptz,
  handoff_reference text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  approval_reference text,
  published_at timestamptz,
  unique (title_id, version),
  check (status not in ('DELIVERED','APPROVED','REJECTED','PUBLISHED') or
    (delivered_by is not null and delivered_at is not null and handoff_reference is not null and length(handoff_reference) >= 8)),
  check (status not in ('APPROVED','REJECTED','PUBLISHED') or
    (reviewed_by is not null and reviewed_at is not null and review_note is not null and approval_reference is not null
      and length(review_note) >= 8 and length(approval_reference) >= 8 and reviewed_by <> delivered_by and reviewed_by <> prepared_by))
);
alter table public.bridge_loop_deliveries enable row level security;
-- No browser policies: verified, permission-checked server functions are the only entrypoint.
revoke all on public.bridge_loop_deliveries from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    execute 'revoke all on public.bridge_loop_deliveries from anon';
  end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all on public.bridge_loop_deliveries from authenticated';
  end if;
end $$;
