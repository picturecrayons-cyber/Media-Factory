-- Super Admin Workspace Presets.
-- Additive schema only. Applying this file to STAGING or PRODUCTION requires
-- separate explicit approval after migration-history/schema reconciliation.
create table if not exists public.bridge_workspace_presets (
  id uuid primary key default gen_random_uuid(),
  preset_type text not null check (preset_type in ('OPERATIONAL','LEGAL')),
  name text not null,
  normalized_name text not null,
  version integer not null check (version > 0),
  configuration jsonb not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (preset_type, normalized_name, version)
);

create unique index if not exists bridge_workspace_presets_one_active_name
  on public.bridge_workspace_presets (preset_type, normalized_name)
  where status = 'ACTIVE';

create index if not exists bridge_workspace_presets_type_status_updated
  on public.bridge_workspace_presets (preset_type, status, updated_at desc);

alter table public.bridge_workspace_presets enable row level security;

-- No browser policies or grants: all reads/writes are server-authoritative.
revoke all on public.bridge_workspace_presets from anon, authenticated;

comment on table public.bridge_workspace_presets is
  'Versioned Super Admin presets. Configuration values are defaults/references only; never rights evidence or approval.';
