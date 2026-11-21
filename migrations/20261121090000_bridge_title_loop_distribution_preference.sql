-- Store a Creator/Studio distribution preference separately from title content format.
-- This is a preference only; it never authorizes Loop publication.
ALTER TABLE public.bridge_titles
  ADD COLUMN IF NOT EXISTS loop_distribution_preference text NOT NULL DEFAULT 'NOT_DECIDED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bridge_titles_loop_distribution_preference_chk'
      AND conrelid = 'public.bridge_titles'::regclass
  ) THEN
    ALTER TABLE public.bridge_titles
      ADD CONSTRAINT bridge_titles_loop_distribution_preference_chk
      CHECK (loop_distribution_preference IN ('NOT_DECIDED', 'CONSIDER_LOOP', 'NOT_FOR_LOOP'));
  END IF;
END
$$;
