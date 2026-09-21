-- Filmmaker submissions. Canonical titles remain in bridge_titles.
-- Additive. Do not seed demo films.

create table if not exists bridge_submissions (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  actor_user_id text not null,
  organization_id text,
  director_name text not null,
  studio_banner text not null default '',
  official_email text not null,
  phone text not null default '',
  genre text not null default '',
  maturity_rating text not null default '',
  screener_url text not null default '',
  screener_status text not null default 'pending',
  poster_url text not null default '',
  backdrop_url text not null default '',
  commercial_preferences jsonb not null default '[]'::jsonb,
  certification_version text not null,
  certified_at timestamptz,
  certified_by text,
  certified_ip text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_submissions_screener_chk check (screener_status in ('pending','verified','failed')),
  constraint bridge_submissions_status_chk check (status in (
    'draft','submitted','under_review','rights_validation','curatorial_review',
    'commercial_review','accepted','declined','deal_room','contract',
    'rights_activated','distribution_authorized','loop_publishing'
  ))
);

create index if not exists bridge_submissions_actor_idx on bridge_submissions (actor_user_id, created_at desc);
create index if not exists bridge_submissions_title_idx on bridge_submissions (title_id);
