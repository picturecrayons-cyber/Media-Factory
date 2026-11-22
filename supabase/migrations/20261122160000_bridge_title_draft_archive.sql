-- Reversible draft archive fields. Never physically delete title or event history.
alter table public.bridge_titles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

create index if not exists bridge_titles_active_updated_idx
  on public.bridge_titles (updated_at desc) where archived_at is null;
