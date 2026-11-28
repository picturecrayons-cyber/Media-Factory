-- Paid Story / Concept network submission for Creator and Studio accounts.
-- The fee remains unavailable until Finance/Super Admin activates the catalog item
-- and an effective, costed INR service rate. No customer price is seeded here.

ALTER TABLE public.bridge_story_concept_submissions
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS payment_id text REFERENCES public.bridge_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.bridge_story_concept_submissions
  DROP CONSTRAINT IF EXISTS bridge_story_concept_payment_status_chk;

ALTER TABLE public.bridge_story_concept_submissions
  ADD CONSTRAINT bridge_story_concept_payment_status_chk
  CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED'));

CREATE INDEX IF NOT EXISTS bridge_story_concept_payment_status_idx
  ON public.bridge_story_concept_submissions(payment_status, curation_status, created_at DESC);

-- Payments and concept submissions remain server-only. Do not grant browser table access.
ALTER TABLE public.bridge_story_concept_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bridge_story_concept_submissions FROM anon, authenticated;
REVOKE ALL ON public.bridge_story_concept_submissions FROM PUBLIC;

COMMENT ON COLUMN public.bridge_story_concept_submissions.payment_status IS
  'PENDING until a server-verified Razorpay capture; PAID unlocks admin curation; REFUNDED is not eligible for curation.';
COMMENT ON COLUMN public.bridge_story_concept_submissions.payment_id IS
  'Server-linked bridge_payments record for the verified Story / Concept submission fee.';
