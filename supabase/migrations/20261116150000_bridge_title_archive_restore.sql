-- Reversible archive metadata for untouched Bridge DRAFT titles.
-- No title, asset, submission, review, payment, rights or storage row is deleted.
alter table public.bridge_titles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

do $archive$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and conname = 'bridge_titles_archive_state_check'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_archive_state_check
      check (
        (archived_at is null and archived_by is null and archive_reason is null)
        or (archived_at is not null and archived_by is not null)
      );
  end if;
end
$archive$;

create index if not exists bridge_titles_active_owner_updated_idx
  on public.bridge_titles(owner_user_id, updated_at desc)
  where archived_at is null;

create index if not exists bridge_titles_archived_owner_updated_idx
  on public.bridge_titles(owner_user_id, archived_at desc)
  where archived_at is not null;
