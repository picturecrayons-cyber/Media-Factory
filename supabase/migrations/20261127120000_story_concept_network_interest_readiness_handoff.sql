-- Story / Concept network interest and readiness approval.
-- Server-only tables: all access is mediated by verified Bridge server functions.
-- This migration is additive; it does not mutate existing Story / Concept records.
-- Production handoff is intentionally a separate gate until the production-project
-- migration source is restored to the active repository migration set.

-- Reproducible baseline for the organization-scoped mandate table already present
-- in Testing/Production from the 27-Nov control-plane rollout.
create table if not exists public.bridge_story_concept_mandates (
  id uuid primary key default gen_random_uuid(),
  concept_submission_id uuid not null references public.bridge_story_concept_submissions(id) on delete cascade,
  grantee_organization_id uuid not null references public.bridge_organizations(id),
  grantee_account_type text not null check (grantee_account_type in ('buyer','investor')),
  grant_status text not null default 'PENDING'
    check (grant_status in ('PENDING','ACTIVE','REVOKED','EXPIRED')),
  curation_status text not null default 'PENDING'
    check (curation_status in ('PENDING','BUYER_EVALUATION_APPROVED','REJECTED')),
  fee_certified_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text not null references public.bridge_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_story_concept_mandates_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);
create unique index if not exists bridge_story_concept_mandates_grantee_unique_idx
  on public.bridge_story_concept_mandates
  (concept_submission_id, grantee_organization_id, grantee_account_type);
create index if not exists bridge_story_concept_mandates_org_active_idx
  on public.bridge_story_concept_mandates
  (grantee_organization_id, grantee_account_type, concept_submission_id, expires_at)
  where grant_status = 'ACTIVE' and revoked_at is null;
create index if not exists bridge_story_concept_mandates_concept_idx
  on public.bridge_story_concept_mandates (concept_submission_id);

create table if not exists public.bridge_story_concept_interest_events (
  id uuid primary key default gen_random_uuid(),
  concept_submission_id uuid not null
    references public.bridge_story_concept_submissions(id) on delete cascade,
  account_type text not null check (account_type in ('buyer','investor')),
  actor_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  interest_level text not null
    check (interest_level in ('INTERESTED','REQUESTED_MATERIALS','PASSED')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists bridge_story_concept_interest_events_concept_idx
  on public.bridge_story_concept_interest_events (concept_submission_id, created_at desc);
create index if not exists bridge_story_concept_interest_events_org_idx
  on public.bridge_story_concept_interest_events
  (concept_submission_id, organization_id, account_type, created_at desc);

create table if not exists public.bridge_story_concept_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  concept_submission_id uuid not null unique
    references public.bridge_story_concept_submissions(id) on delete restrict,
  readiness_status text not null default 'PENDING'
    check (readiness_status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by text references public.bridge_profiles(user_id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  qualifying_interest_count integer not null default 0 check (qualifying_interest_count >= 0),
  buyer_interest_count integer not null default 0 check (buyer_interest_count >= 0),
  investor_interest_count integer not null default 0 check (investor_interest_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_story_concept_readiness_reviewed_fields_check
    check (
      (readiness_status = 'PENDING' and reviewed_by is null and reviewed_at is null)
      or (readiness_status in ('APPROVED','REJECTED') and reviewed_by is not null and reviewed_at is not null)
    )
);
create index if not exists bridge_story_concept_readiness_status_idx
  on public.bridge_story_concept_readiness_reviews (readiness_status, updated_at desc);

alter table public.bridge_story_concept_mandates enable row level security;
alter table public.bridge_story_concept_interest_events enable row level security;
alter table public.bridge_story_concept_readiness_reviews enable row level security;

do $policies$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.bridge_story_concept_mandates'::regclass
      and polname = 'deny_browser_access'
  ) then
    create policy deny_browser_access on public.bridge_story_concept_mandates
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.bridge_story_concept_interest_events'::regclass
      and polname = 'deny_browser_access'
  ) then
    create policy deny_browser_access on public.bridge_story_concept_interest_events
      for all to anon, authenticated using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.bridge_story_concept_readiness_reviews'::regclass
      and polname = 'deny_browser_access'
  ) then
    create policy deny_browser_access on public.bridge_story_concept_readiness_reviews
      for all to anon, authenticated using (false) with check (false);
  end if;
end
$policies$;

revoke all on table public.bridge_story_concept_mandates from public, anon, authenticated;
revoke all on table public.bridge_story_concept_interest_events from public, anon, authenticated;
revoke all on table public.bridge_story_concept_readiness_reviews from public, anon, authenticated;
grant all on table public.bridge_story_concept_mandates to service_role;
grant all on table public.bridge_story_concept_interest_events to service_role;
grant all on table public.bridge_story_concept_readiness_reviews to service_role;
