-- Additive Story Concept payment binding and durable idempotency for isolated Testing DB.
ALTER TABLE public.bridge_titles
  ADD COLUMN IF NOT EXISTS submission_type text
  CHECK (submission_type IN ('finished_film', 'story_concept'))
  DEFAULT 'finished_film';

ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS payment_id text REFERENCES public.bridge_payments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS bridge_story_concept_payment_unique_idx
  ON public.bridge_story_concept_submissions (payment_id)
  WHERE payment_id IS NOT NULL;

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