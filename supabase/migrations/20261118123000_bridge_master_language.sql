-- Store the language of the master film independently from the title's catalogue language.
-- Additive only: preserve every existing bridge_titles.language value and all asset/object records.
begin;

alter table public.bridge_titles
  add column if not exists master_language text;

comment on column public.bridge_titles.master_language is
  'Language of the master film asset; independent from bridge_titles.language (title/catalogue language).';

commit;
