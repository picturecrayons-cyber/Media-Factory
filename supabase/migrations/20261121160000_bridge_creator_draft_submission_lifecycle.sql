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

-- The identity-link table intentionally has no client grants. Keep the narrow
-- ownership lookup in a non-exposed schema and call it from RLS policies.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.bridge_is_title_owner(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.bridge_titles t
      join public.bridge_loop_identity_links l
        on l.auth_user_id = (select auth.uid())
      where t.id = p_title_id
        and t.deleted_at is null
        and (
          (
            t.owner_account_type = 'independent_creator'
            and t.owner_user_id = l.bridge_user_id
          )
          or (
            t.owner_account_type = 'studio'
            and exists (
              select 1
              from public.bridge_organization_memberships m
              join public.bridge_organizations o
                on o.id = m.organization_id
               and o.status = 'active'
              where m.organization_id = t.owner_organization_id
                and m.user_id = l.bridge_user_id
                and m.status = 'active'
            )
          )
        )
    );
$function$;

revoke all on function private.bridge_is_title_owner(text) from public, anon, authenticated;
grant execute on function private.bridge_is_title_owner(text) to authenticated;

-- Archived title rows disappear from direct authenticated reads. Buyers retain
-- their separate title-access path; Studio owners must still be active members.
drop policy if exists "bridge_titles_owner_or_buyer_select" on public.bridge_titles;
create policy "bridge_titles_owner_or_buyer_select"
on public.bridge_titles
for select
to authenticated
using (
  deleted_at is null
  and (
    private.bridge_is_title_owner(bridge_titles.id)
    or exists (
      select 1
      from public.bridge_loop_identity_links l
      join public.bridge_buyer_title_access a
        on a.buyer_user_id = l.bridge_user_id
      where l.auth_user_id = (select auth.uid())
        and a.title_id = bridge_titles.id
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > now())
    )
  )
);

-- Production assets are owner-only, not buyer-visible. Reuse the narrow private
-- ownership helper so no public SECURITY DEFINER function is exposed.
drop policy if exists bridge_production_assets_owner_select on public.bridge_production_assets;
create policy bridge_production_assets_owner_select
  on public.bridge_production_assets for select to authenticated
  using (private.bridge_is_title_owner(bridge_production_assets.title_id));

drop policy if exists bridge_production_assets_owner_insert on public.bridge_production_assets;
create policy bridge_production_assets_owner_insert
  on public.bridge_production_assets for insert to authenticated
  with check (private.bridge_is_title_owner(bridge_production_assets.title_id));

drop policy if exists bridge_production_assets_owner_update on public.bridge_production_assets;
create policy bridge_production_assets_owner_update
  on public.bridge_production_assets for update to authenticated
  using (private.bridge_is_title_owner(bridge_production_assets.title_id))
  with check (private.bridge_is_title_owner(bridge_production_assets.title_id));

drop policy if exists bridge_production_assets_owner_delete on public.bridge_production_assets;
create policy bridge_production_assets_owner_delete
  on public.bridge_production_assets for delete to authenticated
  using (private.bridge_is_title_owner(bridge_production_assets.title_id));

drop function if exists public.bridge_is_title_owner(text);
