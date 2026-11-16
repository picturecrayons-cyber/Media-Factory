-- DIT ingest evidence workflow. Additive: does not alter title, asset, payment or rights rows.
-- Media copying is performed by the approved storage workflow; this schema records manifests and verification evidence.
alter table bridge_organization_memberships
  drop constraint if exists bridge_organization_memberships_membership_role_check;
alter table bridge_organization_memberships
  add constraint bridge_organization_memberships_membership_role_check
  check (membership_role in ('owner', 'admin', 'member', 'producer', 'dit'));

create table if not exists bridge_dit_ingest_sessions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references bridge_titles(id) on delete cascade,
  organization_id uuid not null references bridge_organizations(id) on delete restrict,
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  camera_unit text not null check (camera_unit in ('A', 'B', 'C')),
  camera_label text not null check (length(trim(camera_label)) > 0),
  card_label text not null check (length(trim(card_label)) > 0),
  shoot_date date not null,
  source_volume text not null,
  source_root text not null,
  source_manifest_sha256 char(64) not null check (source_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  source_file_count integer not null check (source_file_count > 0),
  source_total_bytes bigint not null check (source_total_bytes >= 0),
  status text not null default 'SOURCE_VERIFIED'
    check (status in ('SOURCE_VERIFIED', 'READY_FOR_SIGNOFF', 'SIGNED_OFF')),
  signoff_note text,
  signed_off_by text references bridge_profiles(user_id) on delete restrict,
  signed_off_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'SIGNED_OFF') = (signed_off_at is not null and signed_off_by is not null))
);

create index if not exists bridge_dit_ingest_sessions_org_created_idx
  on bridge_dit_ingest_sessions (organization_id, created_at desc);
create index if not exists bridge_dit_ingest_sessions_title_idx
  on bridge_dit_ingest_sessions (title_id, created_at desc);

create table if not exists bridge_dit_ingest_files (
  session_id uuid not null references bridge_dit_ingest_sessions(id) on delete cascade,
  relative_path text not null check (length(relative_path) > 0),
  byte_size bigint not null check (byte_size >= 0),
  sha256 char(64) not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (session_id, relative_path)
);

create table if not exists bridge_dit_copy_verifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references bridge_dit_ingest_sessions(id) on delete cascade,
  copy_type text not null check (copy_type in ('PRIMARY', 'RECOVERY')),
  copy_root text not null,
  manifest_sha256 char(64) not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  file_count integer not null check (file_count > 0),
  total_bytes bigint not null check (total_bytes >= 0),
  verified boolean not null default false,
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (session_id, copy_type)
);

create index if not exists bridge_dit_copy_verifications_session_idx
  on bridge_dit_copy_verifications (session_id, copy_type);

alter table bridge_dit_ingest_sessions enable row level security;
alter table bridge_dit_ingest_files enable row level security;
alter table bridge_dit_copy_verifications enable row level security;
revoke all privileges on table bridge_dit_ingest_sessions from public, anon, authenticated;
revoke all privileges on table bridge_dit_ingest_files from public, anon, authenticated;
revoke all privileges on table bridge_dit_copy_verifications from public, anon, authenticated;
