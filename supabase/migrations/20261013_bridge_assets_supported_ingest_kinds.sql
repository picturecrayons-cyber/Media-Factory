-- Align the production asset constraint with the canonical OTT ingest kinds.
-- This migration is additive to the schema contract; it does not insert or alter asset rows.
-- Apply only through the reviewed Supabase migration workflow after Preview verification.

ALTER TABLE public.bridge_assets
  DROP CONSTRAINT IF EXISTS bridge_assets_kind_chk;

ALTER TABLE public.bridge_assets
  ADD CONSTRAINT bridge_assets_kind_chk
  CHECK (
    kind = ANY (
      ARRAY[
        'poster'::text,
        'poster_vertical'::text,
        'poster_horizontal'::text,
        'thumbnail'::text,
        'screener'::text,
        'master'::text,
        'subtitle'::text,
        'technical'::text,
        'censor_certificate'::text
      ]
    )
  );

