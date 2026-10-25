-- Storage state is written only by the server-side verified-asset persistence path.
-- Existing Production installations that already have this column are left unchanged.
alter table public.bridge_assets
  add column if not exists storage_business_state text not null default 'UNVERIFIED';
