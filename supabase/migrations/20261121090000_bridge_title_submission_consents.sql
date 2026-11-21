-- Immutable, auditable legal declaration acceptance for finished-film submissions.
-- Server-only table: no browser role receives direct access.
create table if not exists public.bridge_title_submission_consents (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  submission_event_id bigint not null references public.bridge_title_events(id) on delete restrict,
  actor_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  actor_account_type text not null check (actor_account_type in ('independent_creator','studio')),
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (submission_event_id)
);
create index if not exists bridge_title_submission_consents_title_idx
  on public.bridge_title_submission_consents(title_id, accepted_at desc);
alter table public.bridge_title_submission_consents enable row level security;
revoke all privileges on table public.bridge_title_submission_consents from public, anon, authenticated;
