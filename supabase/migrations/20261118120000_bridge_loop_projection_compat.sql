-- Bridge -> Loop compatibility projection.
-- STAGING DB: additive schema alignment only; no title is published by this migration.
-- PRODUCTION DB: the canonical Loop projection columns already exist; IF NOT EXISTS makes this a no-op there.
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

-- Preserve legacy catalogue metadata without overwriting an already populated canonical value.
update public.loop_titles
set description = coalesce(description, synopsis),
    year = coalesce(year, release_year),
    duration_minutes = coalesce(duration_minutes, runtime_minutes),
    maturity_rating = coalesce(maturity_rating, age_rating),
    poster_path = coalesce(poster_path, poster_url),
    backdrop_path = coalesce(backdrop_path, backdrop_url),
    trailer_path = coalesce(trailer_path, trailer_url),
    listed = coalesce(listed, is_listed, false),
    published = coalesce(published, is_published, false),
    metadata = coalesce(metadata, '{}'::jsonb);

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
