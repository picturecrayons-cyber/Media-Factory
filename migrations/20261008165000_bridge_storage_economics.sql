-- Bridge storage economics foundation.
-- Physical provider remains OCI; this migration stores business policy metadata only.
-- No object is moved, archived, restored, or deleted by this migration.

alter table public.bridge_assets
  add column if not exists storage_tier text not null default 'STANDARD'
    check (storage_tier in ('STANDARD','INFREQUENT','ARCHIVE')),
  add column if not exists storage_business_state text not null default 'ACTIVE'
    check (storage_business_state in ('ACTIVE','STREAMING','COMMERCIAL','DELIVERY','PRESERVATION','TEMPORARY','ABANDONED')),
  add column if not exists storage_policy text not null default 'AUTO_SAFE'
    check (storage_policy in ('AUTO_SAFE','MANUAL','PRESERVATION','NO_ARCHIVE','NO_DELETE')),
  add column if not exists last_accessed_at timestamptz,
  add column if not exists last_storage_transition_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists commercial_hold boolean not null default false,
  add column if not exists restore_state text not null default 'READY'
    check (restore_state in ('READY','RESTORING','AVAILABLE'));

create index if not exists bridge_assets_storage_policy_idx
  on public.bridge_assets (storage_tier, storage_business_state, last_accessed_at);

create index if not exists bridge_assets_retention_idx
  on public.bridge_assets (retention_until)
  where retention_until is not null;

comment on column public.bridge_assets.storage_tier is
  'OCI physical storage tier. Do not confuse with Loop access_tier FREE/SVOD/TVOD.';
comment on column public.bridge_assets.storage_business_state is
  'Business lifecycle state used by the storage policy engine.';
comment on column public.bridge_assets.storage_policy is
  'Policy guard controlling automatic/manual storage lifecycle decisions.';
comment on column public.bridge_assets.restore_state is
  'Application state for archive restoration; archive objects require restoration before normal access.';
