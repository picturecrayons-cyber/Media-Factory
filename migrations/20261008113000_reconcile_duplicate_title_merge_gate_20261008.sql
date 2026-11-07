-- Reconcile the live duplicate-title merge safety gate.
-- Idempotent because the schema may already have been repaired directly.
-- Server-only audit/alias surfaces remain inaccessible to anon/authenticated.

begin;

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

commit;
