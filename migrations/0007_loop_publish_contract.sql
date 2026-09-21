-- Additive Loop catalog publish contract.
-- Does not replace B2B master delivery (bridge_loop_releases).
-- Canonical Supabase uakpqqardziifcwzvgfx only. Do not seed rows.
-- Do not apply to production until the owner writes YES.

alter table bridge_assets drop constraint if exists bridge_assets_kind_chk;
alter table bridge_assets add constraint bridge_assets_kind_chk
  check (kind in ('poster', 'screener', 'master', 'subtitle', 'playback', 'trailer'));

alter table bridge_titles add column if not exists content_type text not null default 'Film';
alter table bridge_titles add column if not exists maturity_rating text not null default 'U';
alter table bridge_titles add column if not exists playback_key text;
alter table bridge_titles add column if not exists trailer_key text;
alter table bridge_titles add column if not exists loop_title_id text;

create table if not exists bridge_loop_publications (
  id text primary key,
  bridge_title_id text not null references bridge_titles (id) on delete cascade,
  loop_title_id text,
  event_name text not null,
  publishing_status text not null,
  content_type text not null default 'Film',
  maturity_rating text not null default 'U',
  genres text not null default '',
  cast_credits text not null default '',
  availability_territory text not null,
  rights_start date,
  rights_end date,
  monetization_mode text not null,
  price_plan_eligibility text not null default '',
  playback_key text,
  poster_key text,
  trailer_key text,
  ingest_status text not null,
  http_status integer,
  actor_user_id text not null,
  reason text,
  payload text not null default '{}',
  created_at timestamptz not null default now(),
  unpublished_at timestamptz,
  constraint bridge_loop_pub_event_chk check (
    event_name in (
      'TITLE_PUBLISHED_TO_LOOP',
      'TITLE_UNPUBLISHED',
      'RIGHTS_EXPIRING',
      'RIGHTS_EXPIRED'
    )
  ),
  constraint bridge_loop_pub_status_chk check (
    publishing_status in ('published', 'unpublished')
  ),
  constraint bridge_loop_pub_ingest_chk check (
    ingest_status in ('blocked', 'failed', 'accepted', 'unpublished')
  ),
  constraint bridge_loop_pub_mode_chk check (
    monetization_mode in ('free', 'svod', 'tvod', 'premiere')
  )
);

create unique index if not exists bridge_loop_publications_live_idx
  on bridge_loop_publications (bridge_title_id)
  where publishing_status = 'published' and unpublished_at is null;

create index if not exists bridge_loop_publications_title_idx
  on bridge_loop_publications (bridge_title_id, created_at desc);
