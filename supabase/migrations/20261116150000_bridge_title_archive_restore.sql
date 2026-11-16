-- Reversible owner-scoped archive for untouched Bridge DRAFT titles.
-- This migration is additive. It does not delete title, asset, rights, QC,
-- submission, payment, or storage records and never removes OCI objects.

alter table public.bridge_titles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

alter table public.bridge_titles
  add constraint bridge_titles_archive_state_check
  check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or
    (archived_at is not null and archived_by is not null)
  );

create index if not exists bridge_titles_active_owner_updated_idx
  on public.bridge_titles(owner_user_id, updated_at desc)
  where archived_at is null;

create index if not exists bridge_titles_archived_owner_updated_idx
  on public.bridge_titles(owner_user_id, archived_at desc)
  where archived_at is not null;

-- The server service role is the only writer, using transactional row locks,
-- owner/organization membership checks, and audit records. No browser write
-- grants are added by this migration.
