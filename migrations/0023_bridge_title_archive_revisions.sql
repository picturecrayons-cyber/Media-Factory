-- Soft archive and submitted-title revision requests. Additive only; no existing title/assets changed.
alter table public.bridge_titles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

create index if not exists bridge_titles_active_updated_idx
  on public.bridge_titles (updated_at desc) where archived_at is null;

create table if not exists public.bridge_title_revisions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  submitted_by text not null references public.bridge_profiles(user_id) on delete restrict,
  submitted_at timestamptz not null default now(),
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object'),
  reviewed_by text references public.bridge_profiles(user_id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  unique (title_id, revision_number),
  check ((status = 'PENDING' and reviewed_at is null and reviewed_by is null)
      or (status <> 'PENDING' and reviewed_at is not null and reviewed_by is not null))
);

create index if not exists bridge_title_revisions_title_created_idx
  on public.bridge_title_revisions (title_id, submitted_at desc);

alter table public.bridge_title_revisions enable row level security;
revoke all privileges on table public.bridge_title_revisions from public, anon, authenticated;
