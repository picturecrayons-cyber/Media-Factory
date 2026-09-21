create table if not exists screeners (
  id serial primary key,
  user_id text not null,
  title_id text not null,
  token text not null,
  watermark text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists screeners_user_id_idx on screeners (user_id);

create table if not exists transfers (
  id serial primary key,
  user_id text not null,
  title_id text not null,
  destination text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);
create index if not exists transfers_user_id_idx on transfers (user_id);

create table if not exists qc_jobs (
  id serial primary key,
  title_id text not null,
  lufs numeric not null default -24,
  black_frames int not null default 0,
  cadence text not null default '23.976',
  status text not null default 'pass',
  created_at timestamptz not null default now()
);

create table if not exists loc_jobs (
  id serial primary key,
  title_id text not null,
  language text not null,
  kind text not null,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);

create table if not exists territories (
  code text primary key,
  name text not null,
  enabled boolean not null default true
);

insert into territories (code, name, enabled) values
  ('IN', 'India', true),
  ('AE', 'United Arab Emirates', true),
  ('US', 'United States', true),
  ('GB', 'United Kingdom', true)
on conflict (code) do nothing;

insert into platform_meta (key, value) values
  ('fail_closed', '1'),
  ('s3_bucket', 's3://loop-media'),
  ('edge', 'stream.crayonsloop.com'),
  ('connected_at', ''),
  ('mapped', '1')
on conflict (key) do nothing;
