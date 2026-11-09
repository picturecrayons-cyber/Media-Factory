-- Reconcile the duplicate-title merge safety gate into migration history.
-- This is a STAGING-first migration candidate; it must not be applied to PRODUCTION.
-- The application migrator owns transaction boundaries; do not add BEGIN/COMMIT here.
-- Existing objects are preserved. IF NOT EXISTS guards avoid replacing live data.

create table if not exists public.bridge_title_merge_audits (
  merge_id uuid primary key default gen_random_uuid(),
  canonical_title_id text not null references public.bridge_titles(id) on delete restrict,
  retiring_title_id text not null,
  decision text not null check (decision in ('PREVIEW_SAFE','HOLD','BLOCK','MERGED','ROLLED_BACK')),
  decision_version text not null default 'v1',
  actor_user_id text,
  reason text,
  collision_scan jsonb not null default '{}'::jsonb,
  pre_merge_state jsonb not null default '{}'::jsonb,
  post_merge_state jsonb not null default '{}'::jsonb,
  rollback_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists bridge_title_merge_audits_titles_idx
  on public.bridge_title_merge_audits(canonical_title_id, retiring_title_id, created_at desc);

create table if not exists public.bridge_title_merge_aliases (
  retiring_title_id text primary key,
  canonical_title_id text not null references public.bridge_titles(id) on delete restrict,
  merge_id uuid not null references public.bridge_title_merge_audits(merge_id) on delete restrict,
  merged_at timestamptz not null default now()
);

alter table public.bridge_titles
  add column if not exists merged_into_title_id text references public.bridge_titles(id) on delete restrict;
alter table public.bridge_titles
  add column if not exists merged_at timestamptz;

create index if not exists bridge_titles_merged_into_idx
  on public.bridge_titles(merged_into_title_id);

create index if not exists bridge_title_merge_aliases_canonical_idx
  on public.bridge_title_merge_aliases(canonical_title_id);

-- Deny browser-role table privileges as well as RLS access.
-- Server-side application roles retain their separately configured permissions.
revoke all privileges on table public.bridge_title_merge_audits from anon, authenticated;
revoke all privileges on table public.bridge_title_merge_aliases from anon, authenticated;

alter table public.bridge_title_merge_audits enable row level security;
alter table public.bridge_title_merge_aliases enable row level security;

drop policy if exists bridge_title_merge_audits_no_client_access
  on public.bridge_title_merge_audits;
create policy bridge_title_merge_audits_no_client_access
  on public.bridge_title_merge_audits
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists bridge_title_merge_aliases_no_client_access
  on public.bridge_title_merge_aliases;
create policy bridge_title_merge_aliases_no_client_access
  on public.bridge_title_merge_aliases
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Fail closed if an existing object with the same name has an incompatible shape.
do $verify$
declare
  missing_columns text;
begin
  select string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
    into missing_columns
  from (values
    ('bridge_title_merge_audits', 'merge_id'),
    ('bridge_title_merge_audits', 'canonical_title_id'),
    ('bridge_title_merge_audits', 'retiring_title_id'),
    ('bridge_title_merge_audits', 'decision'),
    ('bridge_title_merge_audits', 'decision_version'),
    ('bridge_title_merge_audits', 'actor_user_id'),
    ('bridge_title_merge_audits', 'reason'),
    ('bridge_title_merge_audits', 'collision_scan'),
    ('bridge_title_merge_audits', 'pre_merge_state'),
    ('bridge_title_merge_audits', 'post_merge_state'),
    ('bridge_title_merge_audits', 'rollback_state'),
    ('bridge_title_merge_audits', 'created_at'),
    ('bridge_title_merge_audits', 'completed_at'),
    ('bridge_title_merge_aliases', 'retiring_title_id'),
    ('bridge_title_merge_aliases', 'canonical_title_id'),
    ('bridge_title_merge_aliases', 'merge_id'),
    ('bridge_title_merge_aliases', 'merged_at'),
    ('bridge_titles', 'merged_into_title_id'),
    ('bridge_titles', 'merged_at')
  ) as required(table_name, column_name)
  left join information_schema.columns existing
    on existing.table_schema = 'public'
   and existing.table_name = required.table_name
   and existing.column_name = required.column_name
  where existing.column_name is null;

  if missing_columns is not null then
    raise exception 'Duplicate-title merge migration schema mismatch; missing columns: %', missing_columns;
  end if;
end
$verify$;
