-- STAGING/Preview migration: legal acquisition mandates for platform buyers.
-- PRODUCTION DB: DO NOT APPLY. Production remains HOLD / NOT CERTIFIED / NO-GO.
-- This is distinct from bridge_story_concept_mandates, buyer intelligence,
-- buyer interest, and title-specific buyer access.
-- Evidence files stay in private object storage; only references and hashes live here.

create table if not exists bridge_private.buyer_acquisition_mandates (
  id uuid primary key default gen_random_uuid(),
  buyer_organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  platform_code text not null,
  platform_account_id text not null,
  platform_channel_id text,
  status text not null default 'pending_review'
    check (status in ('draft','pending_review','approved','rejected','suspended','revoked','expired')),
  territory_codes text[] not null default '{}',
  language_codes text[] not null default '{}',
  media_rights text[] not null default '{}',
  exploitation_models text[] not null default '{}',
  exclusivity text not null default 'non_exclusive'
    check (exclusivity in ('exclusive','non_exclusive')),
  sublicensing_allowed boolean not null default false,
  onward_delegation_allowed boolean not null default false,
  effective_from timestamptz,
  effective_until timestamptz,
  agreement_reference text,
  created_by text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  revoked_by text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_acquisition_mandates_term_check
    check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint buyer_acquisition_mandates_approval_check
    check (status <> 'approved' or (reviewed_by is not null and reviewed_at is not null and effective_from is not null and effective_until is not null)),
  constraint buyer_acquisition_mandates_platform_nonempty
    check (length(btrim(platform_code)) > 0 and length(btrim(platform_account_id)) > 0)
);

create index if not exists buyer_acquisition_mandates_org_status_idx
  on bridge_private.buyer_acquisition_mandates (buyer_organization_id, status);
create index if not exists buyer_acquisition_mandates_platform_idx
  on bridge_private.buyer_acquisition_mandates (platform_code, platform_account_id, platform_channel_id);

create table if not exists bridge_private.buyer_acquisition_mandate_evidence (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references bridge_private.buyer_acquisition_mandates(id) on delete restrict,
  evidence_kind text not null
    check (evidence_kind in ('signed_agreement','board_authorization','power_of_attorney','channel_ownership','territory_schedule','rights_schedule','other')),
  storage_object_path text not null,
  sha256_hex text,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  constraint buyer_acquisition_mandate_evidence_sha_check
    check (sha256_hex is null or sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  constraint buyer_acquisition_mandate_evidence_review_check
    check ((review_status = 'pending' and reviewed_by is null and reviewed_at is null)
        or (review_status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create index if not exists buyer_acquisition_mandate_evidence_mandate_idx
  on bridge_private.buyer_acquisition_mandate_evidence (mandate_id, uploaded_at desc);

alter table bridge_private.buyer_acquisition_mandates enable row level security;
alter table bridge_private.buyer_acquisition_mandate_evidence enable row level security;

drop policy if exists deny_browser_access on bridge_private.buyer_acquisition_mandates;
create policy deny_browser_access on bridge_private.buyer_acquisition_mandates
  for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_browser_access on bridge_private.buyer_acquisition_mandate_evidence;
create policy deny_browser_access on bridge_private.buyer_acquisition_mandate_evidence
  for all to anon, authenticated using (false) with check (false);

revoke all on bridge_private.buyer_acquisition_mandates from anon, authenticated;
revoke all on bridge_private.buyer_acquisition_mandate_evidence from anon, authenticated;
grant select, insert, update, delete on bridge_private.buyer_acquisition_mandates to service_role;
grant select, insert, update, delete on bridge_private.buyer_acquisition_mandate_evidence to service_role;

comment on table bridge_private.buyer_acquisition_mandates is
  'Server-only legal acquisition mandate for verified platform buyers; distinct from story-concept mandates, buyer interest, and title access.';
comment on table bridge_private.buyer_acquisition_mandate_evidence is
  'Server-only metadata for legal evidence supporting buyer acquisition mandates; stores object references and hashes, not document contents.';
