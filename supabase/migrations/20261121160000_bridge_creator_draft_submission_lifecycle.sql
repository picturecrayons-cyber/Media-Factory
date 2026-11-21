-- Creator draft lifecycle: explicit Bridge submission state and reversible soft deletion.
-- No title, rights, document, or OCI objects are physically deleted by this migration.

alter table public.bridge_titles
  add column if not exists creator_submission_status text not null default 'DRAFT',
  add column if not exists creator_submitted_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text,
  add column if not exists deleted_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and conname = 'bridge_titles_creator_submission_status_chk'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_creator_submission_status_chk
      check (creator_submission_status in ('DRAFT', 'SUBMITTED'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_titles'::regclass
      and conname = 'bridge_titles_deleted_by_fkey'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_deleted_by_fkey
      foreign key (deleted_by)
      references public.bridge_profiles(user_id)
      on delete restrict
      not valid;
  end if;
end
$$;

alter table public.bridge_titles
  validate constraint bridge_titles_creator_submission_status_chk;
alter table public.bridge_titles
  validate constraint bridge_titles_deleted_by_fkey;

create index if not exists bridge_titles_active_creator_owner_idx
  on public.bridge_titles(owner_user_id, updated_at desc)
  where deleted_at is null and submission_type is distinct from 'story_concept';
