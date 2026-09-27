-- Crayons Loop canonical schema & publications
-- Shared database backend with Crayons Bridge
-- Links canonical bridge_title_id with loop_title_id

create table if not exists bridge_loop_publications (
  id text primary key,
  bridge_title_id text unique not null references bridge_titles(id) on delete cascade,
  loop_title_id text unique not null,
  authorization_status text not null default 'pending',
  territories text[] not null default '{"IN"}',
  languages text[] not null default '{"Malayalam"}',
  exploitation_models text[] not null default '{"SVOD"}',
  window_start timestamptz,
  window_end timestamptz,
  approved_by text,
  approved_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_loop_pub_status_idx on bridge_loop_publications(authorization_status);

create table if not exists loop_titles (
  id text primary key,
  bridge_title_id text unique references bridge_titles(id) on delete set null,
  slug text unique not null,
  title text not null,
  synopsis text not null default '',
  description text not null default '',
  content_type text not null default 'movie',
  language text not null default 'Malayalam',
  year int,
  duration_minutes int,
  poster_path text,
  backdrop_path text,
  playback_path text,
  maturity_rating text not null default 'U',
  genres text not null default 'Drama',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'approved',
  listed boolean not null default true,
  published boolean not null default false,
  featured boolean not null default false,
  access_tier text not null default 'SVOD',
  tvod_rental_price int not null default 79,
  tvod_purchase_price int not null default 249,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loop_titles_published_idx on loop_titles(published, listed, status);

create table if not exists loop_profiles (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null default 'adult',
  is_active boolean not null default true,
  pin text not null default '0000',
  avatar text,
  created_at timestamptz not null default now()
);
create index if not exists loop_profiles_user_idx on loop_profiles(user_id);

create table if not exists loop_watch_progress (
  user_id text not null,
  loop_title_id text not null,
  position_seconds int not null default 0,
  duration_seconds int not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, loop_title_id)
);

create table if not exists loop_watchlist (
  user_id text not null,
  loop_title_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, loop_title_id)
);

create table if not exists loop_subscriptions (
  id serial primary key,
  user_id text not null,
  plan_key text not null default 'svod_monthly',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);
create index if not exists loop_subs_user_idx on loop_subscriptions(user_id);

create table if not exists loop_entitlements (
  id serial primary key,
  user_id text not null,
  loop_title_id text not null,
  access_type text not null default 'TVOD_RENTAL',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists loop_entitlements_user_idx on loop_entitlements(user_id);

-- Ensure canonical Bridge title 'jananam-1947-pranayam-thudarunnu' exists as title master
insert into bridge_titles (
  id, slug, name, name_ml, owner_user_id, owner_account_type, status, synopsis, language, year, runtime_minutes, poster_key, master_key
) values (
  'title-jananam-1947',
  'jananam-1947-pranayam-thudarunnu',
  'Jananam 1947 Pranayam Thudarunnu',
  'ജനനം 1947 പ്രണയം തുടരുന്നു',
  'system-crayons-master',
  'studio',
  'LIVE_FOR_BUYERS',
  'A poignant Malayalam drama tracing love, aging, dignity, and companionship late in life.',
  'Malayalam',
  2024,
  115,
  '/posters/jananam.jpg',
  '/media/masters/jananam_1947_master.mp4'
) on conflict (id) do nothing;

-- Connect Bridge publication record with Loop title record
insert into bridge_loop_publications (
  id, bridge_title_id, loop_title_id, authorization_status, territories, languages, exploitation_models, approved_by, approved_at
) values (
  'pub-jananam-1947',
  'title-jananam-1947',
  'loop-jananam-1947',
  'authorized',
  array['IN', 'AE', 'US', 'GB'],
  array['Malayalam'],
  array['TVOD', 'SVOD'],
  'internal-admin',
  now()
) on conflict (bridge_title_id) do nothing;

insert into loop_titles (
  id, bridge_title_id, slug, title, synopsis, description, content_type, language, year, duration_minutes,
  poster_path, backdrop_path, playback_path, maturity_rating, genres, status, listed, published, featured, access_tier
) values (
  'loop-jananam-1947',
  'title-jananam-1947',
  'jananam-1947-pranayam-thudarunnu',
  'Jananam 1947 Pranayam Thudarunnu',
  'A poignant Malayalam drama tracing love, aging, dignity, and companionship late in life.',
  'An acclaimed Crayons Original exploring an elderly couple’s delicate bond, resilience, and unconditional companionship.',
  'Film',
  'Malayalam',
  2024,
  115,
  '/posters/jananam.jpg',
  '/backdrops/jananam.jpg',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'U',
  'Drama,Crayons Original,Festival',
  'approved',
  true,
  true,
  true,
  'TVOD'
) on conflict (id) do update set
  published = true,
  listed = true,
  status = 'approved',
  backdrop_path = '/backdrops/jananam.jpg',
  playback_path = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
