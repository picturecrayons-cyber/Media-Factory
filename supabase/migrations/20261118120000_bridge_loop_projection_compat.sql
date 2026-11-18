-- Bridge -> Loop compatibility projection.
-- STAGING DB: additive schema alignment only; no title is published by this migration.
-- PRODUCTION DB: canonical projection columns already exist; additions are IF NOT EXISTS and legacy backfills are conditional.
-- Existing Loop columns remain intact. Browser access remains denied by the existing RLS policy.
-- Rental price is deliberately NOT inferred from price_paise or Bridge licensing fees.

alter table public.loop_titles
  add column if not exists description text,
  add column if not exists content_type text,
  add column if not exists year integer,
  add column if not exists duration_minutes integer,
  add column if not exists maturity_rating text,
  add column if not exists poster_path text,
  add column if not exists backdrop_path text,
  add column if not exists trailer_path text,
  add column if not exists playback_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists listed boolean not null default false,
  add column if not exists published boolean not null default false,
  add column if not exists featured boolean not null default false,
  add column if not exists tvod_rental_price numeric;

-- Only copy legacy aliases when those source columns exist in this environment.
-- This makes the migration replay-safe across the older Testing schema and canonical Production schema.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='release_year') then
    execute 'update public.loop_titles set year = coalesce(year, release_year)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='runtime_minutes') then
    execute 'update public.loop_titles set duration_minutes = coalesce(duration_minutes, runtime_minutes)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='age_rating') then
    execute 'update public.loop_titles set maturity_rating = coalesce(maturity_rating, age_rating)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='poster_url') then
    execute 'update public.loop_titles set poster_path = coalesce(poster_path, poster_url)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='backdrop_url') then
    execute 'update public.loop_titles set backdrop_path = coalesce(backdrop_path, backdrop_url)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='trailer_url') then
    execute 'update public.loop_titles set trailer_path = coalesce(trailer_path, trailer_url)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='is_listed') then
    execute 'update public.loop_titles set listed = is_listed';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='loop_titles' and column_name='is_published') then
    execute 'update public.loop_titles set published = is_published';
  end if;
end
$$;

-- Keep new consumer publication flags fail-closed for future rows.
alter table public.loop_titles
  alter column listed set default false,
  alter column published set default false,
  alter column featured set default false;

comment on column public.loop_titles.playback_path is
  'Bridge-authorized consumer rendition path only; never a private master object key.';
comment on column public.loop_titles.tvod_rental_price is
  'Consumer rental price in the Loop application currency units; must be explicitly approved, never inferred from licensing fees or paise fields.';
comment on column public.loop_titles.metadata is
  'Public-safe projection metadata only; never store private masters, credentials, or internal rights evidence.';
