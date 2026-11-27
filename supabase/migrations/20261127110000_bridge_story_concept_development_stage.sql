-- Record whether a story concept is still at synopsis stage or actively in development.
-- Additive only: existing submissions remain NULL until their owners update them.
ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS development_stage text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bridge_story_concept_development_stage_check'
      AND conrelid = 'public.bridge_story_concept_submissions'::regclass
  ) THEN
    ALTER TABLE public.bridge_story_concept_submissions
      ADD CONSTRAINT bridge_story_concept_development_stage_check
      CHECK (development_stage IS NULL OR development_stage IN ('NOT_STARTED', 'IN_DEVELOPMENT'));
  END IF;
END
$migration$;

COMMENT ON COLUMN public.bridge_story_concept_submissions.development_stage IS
  'NOT_STARTED means the submission is at synopsis/logline stage only; IN_DEVELOPMENT means story development has begun.';
