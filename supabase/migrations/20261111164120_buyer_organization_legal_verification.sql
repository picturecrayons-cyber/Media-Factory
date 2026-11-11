-- STAGING/Preview migration: legal verification of platform-buyer organizations.
-- PRODUCTION DB: DO NOT APPLY. Production remains HOLD / NOT CERTIFIED / NO-GO.
-- Keep legal identifiers and evidence metadata out of public.bridge_organizations.

create table if not exists bridge_private.buyer_organization_verifications (
  organization_id uuid primary key references public.bridge_organizations(id) on delete restrict,
  buyer_kind text not null
    check (buyer_kind in ('buyer','platform_buyer','distributor','aggregator')),
  verification_status text not null default 'pending_review'
    check (verification_status in ('unverified','pending_review','verified','rejected','suspended')),
  legal_registration_country text,
  legal_registration_number text,
  official_website text,
  submitted_by text not null,
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  updated_at timestamptz not null default now(),
  constraint buyer_org_verification_review_check
    check ((verification_status in ('verified','rejected','suspended') and reviewed_by is not null and reviewed_at is not null)
        or (verification_status in ('unverified','pending_review') and (reviewed_by is null or reviewed_at is not null)))
);

create table if not exists bridge_private.buyer_organization_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references bridge_private.buyer_organization_verifications(organization_id) on delete restrict,
  evidence_kind text not null
    check (evidence_kind in ('company_registration','tax_registration','board_resolution','authorized_signatory','platform_ownership','other')),
  storage_object_path text not null,
  sha256_hex text,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now(),
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  constraint buyer_org_evidence_sha_check
    check (sha256_hex is null or sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  constraint buyer_org_evidence_review_check
    check ((review_status = 'pending' and reviewed_by is null and reviewed_at is null)
        or (review_status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create index if not exists buyer_org_verification_status_idx
  on bridge_private.buyer_organization_verifications (verification_status, buyer_kind);
create index if not exists buyer_org_verification_evidence_org_idx
  on bridge_private.buyer_organization_verification_evidence (organization_id, uploaded_at desc);

alter table bridge_private.buyer_organization_verifications enable row level security;
alter table bridge_private.buyer_organization_verification_evidence enable row level security;

drop policy if exists deny_browser_access on bridge_private.buyer_organization_verifications;
create policy deny_browser_access on bridge_private.buyer_organization_verifications
  for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_browser_access on bridge_private.buyer_organization_verification_evidence;
create policy deny_browser_access on bridge_private.buyer_organization_verification_evidence
  for all to anon, authenticated using (false) with check (false);

revoke all on bridge_private.buyer_organization_verifications from anon, authenticated;
revoke all on bridge_private.buyer_organization_verification_evidence from anon, authenticated;
grant select, insert, update, delete on bridge_private.buyer_organization_verifications to service_role;
grant select, insert, update, delete on bridge_private.buyer_organization_verification_evidence to service_role;

comment on table bridge_private.buyer_organization_verifications is
  'Server-only legal identity verification state for buyer organizations; does not alter the shared organization record.';
comment on table bridge_private.buyer_organization_verification_evidence is
  'Server-only evidence metadata for buyer legal identity verification; document bytes remain in private object storage.';
