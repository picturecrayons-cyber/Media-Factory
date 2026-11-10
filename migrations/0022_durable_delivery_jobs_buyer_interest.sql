-- App-runtime migration counterpart to supabase/migrations/20261028_durable_delivery_jobs_buyer_interest.sql.
-- Additive only; never apply against production until the release gates authorize it.

ALTER TABLE public.bridge_titles
  ADD COLUMN IF NOT EXISTS submission_type text DEFAULT 'finished_film';
ALTER TABLE public.bridge_titles
  DROP CONSTRAINT IF EXISTS bridge_titles_submission_type_check;
ALTER TABLE public.bridge_titles
  ADD CONSTRAINT bridge_titles_submission_type_check
  CHECK (submission_type IN ('finished_film', 'story_concept'));

CREATE TABLE IF NOT EXISTS public.bridge_story_concept_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL UNIQUE REFERENCES public.bridge_titles(id) ON DELETE CASCADE,
  logline text,
  synopsis text,
  treatment_url text,
  screenplay_url text,
  genre text[] DEFAULT '{}',
  estimated_budget_range text,
  target_platforms text[] DEFAULT '{}',
  curation_status text NOT NULL DEFAULT 'PENDING'
    CHECK (curation_status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INTRODUCED_TO_BUYERS')),
  admin_notes text,
  introduced_to_buyers_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bridge_story_concept_curation_idx
  ON public.bridge_story_concept_submissions (curation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bridge_buyer_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_submission_id uuid REFERENCES public.bridge_story_concept_submissions(id) ON DELETE CASCADE,
  title_id text,
  buyer_user_id text NOT NULL,
  interest_level text NOT NULL DEFAULT 'VIEWED',
  notes text,
  commercial_model text,
  currency text NOT NULL DEFAULT 'INR',
  license_fee_minor bigint,
  revenue_share_percent numeric(5,2),
  terms_status text NOT NULL DEFAULT 'not_proposed',
  contract_reference text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bridge_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('dubbing', 'loudness', 'imf', 'dcp', 'human_qc')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'completed', 'failed', 'approved')),
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

ALTER TABLE public.bridge_buyer_interest ALTER COLUMN concept_submission_id DROP NOT NULL;
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

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_interest_level_check;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_interest_level_check
  CHECK (interest_level IN ('VIEWED', 'INTERESTED', 'REQUESTED_MATERIALS', 'PASSED', 'LICENSED'));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_target_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_target_chk
  CHECK (
    (title_id IS NOT NULL AND concept_submission_id IS NULL)
    OR (title_id IS NULL AND concept_submission_id IS NOT NULL)
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
  CHECK (commercial_model IS NULL OR commercial_model IN (
    'FIXED_FEE', 'REVENUE_SHARE', 'MINIMUM_GUARANTEE',
    'MG_PLUS_REVENUE_SHARE', 'TVOD_SPLIT', 'AVOD_SPLIT'
  ));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_terms_status_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_terms_status_chk
  CHECK (terms_status IN ('not_proposed', 'proposed', 'under_negotiation', 'agreed', 'contracted'));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_contract_evidence_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_contract_evidence_chk
  CHECK (interest_level <> 'LICENSED' OR (
    terms_status = 'contracted' AND contract_reference IS NOT NULL AND length(trim(contract_reference)) >= 3
  ));

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_currency_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_currency_chk CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE public.bridge_buyer_interest
  DROP CONSTRAINT IF EXISTS bridge_buyer_interest_license_fee_chk;
ALTER TABLE public.bridge_buyer_interest
  ADD CONSTRAINT bridge_buyer_interest_license_fee_chk CHECK (license_fee_minor IS NULL OR license_fee_minor >= 0);

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
CREATE INDEX IF NOT EXISTS bridge_buyer_interest_concept_idx
  ON public.bridge_buyer_interest (concept_submission_id, created_at DESC);

ALTER TABLE public.bridge_story_concept_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_buyer_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_story_concept_submissions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_buyer_interest FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.bridge_delivery_jobs IS
  'Durable vendor fulfillment jobs. Mutations require authenticated server-side Bridge RBAC and audit logging.';
COMMENT ON TABLE public.bridge_buyer_interest IS
  'Buyer engagement for either a cleared title or curated story/concept pitch; one target per record.';
