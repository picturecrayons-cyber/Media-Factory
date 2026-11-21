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

-- Soft-archived title rows must also disappear from direct authenticated PostgREST reads.
drop policy if exists "bridge_titles_owner_or_buyer_select" on public.bridge_titles;
create policy "bridge_titles_owner_or_buyer_select"
on public.bridge_titles
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.bridge_loop_identity_links l
    where l.auth_user_id = (select auth.uid())
      and (
        (
          bridge_titles.owner_account_type = 'independent_creator'
          and l.bridge_user_id = bridge_titles.owner_user_id
        )
        or (
          bridge_titles.owner_account_type = 'studio'
          and exists (
            select 1
            from public.bridge_organization_memberships m
            join public.bridge_organizations o
              on o.id = m.organization_id
             and o.status = 'active'
            where m.organization_id = bridge_titles.owner_organization_id
              and m.user_id = l.bridge_user_id
              and m.status = 'active'
          )
        )
        or exists (
          select 1
          from public.bridge_buyer_title_access a
          where a.title_id = bridge_titles.id
            and a.buyer_user_id = l.bridge_user_id
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > now())
        )
      )
  )
);
