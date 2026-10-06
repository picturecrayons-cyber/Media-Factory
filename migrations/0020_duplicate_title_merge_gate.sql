-- Duplicate-title merge safety gate
-- Fail closed on rights/commercial/media/delivery/Loop collisions.
-- Merges retain the retiring title as an auditable redirect; no hard delete.

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

alter table public.bridge_title_merge_audits enable row level security;
alter table public.bridge_title_merge_aliases enable row level security;

-- A retired title can never become a second active publication identity.
create index if not exists bridge_title_merge_aliases_canonical_idx
  on public.bridge_title_merge_aliases(canonical_title_id);
