-- Story / Concept submission module (additive only)
-- Safe for production: no existing tables rewritten, no data mutated.
-- Feature remains gated by STORY_CONCEPT_ENABLED and inactive service catalog entry.

-- 1. Discriminator on existing titles table
ALTER TABLE public.bridge_titles
  ADD COLUMN IF NOT EXISTS submission_type text
  CHECK (submission_type IN ('finished_film', 'story_concept'))
  DEFAULT 'finished_film';

COMMENT ON COLUMN public.bridge_titles.submission_type IS
  'finished_film = existing path (free). story_concept = paid network submission.';

-- 2. Concept-specific data + admin curation
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
    CHECK (curation_status IN (
      'PENDING',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'INTRODUCED_TO_BUYERS'
    )),
  admin_notes text,
  introduced_to_buyers_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bridge_story_concept_curation_idx
  ON public.bridge_story_concept_submissions (curation_status, created_at DESC);

-- 3. Admin-mediated buyer interest
CREATE TABLE IF NOT EXISTS public.bridge_buyer_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_submission_id uuid NOT NULL
    REFERENCES public.bridge_story_concept_submissions(id) ON DELETE CASCADE,
  buyer_user_id text NOT NULL,
  interest_level text NOT NULL DEFAULT 'VIEWED'
    CHECK (interest_level IN ('VIEWED', 'INTERESTED', 'REQUESTED_MATERIALS', 'PASSED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bridge_buyer_interest_concept_idx
  ON public.bridge_buyer_interest (concept_submission_id, created_at DESC);

-- 4. RLS (server-side access via Better Auth + RBAC – same pattern as commercial engine)
ALTER TABLE public.bridge_story_concept_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_buyer_interest ENABLE ROW LEVEL SECURITY;

-- 5. Optional service catalog entry (fee stays configurable / locked)
INSERT INTO public.bridge_service_catalog
  (code, category, name, description, classification, pricing_method, unit_label, customer_visible, active)
VALUES
  (
    'STORY_CONCEPT_NETWORK_SUBMISSION',
    'PREPARE',
    'Story / Concept Network Submission',
    'Submit a story or concept for admin curation and introduction to verified buyers.',
    'BILLABLE',
    'FIXED_PER_TITLE',
    'submission',
    true,
    false   -- locked until fee is certified
  )
ON CONFLICT (code) DO NOTHING;

-- 6. Durable idempotency records. The API checks captured payment before
-- creating a title; the unique actor/key pair prevents duplicate retries.
CREATE TABLE IF NOT EXISTS public.bridge_story_concept_idempotency (
  actor_user_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  title_id text NOT NULL REFERENCES public.bridge_titles(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL REFERENCES public.bridge_story_concept_submissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, idempotency_key),
  UNIQUE (concept_id)
);

CREATE INDEX IF NOT EXISTS bridge_story_concept_idempotency_title_idx
  ON public.bridge_story_concept_idempotency (title_id);

ALTER TABLE public.bridge_story_concept_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_story_concept_idempotency FROM anon, authenticated;
REVOKE ALL ON public.bridge_story_concept_submissions FROM anon, authenticated;
REVOKE ALL ON public.bridge_buyer_interest FROM anon, authenticated;
