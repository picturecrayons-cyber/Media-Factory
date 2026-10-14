-- Forward migration: Align public.bridge_assets_kind_chk check constraint with all supported ASSET_KINDS.
-- Supported kinds:
--   poster, poster_vertical, poster_horizontal, thumbnail,
--   screener, master, subtitle, technical, censor_certificate

do $$
declare
  unexpected_count int;
  unexpected_sample text;
begin
  if to_regclass('public.bridge_assets') is not null then
    -- Fail safely if any unexpected existing values are found; preserve existing rows
    select count(*), string_agg(distinct kind, ', ')
    into unexpected_count, unexpected_sample
    from public.bridge_assets
    where kind not in (
      'poster',
      'poster_vertical',
      'poster_horizontal',
      'thumbnail',
      'screener',
      'master',
      'subtitle',
      'technical',
      'censor_certificate'
    );

    if unexpected_count > 0 then
      raise exception 'Migration aborted: public.bridge_assets contains % row(s) with unexpected kind(s): %',
        unexpected_count, unexpected_sample;
    end if;

    alter table public.bridge_assets
      drop constraint if exists bridge_assets_kind_chk;

    alter table public.bridge_assets
      add constraint bridge_assets_kind_chk
      check (
        kind in (
          'poster',
          'poster_vertical',
          'poster_horizontal',
          'thumbnail',
          'screener',
          'master',
          'subtitle',
          'technical',
          'censor_certificate'
        )
      );
  end if;
end $$;
