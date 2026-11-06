-- Story Concept workflow integrity compatibility migration.
-- Preserve existing curation values and use the established actor-scoped idempotency ledger.
-- Additive only: no production application is authorized by this file.

ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_certified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.bridge_story_concept_idempotency (
  actor_user_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  title_id text NOT NULL,
  concept_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, idempotency_key)
);

-- Retain both historical and current workflow states. Do not rewrite existing rows.
ALTER TABLE public.bridge_story_concept_submissions
  DROP CONSTRAINT IF EXISTS bridge_story_concept_submissions_curation_status_check;

ALTER TABLE public.bridge_story_concept_submissions
  ADD CONSTRAINT bridge_story_concept_submissions_curation_status_check
  CHECK (curation_status IN (
    'PENDING',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'INTRODUCED_TO_BUYERS',
    'PENDING_REVIEW',
    'CHANGES_REQUESTED',
    'BUYER_EVALUATION_APPROVED'
  ));

COMMENT ON COLUMN public.bridge_story_concept_submissions.fee_certified_at IS
  'Server-controlled certification timestamp. NULL means the concept payment gate is locked.';
