-- Studio Production Vault persistence schema.
-- Additive and fail-closed. This file is code-only until separately reviewed
-- and applied to the isolated STAGING DB. Never apply directly to PRODUCTION.
begin;

create table if not exists bridge_productions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references bridge_titles(id) on delete restrict,
  organization_id uuid,
  production_name text not null,
  production_no text not null,
  status text not null default 'PREPARING'
    check (status in ('PREPARING','INGESTING','QC_REVIEW','SIGNED_OFF','ON_HOLD','ARCHIVED')),
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_productions_name_nonempty check (length(trim(production_name)) > 0),
  constraint bridge_productions_number_nonempty check (length(trim(production_no)) > 0),
  unique (title_id, production_no)
);

create table if not exists bridge_production_shooting_days (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references bridge_productions(id) on delete restrict,
  day_number integer not null check (day_number > 0),
  shooting_date date not null,
  created_at timestamptz not null default now(),
  unique (production_id, day_number),
  unique (production_id, shooting_date)
);

create table if not exists bridge_production_camera_cards (
  id uuid primary key default gen_random_uuid(),
  shooting_day_id uuid not null references bridge_production_shooting_days(id) on delete restrict,
  camera_id text not null check (camera_id in ('A','B','C')),
  card_no text not null check (length(trim(card_no)) > 0),
  state text not null default 'INGEST_PENDING'
    check (state in ('INGEST_PENDING','INGESTING','VERIFICATION_PENDING','SAFE_TO_REUSE','QUARANTINED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shooting_day_id, camera_id, card_no)
);

create table if not exists bridge_production_ingest_manifests (
  id text primary key,
  production_id uuid not null references bridge_productions(id) on delete restrict,
  shooting_day_id uuid not null references bridge_production_shooting_days(id) on delete restrict,
  camera_card_id uuid not null references bridge_production_camera_cards(id) on delete restrict,
  expected_clip_count integer not null check (expected_clip_count >= 0),
  discovered_clip_count integer not null default 0 check (discovered_clip_count >= 0),
  reconciliation_result text not null default 'NOT_CHECKED'
    check (reconciliation_result in ('PASS','WARNING','FAIL','NOT_CHECKED')),
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz,
  manifest_payload jsonb not null default '{}'::jsonb
);

create table if not exists bridge_production_clips (
  id uuid primary key default gen_random_uuid(),
  manifest_id text not null references bridge_production_ingest_manifests(id) on delete restrict,
  clip_number text not null,
  original_filename text not null,
  original_relative_path text not null,
  byte_size bigint not null check (byte_size > 0),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-fA-F0-9]{64}$'),
  has_video boolean not null,
  has_audio boolean not null,
  duration_ms bigint not null check (duration_ms > 0),
  frame_rate numeric,
  width integer,
  height integer,
  codec text,
  automated_result text not null default 'NOT_CHECKED'
    check (automated_result in ('PASS','WARNING','FAIL','NOT_CHECKED')),
  automated_reasons jsonb not null default '[]'::jsonb,
  human_disposition text check (human_disposition in ('ACCEPTED','REJECTED')),
  human_reviewer_id text references bridge_profiles(user_id) on delete restrict,
  human_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manifest_id, clip_number),
  constraint bridge_production_clip_human_review_pair check (
    (human_disposition is null and human_reviewer_id is null and human_reviewed_at is null)
    or
    (human_disposition is not null and human_reviewer_id is not null and human_reviewed_at is not null)
  )
);

create table if not exists bridge_production_copy_verifications (
  id text primary key,
  clip_id uuid not null references bridge_production_clips(id) on delete restrict,
  media_kind text not null check (media_kind in ('RAW','AUDIO','STILLS','CONVERTED')),
  storage_tier text not null check (storage_tier in ('MASTER','BACKUP_1','BACKUP_2')),
  object_key text not null check (length(trim(object_key)) > 0),
  expected_byte_size bigint not null check (expected_byte_size > 0),
  expected_sha256 text not null check (expected_sha256 ~ '^[a-fA-F0-9]{64}$'),
  observed_byte_size bigint,
  observed_sha256 text,
  independently_verified boolean not null default false,
  verified_at timestamptz,
  storage_location_id text not null check (length(trim(storage_location_id)) > 0),
  failure_domain_id text not null check (length(trim(failure_domain_id)) > 0),
  verification_result text not null default 'NOT_CHECKED'
    check (verification_result in ('PASS','FAIL','NOT_CHECKED')),
  created_at timestamptz not null default now(),
  constraint bridge_production_copy_observed_bytes_positive check (observed_byte_size is null or observed_byte_size > 0),
  constraint bridge_production_copy_observed_hash_valid check (observed_sha256 is null or observed_sha256 ~ '^[a-fA-F0-9]{64}$'),
  constraint bridge_production_copy_pass_requires_exact_independent_readback check (
    verification_result <> 'PASS'
    or (
      independently_verified = true
      and verified_at is not null
      and observed_byte_size = expected_byte_size
      and lower(observed_sha256) = lower(expected_sha256)
    )
  ),
  unique (clip_id, media_kind, storage_tier),
  -- A clip cannot claim multiple replicas in the same failure domain.
  unique (clip_id, media_kind, failure_domain_id)
);

create table if not exists bridge_production_conversion_jobs (
  id text primary key,
  clip_id uuid not null references bridge_production_clips(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-fA-F0-9]{64}$'),
  profile jsonb not null,
  state text not null check (state in ('QUEUED','PROCESSING','RETRY_REQUIRED','COMPLETE','FAILED')),
  attempt integer not null default 0 check (attempt >= 0),
  history jsonb not null default '[]'::jsonb,
  master_output_copy_id text references bridge_production_copy_verifications(id) on delete restrict,
  backup1_output_copy_id text references bridge_production_copy_verifications(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint bridge_production_conversion_outputs_pair check (
    (master_output_copy_id is null and backup1_output_copy_id is null)
    or
    (master_output_copy_id is not null and backup1_output_copy_id is not null)
  )
);

create table if not exists bridge_production_dit_signoffs (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references bridge_productions(id) on delete restrict,
  shooting_day_id uuid not null references bridge_production_shooting_days(id) on delete restrict,
  reviewer_id text not null references bridge_profiles(user_id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  eligible boolean not null,
  card_safe_to_reuse boolean not null,
  blockers jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  check (card_safe_to_reuse = false or eligible = true)
);

create table if not exists bridge_production_audit_events (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references bridge_productions(id) on delete restrict,
  actor_user_id text not null references bridge_profiles(user_id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bridge_productions_title_idx on bridge_productions(title_id, created_at desc);
create index if not exists bridge_production_days_production_idx on bridge_production_shooting_days(production_id, day_number);
create index if not exists bridge_production_cards_day_idx on bridge_production_camera_cards(shooting_day_id, state);
create index if not exists bridge_production_manifests_production_idx on bridge_production_ingest_manifests(production_id, created_at desc);
-- A physical camera card cannot submit the same clip number through a second manifest.
create unique index if not exists bridge_production_manifest_card_clip_unique
  on bridge_production_ingest_manifests(camera_card_id, (manifest_payload->'clip'->>'clipNumber'))
  where manifest_payload ? 'clip';
create index if not exists bridge_production_clips_manifest_idx on bridge_production_clips(manifest_id, clip_number);
create index if not exists bridge_production_copies_clip_idx on bridge_production_copy_verifications(clip_id, media_kind, storage_tier);
create index if not exists bridge_production_jobs_state_idx on bridge_production_conversion_jobs(state, updated_at);
create index if not exists bridge_production_signoffs_day_idx on bridge_production_dit_signoffs(shooting_day_id, reviewed_at desc);
create index if not exists bridge_production_audit_events_production_idx on bridge_production_audit_events(production_id, created_at desc);

-- All Production Vault tables are server-only. No browser roles or Data API
-- access are granted. Application authorization is enforced in server functions.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'bridge_productions',
    'bridge_production_shooting_days',
    'bridge_production_camera_cards',
    'bridge_production_ingest_manifests',
    'bridge_production_clips',
    'bridge_production_copy_verifications',
    'bridge_production_conversion_jobs',
    'bridge_production_dit_signoffs',
    'bridge_production_audit_events'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('revoke all privileges on table %I from public, anon, authenticated', table_name);
  end loop;
end $$;

commit;
