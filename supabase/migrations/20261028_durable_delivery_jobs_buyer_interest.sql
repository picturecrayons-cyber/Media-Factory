-- Durable delivery jobs and buyer-interest tracking.
-- Additive only. Apply to an isolated staging database first; never certifies a release.
-- Bridge operational tables are server-only: auth/RBAC is enforced in server functions,
-- and browser Data API roles receive no direct table privileges.

CREATE TABLE IF NOT EXISTS public.bridge_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN (
    'dubbing', 'loudness', 'imf', 'dcp', 'human_qc'
  )),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'in_progress', 'completed', 'failed', 'approved'
  )),
  assigned_vendor text,
  delivery_receipt_url text,
  admin_sign_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_delivery_jobs_signoff_state_chk
    CHECK ((status = 'approved') = admin_sign_off)
);

CREATE INDEX IF NOT EXISTS bridge_delivery_jobs_title_created_idx
  ON public.bridge_delivery_jobs (title_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bridge_delivery_jobs_status_updated_idx
  ON public.bridge_delivery_jobs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS bridge_delivery_jobs_vendor_status_idx
  ON public.bridge_delivery_jobs (assigned_vendor, status)
  WHERE assigned_vendor IS NOT NULL;

ALTER TABLE public.bridge_delivery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_delivery_jobs FROM PUBLIC, anon, authenticated;

-- Extend the existing concept-only table without replacing or deleting its records.
ALTER TABLE public.bridge_buyer_interest
  ALTER COLUMN concept_submission_id DROP NOT NULL;

ALTER TABLE public.bridge_buyer_interest
  ADD COLUMN IF NOT EXISTS title_id text,
  ADD COLUMN IF NOT EXISTS commercial_model text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS license_fee_minor bigint,
  ADD COLUMN IF NOT EXISTS revenue_share_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS terms_status text NOT NULL DEFAULT 'not_proposed',
  ADD COLUMN IF NOT EXISTS contract_reference text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text;

-- Reconcile the prior interest-level check constraint to add LICENSED while
-- preserving the legacy PASSED state. A licensed label is not itself a title
-- clearance, delivery sign-off, contract, or Loop publication authorization.
ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_interest_level_check;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_interest_level_check
  CHECK (interest_level IN (
    'VIEWED', 'INTERESTED', 'REQUESTED_MATERIALS', 'PASSED', 'LICENSED'
  ));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_target_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_target_chk
  CHECK (
    (title_id IS NOT NULL AND concept_submission_id IS NULL)
    OR
    (title_id IS NULL AND concept_submission_id IS NOT NULL)
  );

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_title_id_fkey;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_title_id_fkey
  FOREIGN KEY (title_id) REFERENCES public.bridge_titles(id) ON DELETE RESTRICT;

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_commercial_model_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_commercial_model_chk
  CHECK (
    commercial_model IS NULL
    OR commercial_model IN (
      'FIXED_FEE', 'REVENUE_SHARE', 'MINIMUM_GUARANTEE',
      'MG_PLUS_REVENUE_SHARE', 'TVOD_SPLIT', 'AVOD_SPLIT'
    )
  );

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_terms_status_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_terms_status_chk
  CHECK (terms_status IN ('not_proposed', 'proposed', 'under_negotiation', 'agreed', 'contracted'));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_contract_evidence_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_contract_evidence_chk
  CHECK (interest_level <> 'LICENSED' OR (terms_status = 'contracted' AND contract_reference IS NOT NULL AND length(trim(contract_reference)) >= 3));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_currency_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_currency_chk
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_license_fee_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_license_fee_chk
  CHECK (license_fee_minor IS NULL OR license_fee_minor >= 0);

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_revenue_share_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_revenue_share_chk
  CHECK (revenue_share_percent IS NULL OR revenue_share_percent BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS bridge_buyer_interest_title_idx
  ON public.bridge_buyer_interest (title_id, created_at DESC)
  WHERE title_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bridge_buyer_interest_level_updated_idx
  ON public.bridge_buyer_interest (interest_level, updated_at DESC);
CREATE INDEX IF NOT EXISTS bridge_buyer_interest_buyer_idx
  ON public.bridge_buyer_interest (buyer_user_id, updated_at DESC);

ALTER TABLE public.bridge_buyer_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_buyer_interest FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.bridge_delivery_jobs IS
  'Durable vendor fulfillment jobs. Mutations require authenticated server-side Bridge RBAC and audit logging.';
COMMENT ON TABLE public.bridge_buyer_interest IS
  'Buyer engagement for either a cleared title or curated story/concept pitch; one target per record.';
COMMENT ON COLUMN public.bridge_buyer_interest.license_fee_minor IS
  'Currency minor units (for INR, paise); never infer a fee or revenue from interest level alone.';
COMMENT ON COLUMN public.bridge_buyer_interest.revenue_share_percent IS
  'Negotiated share percentage, 0–100; requires contract evidence before terms_status=contracted.';


-- Verified contract evidence is a server-managed record, not a caller-supplied URL/string.
CREATE TABLE IF NOT EXISTS public.bridge_contract_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  document_url text NOT NULL CHECK (document_url ~ '^https://[^[:space:]]+$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_contract_evidence_verification_chk
    CHECK ((status = 'verified') = (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS bridge_contract_evidence_title_status_idx
  ON public.bridge_contract_evidence (bridge_title_id, status, verified_at DESC);
ALTER TABLE public.bridge_contract_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_contract_evidence FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.bridge_contract_evidence IS
  'Server-managed evidence registry. LICENSED buyer interest must reference a verified contract record bound to the same title.';
