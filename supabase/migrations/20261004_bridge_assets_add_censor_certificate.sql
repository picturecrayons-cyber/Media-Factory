alter table public.bridge_assets
  drop constraint if exists bridge_assets_kind_chk;

alter table public.bridge_assets
  add constraint bridge_assets_kind_chk
  check (
    kind = any (
      array[
        'poster'::text,
        'poster_vertical'::text,
        'poster_horizontal'::text,
        'thumbnail'::text,
        'screener'::text,
        'master'::text,
        'subtitle'::text,
        'censor_certificate'::text
      ]
    )
  );
