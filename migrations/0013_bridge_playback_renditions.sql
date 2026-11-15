-- Verified playback rendition registry.
-- Source-only migration: do not apply to STAGING or PRODUCTION without separate approval.
-- QC master assets remain in bridge_assets(kind='master'); only verified HLS
-- manifests registered here may become Loop consumer playback_path values.
create table if not exists public.bridge_playback_renditions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  protocol text not null check (protocol in ('HLS', 'DASH')),
  manifest_key text not null check (
    length(manifest_key) between 1 and 1024
    and manifest_key !~ '^https?://'
    and manifest_key !~ '(^|/)\.\.(/|$)'
  ),
  status text not null default 'PROCESSING'
    check (status in ('PROCESSING', 'VERIFIED', 'FAILED')),
  checksum_sha256 text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_playback_rendition_verified_requires_time
    check (status <> 'VERIFIED' or (verified_at is not null and checksum_sha256 is not null)),
  constraint bridge_playback_rendition_checksum_format
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-fA-F0-9]{64}$')
);
create index if not exists bridge_playback_renditions_title_status_idx
  on public.bridge_playback_renditions(title_id, protocol, status, verified_at desc);
create unique index if not exists bridge_playback_renditions_one_primary_hls
  on public.bridge_playback_renditions(title_id)
  where protocol = 'HLS' and status = 'VERIFIED' and is_primary = true;
alter table public.bridge_playback_renditions enable row level security;
revoke all on public.bridge_playback_renditions from anon, authenticated;
