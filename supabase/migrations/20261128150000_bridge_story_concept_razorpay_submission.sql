-- Paid Story / Concept network submission for Creator and Studio accounts.
-- The fee remains unavailable until Finance/Super Admin activates the catalog item
-- and an effective, costed INR service rate. No customer price is seeded here.

ALTER TABLE public.bridge_payments
  ADD COLUMN IF NOT EXISTS service_code text,
  ADD COLUMN IF NOT EXISTS subtotal_paise bigint,
  ADD COLUMN IF NOT EXISTS tax_paise bigint,
  ADD COLUMN IF NOT EXISTS pricing_rate_version integer,
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid;

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

CREATE INDEX IF NOT EXISTS bridge_payments_service_code_idx
  ON public.bridge_payments(service_code, created_at DESC)
  WHERE service_code IS NOT NULL;

COMMENT ON COLUMN public.bridge_payments.service_code IS
  'Commercial service code for non-title-licence payment purposes such as Story / Concept submission.';
COMMENT ON COLUMN public.bridge_payments.subtotal_paise IS
  'Locked pre-tax service amount in INR paise at order creation.';
COMMENT ON COLUMN public.bridge_payments.tax_paise IS
  'Locked tax amount in INR paise at order creation.';
COMMENT ON COLUMN public.bridge_payments.pricing_rate_version IS
  'Service rate version used to calculate this payment order.';
COMMENT ON COLUMN public.bridge_payments.tax_rate_id IS
  'Tax rate record used to calculate this payment order.';
