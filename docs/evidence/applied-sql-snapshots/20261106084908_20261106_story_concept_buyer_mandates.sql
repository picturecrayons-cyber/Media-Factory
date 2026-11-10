-- Additive Story Concept Buyer / Investor mandate grants.
-- Authorized target: Crayons Projects - Testing DB only. Never apply to Production.
-- Existing Testing schema uses UUID concept IDs and UUID organization IDs.
-- Extend the existing profile check to include the supported Investor account class.
alter table public.bridge_profiles
  drop constraint if exists bridge_profiles_account_type_chk;
alter table public.bridge_profiles
  add constraint bridge_profiles_account_type_chk
  check (account_type in ('independent_creator', 'studio', 'buyer', 'investor'));

-- Keep source URLs out of the Buyer/Investor response path. OCI object keys
-- are server-only references and are populated only by the secure upload flow.
alter table public.bridge_story_concept_submissions
  add column if not exists treatment_object_key text,
  add column if not exists screenplay_object_key text,
  add column if not exists treatment_pending_object_key text,
  add column if not exists screenplay_pending_object_key text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists fee_certified_at timestamptz;

-- Support the workflow's explicit review states while preserving any legacy
-- statuses already stored in this Testing database.
alter table public.bridge_story_concept_submissions
  drop constraint if exists bridge_story_concept_submissions_curation_status_check;
alter table public.bridge_story_concept_submissions
  add constraint bridge_story_concept_submissions_curation_status_check
  check (curation_status in (
    'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INTRODUCED_TO_BUYERS',
    'PENDING_REVIEW', 'CHANGES_REQUESTED', 'BUYER_EVALUATION_APPROVED'
  ));

create table if not exists public.bridge_story_concept_mandates (
  id uuid primary key default gen_random_uuid(),
  concept_submission_id uuid not null
    references public.bridge_story_concept_submissions(id) on delete cascade,
  grantee_organization_id uuid not null
    references public.bridge_organizations(id),
  grantee_account_type text not null
    check (grantee_account_type in ('buyer', 'investor')),
  grant_status text not null default 'PENDING'
    check (grant_status in ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED')),
  curation_status text not null default 'PENDING'
    check (curation_status in ('PENDING', 'BUYER_EVALUATION_APPROVED', 'REJECTED')),
  fee_certified_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text not null,
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

alter table public.bridge_story_concept_mandates enable row level security;
revoke all on public.bridge_story_concept_mandates from anon, authenticated;