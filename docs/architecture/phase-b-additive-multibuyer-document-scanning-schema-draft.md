# Phase B — Additive-only Multi-Buyer + Document Scanning Schema Draft

**Status:** REVIEW DRAFT ONLY — NOT AN EXECUTABLE / APPROVED MIGRATION  
**Target for future isolated validation:** Crayons Projects - Testing DB `jbymleftneggcgutlcqu` only, after migration reconciliation  
**Production:** HOLD / NOT CERTIFIED / NO-GO  
**No SQL has been applied. No database, app, storage, environment, or deployment changes are authorized by this document.**

## 1. Purpose

This draft addresses the read-only schema gaps found in Testing:

- Rights grants do not carry a buyer organization or agreement-version relation.
- License packages and entitlements are bound to individual buyer users.
- Buyer title access is user-keyed.
- `bridge_loop_publications` is Loop-only and unique per Bridge title.
- The existing document model is primarily asset/storage oriented; it does not provide a complete, auditable OCR/document-extraction and human-review workflow.

The design is additive. It does not drop, rename, rewrite, or backfill existing records. Existing Loop publication tables and paths remain untouched.

## 2. Document scanning capability — required product behavior

Bridge should support upload and scanning of rights and business documents, including (subject to configured allow-list):

- executed agreements and amendments;
- chain-of-title / ownership documents;
- authorization letters and distribution mandates;
- censor certificates;
- tax / company registration documents where necessary;
- delivery, QC and technical documents.

### Processing pipeline

1. Authenticated user uploads to a **private** object-storage location using a short-lived upload authorization. The browser never receives a permanent object credential or public URL.
2. Server validates actor, title/tenant scope, allowed document class, extension, MIME signature, size and malware/quarantine result. Reject password-protected or unsupported documents into a manual-review path; do not silently skip scanning.
3. Server computes SHA-256 and records immutable object identity/version metadata. Existing Bridge asset objects are referenced, not overwritten.
4. A queued scan job runs OCR/text extraction and, where appropriate, PDF page rendering / image analysis. Preserve page numbers and bounding-box/source coordinates where the provider supports them.
5. Extracted fields are stored as **machine-proposed values** with per-field confidence, page reference, extraction engine/version and source text span. Examples: certificate number, issuing authority, issue date, expiry date, parties, title name, territory, language, media rights, term and signature blocks.
6. A human reviewer compares extracted values with the original document and marks each relevant field/document as confirmed, corrected, rejected or unable to verify.
7. Every review decision is attributable and append-only. Corrections do not erase prior machine output or earlier review decisions.
8. The original document, OCR output and review evidence are accessible only to authorized actors through short-lived scoped access. Buyer A must never see Buyer B documents; Creator/Studio tenant isolation is equally mandatory.

### Trust boundary

OCR success means **text extraction completed**, not that the document is genuine, legally valid, complete, signed by an authorized person, or sufficient to prove ownership/rights. OCR output is unverified until human review. A scan must never automatically set Legal Approved, QC Approved, Rights Authorized, License Active, Delivery Ready, or Published.

Document scan states are separate from agreement, legal, QC, rights and publication states.

## 3. Proposed additive schema

The following SQL is a design sketch for review. Names, FK targets, storage provider integration, grants, indexes, policies and migration ordering must be reconciled before it is converted into a numbered migration. Do not execute this block.

```sql
-- A. Add optional canonical buyer-organization links.
-- NULL preserves legacy user-bound records; do not backfill by guessing.
ALTER TABLE public.bridge_rights_grants
  ADD COLUMN IF NOT EXISTS buyer_organization_id uuid;

ALTER TABLE public.bridge_license_packages
  ADD COLUMN IF NOT EXISTS buyer_organization_id uuid;

ALTER TABLE public.bridge_package_entitlements
  ADD COLUMN IF NOT EXISTS buyer_organization_id uuid;

-- FK constraints should be added after checking existing names and exact deployed DDL.
-- REFERENCES public.bridge_organizations(id); ON DELETE RESTRICT is preferred.
-- Do not drop the existing buyer_user_id columns or constraints.

-- B. Organization-scoped access mapping alongside the legacy user-keyed table.
CREATE TABLE IF NOT EXISTS public.bridge_buyer_organization_title_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  buyer_organization_id uuid NOT NULL REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  granted_by text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (title_id, buyer_organization_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- C. Multi-destination publication records; keep bridge_loop_publications unchanged.
CREATE TABLE IF NOT EXISTS public.bridge_distribution_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  buyer_organization_id uuid NOT NULL REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  destination_code text NOT NULL
    CHECK (destination_code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  rights_grant_id uuid REFERENCES public.bridge_rights_grants(id) ON DELETE RESTRICT,
  authorization_status text NOT NULL DEFAULT 'HOLD'
    CHECK (authorization_status IN ('HOLD','AUTHORIZED','REVOKED','EXPIRED')),
  window_start timestamptz,
  window_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end IS NULL OR window_start IS NULL OR window_end > window_start),
  UNIQUE (title_id, buyer_organization_id, destination_code)
);

-- D. Document registry. Object keys are private references, never public URLs.
CREATE TABLE IF NOT EXISTS public.bridge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  owner_organization_id uuid REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  buyer_organization_id uuid REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  uploaded_by text NOT NULL,
  document_class text NOT NULL CHECK (document_class IN (
    'EXECUTED_AGREEMENT','AGREEMENT_AMENDMENT','CHAIN_OF_TITLE',
    'AUTHORIZATION_LETTER','DISTRIBUTION_MANDATE','CENSOR_CERTIFICATE',
    'COMPANY_REGISTRATION','TAX_DOCUMENT','QC_DOCUMENT','OTHER'
  )),
  original_filename text NOT NULL,
  detected_mime_type text,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_provider text NOT NULL,
  storage_bucket text NOT NULL,
  storage_object_key text NOT NULL,
  storage_object_version text,
  scan_status text NOT NULL DEFAULT 'PENDING'
    CHECK (scan_status IN ('PENDING','QUARANTINED','QUEUED','PROCESSING',
      'EXTRACTED','FAILED','MANUAL_REVIEW_REQUIRED')),
  classification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (classification_status IN ('UNVERIFIED','HUMAN_CONFIRMED','REJECTED')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by_request_id text,
  UNIQUE (storage_provider, storage_bucket, storage_object_key, storage_object_version)
);

-- E. Scan job attempts are separate from the document record for retries and audit.
CREATE TABLE IF NOT EXISTS public.bridge_document_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.bridge_documents(id) ON DELETE RESTRICT,
  provider_code text NOT NULL,
  provider_model_version text,
  job_status text NOT NULL DEFAULT 'QUEUED'
    CHECK (job_status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  started_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_detail_safe text,
  result_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, attempt_number)
);

-- F. Extracted fields remain machine-proposed and versioned; no legal status fields.
CREATE TABLE IF NOT EXISTS public.bridge_document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.bridge_documents(id) ON DELETE RESTRICT,
  scan_job_id uuid NOT NULL REFERENCES public.bridge_document_scan_jobs(id) ON DELETE RESTRICT,
  extraction_version integer NOT NULL CHECK (extraction_version > 0),
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_text_object_key text,
  extraction_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, extraction_version)
);

-- G. Human review is append-only; corrections create a new event, never overwrite OCR.
CREATE TABLE IF NOT EXISTS public.bridge_document_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.bridge_documents(id) ON DELETE RESTRICT,
  extraction_id uuid REFERENCES public.bridge_document_extractions(id) ON DELETE RESTRICT,
  reviewer_user_id text NOT NULL,
  reviewer_organization_id uuid REFERENCES public.bridge_organizations(id) ON DELETE RESTRICT,
  review_action text NOT NULL CHECK (review_action IN (
    'CONFIRMED','CORRECTED','REJECTED','UNABLE_TO_VERIFY','NEEDS_SECOND_REVIEW'
  )),
  field_key text,
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  confirmed_value jsonb,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- H. Enable RLS and revoke direct client access for server-only document/OCR records.
ALTER TABLE public.bridge_buyer_organization_title_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_distribution_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_document_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_document_review_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bridge_buyer_organization_title_access FROM anon, authenticated;
REVOKE ALL ON public.bridge_distribution_publications FROM anon, authenticated;
REVOKE ALL ON public.bridge_documents FROM anon, authenticated;
REVOKE ALL ON public.bridge_document_scan_jobs FROM anon, authenticated;
REVOKE ALL ON public.bridge_document_extractions FROM anon, authenticated;
REVOKE ALL ON public.bridge_document_review_events FROM anon, authenticated;
```

## 4. Important implementation notes before executable SQL

- Add and validate FK constraints for the three nullable `buyer_organization_id` columns only after checking deployed FK names and all legacy values. Never infer an organization from a user's email or display name.
- `bridge_package_entitlements` currently has a unique constraint on `(package_id, buyer_user_id)`; an organization-aware entitlement identity and user-seat membership model need a separate decision. Do not drop or rewrite that unique constraint in this draft.
- The new distribution publication table intentionally avoids changing the Loop-only check and unique title constraint on `bridge_loop_publications`. The Loop adapter can later create a publication row in the new table only after regression tests prove compatibility; no automatic dual-write is proposed here.
- The schema above does not yet link document rows to proposal/version records because the Phase B inventory has not yet established canonical agreement proposal tables. Add nullable FKs only after the proposal/version schema is finalized.
- For existing `bridge_assets`, a document may optionally reference an asset through a future nullable FK after verifying its exact asset identity/version semantics. Do not overwrite or replace assets to enable OCR.
- The database stores metadata and private object references, not document bytes. Confirm the approved private storage provider and bucket, encryption, retention, legal hold, malware scanning, short-lived access and deletion policy before implementation.
- Raw OCR text and extracted values may contain personal/commercial confidential data. Minimize retention and avoid copying full OCR text into logs, audit metadata or analytics.
- Use a queue/outbox and idempotent job keys; retries must not create duplicate review or legal events. Preserve provider/model version and extraction hash.
- Human review permissions must be distinct from uploader permissions where separation of duties is required. Legal decisions must remain in the existing independent legal workflow.
- RLS enabled with no client policies is intentional only if these tables are server-only and direct Data API access is revoked. Every service-role handler must independently authenticate and authorize the actor, title, tenant, buyer organization and document class. Service role is not a substitute for authorization.

## 5. Required acceptance / regression tests

### Document scan
1. Unauthenticated upload, scan-result read and download are denied.
2. Creator A and Studio A cannot read Creator B / Studio B documents.
3. Buyer A cannot read Buyer B documents, OCR output, page images or download links.
4. Expired/revoked membership or mandate blocks subsequent reads and review actions.
5. MIME spoofing, oversized files, malware/quarantine, encrypted PDFs and unsupported formats are safely rejected or routed to manual review.
6. Duplicate upload hash is detected without overwriting the existing object.
7. OCR retry is idempotent; one document cannot acquire duplicate active scan jobs for the same attempt key.
8. Extraction retains page provenance, provider/model version, hash and confidence where available.
9. OCR output never changes legal, QC, rights, license, delivery or publication state.
10. Reviewer correction appends an event and preserves original extraction.
11. Document replacement creates a new immutable document/version; no in-place overwrite.
12. Short-lived access expires and cannot be replayed across tenants.

### Multi-buyer
13. Buyer A and Buyer B receive separate grants, packages, access and publication records for the same title.
14. Buyer A cannot enumerate or mutate Buyer B rows through direct API, server handlers or guessed IDs.
15. Legacy Loop publication continues to behave identically when no external buyer records exist.
16. Revoked/expired upstream rights block downstream publication and entitlements.
17. No publication is authorized from document scan, OCR success, owner acceptance or legal review alone.

## 6. Migration reconciliation blockers

Before creating a numbered migration or applying anything to Testing:

- Reconcile the full repository migration directory against Testing's migration history. The repository contains multiple files sharing numeric prefixes (including multiple `0018` and `0020` entries), so numeric ordering alone is unsafe.
- Resolve the Testing migration history duplicate version/name observations and identify which SQL is actually represented in the database.
- Inspect existing triggers, indexes, grants, RLS policies, helper functions and server call sites for all affected tables.
- Confirm the organization lifecycle and the canonical buyer organization for every buyer; Testing currently has zero organization and membership rows.
- Confirm storage provider/bucket and OCR provider choices; this draft does not authorize enabling a new vendor or moving documents.
- Decide whether executed agreements require an e-signature provider and how document review integrates with legal case assignment.
- Produce a compatibility matrix for legacy Loop user-bound package/entitlement behavior before adding any organization-level writes.

## 7. Execution boundary

This is a documentation draft only. Do not run the SQL above, create a Supabase migration history entry, apply DDL, backfill records, change storage, add OCR credentials, change RLS/grants, or run a Preview deployment under this document.

**Phase B status:** read-only schema inspection completed for the listed structures; migration-history and application call-site reconciliation remain open.  
**Production:** HOLD / NOT CERTIFIED / NO-GO.  
**App-inu pani kittaruthu.**
