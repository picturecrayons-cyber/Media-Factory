-- Forward migration: align the canonical asset-kind constraint with supported Bridge uploads.
-- Keep the historical migrations immutable; retain every currently supported asset kind.
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
