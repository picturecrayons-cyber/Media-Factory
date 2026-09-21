-- Loop license handoff from the Bridge operations desk.
-- Masters stay private. A release is recorded only after captured payment.
-- Canonical Supabase uakpqqardziifcwzvgfx only. Do not seed fake rows.

create table if not exists bridge_loop_releases (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  payment_id text not null,
  status text not null,
  http_status integer,
  actor_user_id text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint bridge_loop_release_status_chk check (status in ('blocked', 'failed', 'accepted'))
);

create index if not exists bridge_loop_releases_title_idx on bridge_loop_releases (title_id, created_at desc);
