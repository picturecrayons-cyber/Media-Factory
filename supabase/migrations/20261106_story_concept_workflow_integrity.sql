-- Additive Story Concept workflow hardening.
-- Draft migration only. Do not apply to production. Finished Film rows and upload tables are untouched.

ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_certified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS bridge_story_concept_idempotency_key_uidx
  ON public.bridge_story_concept_submissions (idempotency_key)
;

ALTER TABLE public.bridge_story_concept_submissions
  DROP CONSTRAINT IF EXISTS bridge_story_concept_submissions_curation_status_check;

UPDATE public.bridge_story_concept_submissions
SET curation_status = CASE curation_status
  WHEN 'PENDING' THEN 'PENDING_REVIEW'
  WHEN 'UNDER_REVIEW' THEN 'PENDING_REVIEW'
  WHEN 'INTRODUCED_TO_BUYERS' THEN 'APPROVED'
  ELSE curation_status
END;

ALTER TABLE public.bridge_story_concept_submissions
  ADD CONSTRAINT bridge_story_concept_submissions_curation_status_check
  CHECK (curation_status IN ('PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','BUYER_EVALUATION_APPROVED'));

COMMENT ON COLUMN public.bridge_story_concept_submissions.idempotency_key IS
  'Client-generated UUID used to make concept creation retries idempotent.';
COMMENT ON COLUMN public.bridge_story_concept_submissions.fee_certified_at IS
  'Server-controlled certification timestamp. NULL means the concept payment gate is locked.';
