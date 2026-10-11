-- Align bridge_assets_kind_chk check constraint with all supported ASSET_KINDS.
alter table if exists bridge_assets
  drop constraint if exists bridge_assets_kind_chk;

alter table if exists bridge_assets
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
