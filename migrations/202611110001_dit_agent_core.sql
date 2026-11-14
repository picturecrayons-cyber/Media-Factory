-- DIT Agent: additive, server-only operational records.
-- No existing Bridge title, asset, rights, or storage records are modified.
create table if not exists public.bridge_dit_agent_settings (
  user_id text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.bridge_dit_jobs (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  created_by text not null,
  studio_label text,
  source_label text not null,
  source_type text not null check (source_type in ('CAMERA_CARD','EXTERNAL_DRIVE','FOLDER')),
  status text not null default 'CREATED'
    check (status in ('CREATED','INGESTING','PAUSED','VERIFYING','BLOCKED','COMPLETED','FAILED')),
  card_safe boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bridge_dit_job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bridge_dit_jobs(id) on delete cascade,
  relative_path text not null,
  file_name text not null,
  detected_format text,
  codec text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  source_sha256 text,
  master_object_key text,
  backup_1_object_key text,
  backup_2_object_key text,
  master_bucket text not null,
  backup_1_bucket text not null,
  backup_2_bucket text not null,
  master_sha256 text,
  backup_1_sha256 text,
  backup_2_sha256 text,
  master_verified_at timestamptz,
  backup_1_verified_at timestamptz,
  backup_2_verified_at timestamptz,
  status text not null default 'DISCOVERED'
    check (status in ('DISCOVERED','QUEUED','UPLOADING','PAUSED','VERIFYING','VERIFIED','WARNING','FAILED')),
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, relative_path)
);

create table if not exists public.bridge_dit_signoffs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bridge_dit_jobs(id) on delete restrict,
  signed_by text not null,
  statement text not null,
  checklist jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now()
);

create index if not exists bridge_dit_jobs_title_created_idx
  on public.bridge_dit_jobs(title_id, created_at desc);
create index if not exists bridge_dit_jobs_creator_created_idx
  on public.bridge_dit_jobs(created_by, created_at desc);
create index if not exists bridge_dit_job_files_job_status_idx
  on public.bridge_dit_job_files(job_id, status);

alter table public.bridge_dit_agent_settings enable row level security;
alter table public.bridge_dit_jobs enable row level security;
alter table public.bridge_dit_job_files enable row level security;
alter table public.bridge_dit_signoffs enable row level security;

revoke all on public.bridge_dit_agent_settings from anon, authenticated;
revoke all on public.bridge_dit_jobs from anon, authenticated;
revoke all on public.bridge_dit_job_files from anon, authenticated;
revoke all on public.bridge_dit_signoffs from anon, authenticated;


-- DIT ingest manifest and append-only operational event trail.
alter table public.bridge_dit_job_files
  add column if not exists source_object_key text,
  add column if not exists content_type text;

create table if not exists public.bridge_dit_job_logs (
  id bigserial primary key,
  job_id uuid not null references public.bridge_dit_jobs(id) on delete cascade,
  file_id uuid references public.bridge_dit_job_files(id) on delete cascade,
  level text not null check (level in ('INFO','WARNING','FAIL','PASS')),
  event text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_dit_job_logs_job_created_idx
  on public.bridge_dit_job_logs(job_id, created_at desc);
create index if not exists bridge_dit_job_logs_file_created_idx
  on public.bridge_dit_job_logs(file_id, created_at desc);
alter table public.bridge_dit_job_logs enable row level security;
revoke all on public.bridge_dit_job_logs from anon, authenticated;


create table if not exists public.bridge_dit_handoffs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bridge_dit_jobs(id) on delete restrict,
  created_by text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.bridge_dit_archives (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bridge_dit_jobs(id) on delete restrict,
  file_id uuid not null references public.bridge_dit_job_files(id) on delete restrict,
  object_key text not null unique,
  sha256 text not null,
  byte_size bigint not null check (byte_size > 0),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists bridge_dit_handoffs_job_created_idx
  on public.bridge_dit_handoffs(job_id, created_at desc);
create index if not exists bridge_dit_archives_job_created_idx
  on public.bridge_dit_archives(job_id, created_at desc);
alter table public.bridge_dit_handoffs enable row level security;
alter table public.bridge_dit_archives enable row level security;
revoke all on public.bridge_dit_handoffs from anon, authenticated;
revoke all on public.bridge_dit_archives from anon, authenticated;
