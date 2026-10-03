create table if not exists bridge_destinations (
  id text primary key,
  code text not null unique,
  name text not null,
  destination_type text not null,
  ownership text not null check (ownership in ('FIRST_PARTY','PARTNER')),
  monetization_models text[] not null default '{}',
  territories text[] not null default '{}',
  languages text[] not null default '{}',
  delivery_requirements jsonb not null default '{}'::jsonb,
  technical_specs jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bridge_destinations enable row level security;

insert into bridge_destinations (
  id, code, name, destination_type, ownership, monetization_models,
  territories, languages, delivery_requirements, technical_specs, status
) values
  (
    'dest_loop',
    'LOOP',
    'Crayons Loop',
    'OTT',
    'FIRST_PARTY',
    array['SVOD','TVOD','FREE'],
    array['IN'],
    array['ml','te','ta','hi','en'],
    '{"authority":"bridge","consumerSurface":"loop"}'::jsonb,
    '{"clients":["web","android_tv","future_apps"]}'::jsonb,
    'ACTIVE'
  ),
  (
    'dest_looptube_youtube',
    'LOOPTUBE_YOUTUBE',
    'LoopTube / YouTube',
    'YOUTUBE',
    'FIRST_PARTY',
    array['AVOD','FREE'],
    array['WORLDWIDE'],
    array['ml','te','ta','hi','en'],
    '{"authority":"bridge","publication":"youtube"}'::jsonb,
    '{"contentTypes":["FULL_FILM","TRAILER","CLIP","PROMO"]}'::jsonb,
    'ACTIVE'
  )
on conflict (code) do update set
  name = excluded.name,
  destination_type = excluded.destination_type,
  ownership = excluded.ownership,
  monetization_models = excluded.monetization_models,
  territories = excluded.territories,
  languages = excluded.languages,
  delivery_requirements = excluded.delivery_requirements,
  technical_specs = excluded.technical_specs,
  status = excluded.status,
  updated_at = now();
