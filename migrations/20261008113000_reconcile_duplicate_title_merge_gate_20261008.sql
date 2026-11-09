-- Reconcile the live duplicate-title merge safety gate.
-- Idempotent against partial schema from migrations/0020_duplicate_title_merge_gate.sql.
-- Server-only audit/alias surfaces remain inaccessible to anon/authenticated.

begin;

create table if not exists public.bridge_title_merge_audits (
  merge_id uuid primary key default gen_random_uuid(),
  canonical_title_id text not null,
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

alter table public.bridge_title_merge_audits
  add column if not exists decision_version text not null default 'v1';
alter table public.bridge_title_merge_audits
  add column if not exists actor_user_id text;
alter table public.bridge_title_merge_audits
  add column if not exists reason text;
alter table public.bridge_title_merge_audits
  add column if not exists collision_scan jsonb not null default '{}'::jsonb;
alter table public.bridge_title_merge_audits
  add column if not exists pre_merge_state jsonb not null default '{}'::jsonb;
alter table public.bridge_title_merge_audits
  add column if not exists post_merge_state jsonb not null default '{}'::jsonb;
alter table public.bridge_title_merge_audits
  add column if not exists rollback_state jsonb not null default '{}'::jsonb;
alter table public.bridge_title_merge_audits
  add column if not exists created_at timestamptz not null default now();
alter table public.bridge_title_merge_audits
  add column if not exists completed_at timestamptz;

do $$
begin
  -- FKs (RESTRICT)
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_audits'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%canonical_title_id%bridge_titles%'
  ) then
    alter table public.bridge_title_merge_audits
      add constraint bridge_title_merge_audits_canonical_fk
      foreign key (canonical_title_id) references public.bridge_titles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_audits'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%retiring_title_id%bridge_titles%'
  ) then
    alter table public.bridge_title_merge_audits
      add constraint bridge_title_merge_audits_retiring_fk
      foreign key (retiring_title_id) references public.bridge_titles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_audits'::regclass
      and conname = 'bridge_title_merge_audits_no_self_merge'
  ) then
    alter table public.bridge_title_merge_audits
      add constraint bridge_title_merge_audits_no_self_merge
      check (canonical_title_id <> retiring_title_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_audits'::regclass
      and conname = 'bridge_title_merge_audits_merged_requires_completed'
  ) then
    alter table public.bridge_title_merge_audits
      add constraint bridge_title_merge_audits_merged_requires_completed
      check (decision <> 'MERGED' or completed_at is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_audits'::regclass
      and conname = 'bridge_title_merge_audits_rolled_back_requires_evidence'
  ) then
    alter table public.bridge_title_merge_audits
      add constraint bridge_title_merge_audits_rolled_back_requires_evidence
      check (decision <> 'ROLLED_BACK' or (rollback_state is not null and rollback_state <> '{}'::jsonb));
  end if;
end $$;

create index if not exists bridge_title_merge_audits_titles_idx
  on public.bridge_title_merge_audits(canonical_title_id, retiring_title_id, created_at desc);

create table if not exists public.bridge_title_merge_aliases (
  retiring_title_id text primary key,
  canonical_title_id text not null,
  merge_id uuid not null,
  merged_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_aliases'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%retiring_title_id%bridge_titles%'
  ) then
    alter table public.bridge_title_merge_aliases
      add constraint bridge_title_merge_aliases_retiring_fk
      foreign key (retiring_title_id) references public.bridge_titles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_aliases'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%canonical_title_id%bridge_titles%'
  ) then
    alter table public.bridge_title_merge_aliases
      add constraint bridge_title_merge_aliases_canonical_fk
      foreign key (canonical_title_id) references public.bridge_titles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_aliases'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%merge_id%bridge_title_merge_audits%'
  ) then
    alter table public.bridge_title_merge_aliases
      add constraint bridge_title_merge_aliases_merge_fk
      foreign key (merge_id) references public.bridge_title_merge_audits(merge_id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_title_merge_aliases'::regclass
      and conname = 'bridge_title_merge_aliases_no_self_merge'
  ) then
    alter table public.bridge_title_merge_aliases
      add constraint bridge_title_merge_aliases_no_self_merge
      check (retiring_title_id <> canonical_title_id);
  end if;
end $$;

alter table public.bridge_titles
  add column if not exists merged_into_title_id text;
alter table public.bridge_titles
  add column if not exists merged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%merged_into_title_id%'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_merged_into_fk
      foreign key (merged_into_title_id) references public.bridge_titles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and conname = 'bridge_titles_merge_pointer_paired'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_merge_pointer_paired
      check (
        (merged_into_title_id is null and merged_at is null)
        or (merged_into_title_id is not null and merged_at is not null)
      );
  end if;
end $$;

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

revoke all on table public.bridge_title_merge_audits from anon, authenticated;
revoke all on table public.bridge_title_merge_aliases from anon, authenticated;

commit;
