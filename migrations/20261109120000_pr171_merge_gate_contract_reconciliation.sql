-- PR #171: complete the duplicate-title merge/review relationship contract.
-- This is a forward-only candidate for disposable PostgreSQL 17 verification.
-- It must not be applied to STAGING DB or PRODUCTION DB without separate approval.
-- Legacy audit rows are not assigned guessed review IDs; review_id remains nullable
-- pending a separately evidenced legacy-row mapping decision.

BEGIN;

ALTER TABLE public.bridge_title_merge_audits
  ADD COLUMN IF NOT EXISTS review_id text;

DO $contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bridge_title_merge_audits'::regclass
      AND conname = 'bridge_title_merge_audits_review_fk'
  ) THEN
    ALTER TABLE public.bridge_title_merge_audits
      ADD CONSTRAINT bridge_title_merge_audits_review_fk
      FOREIGN KEY (review_id)
      REFERENCES public.bridge_title_duplicate_reviews(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bridge_title_merge_audits'::regclass
      AND conname = 'bridge_title_merge_audits_merge_pair_uq'
  ) THEN
    ALTER TABLE public.bridge_title_merge_audits
      ADD CONSTRAINT bridge_title_merge_audits_merge_pair_uq
      UNIQUE (merge_id, canonical_title_id, retiring_title_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.bridge_title_merge_aliases'::regclass
      AND conname = 'bridge_title_merge_aliases_audit_pair_fk'
  ) THEN
    ALTER TABLE public.bridge_title_merge_aliases
      ADD CONSTRAINT bridge_title_merge_aliases_audit_pair_fk
      FOREIGN KEY (merge_id, canonical_title_id, retiring_title_id)
      REFERENCES public.bridge_title_merge_audits
        (merge_id, canonical_title_id, retiring_title_id)
      ON DELETE RESTRICT;
  END IF;
END
$contract$;

COMMIT;
