-- Testing DB: least-privilege workspace RLS for Bridge.
-- Public Data API table grants remain locked down (migration 0008). These policies
-- are defense in depth and do not create a new browser write surface.
create schema if not exists bridge_private;
revoke all on schema bridge_private from public, anon;
grant usage on schema bridge_private to authenticated;

create or replace function bridge_private.current_user_id()
returns text language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select l.bridge_user_id from public.bridge_loop_identity_links l
      where l.auth_user_id = (select auth.uid()) limit 1),
    (select p.user_id from public.bridge_profiles p
      where p.user_id = (select auth.uid())::text limit 1)
  );
$$;

create or replace function bridge_private.current_internal_role()
returns text language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.internal_role from public.bridge_profiles p
  where p.user_id = bridge_private.current_user_id()
    and p.email_verified = true limit 1;
$$;

create or replace function bridge_private.is_staff()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(bridge_private.current_internal_role() in
    ('admin','qc_reviewer','legal_reviewer','finance','viewer'), false);
$$;

create or replace function bridge_private.is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(bridge_private.current_internal_role() = 'admin', false);
$$;

create or replace function bridge_private.can_manage_title(p_title_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.bridge_titles t
    where t.id = p_title_id and (
      t.owner_user_id = bridge_private.current_user_id()
      or bridge_private.is_admin()
      or (
        t.owner_account_type = 'studio'
        and t.owner_organization_id is not null
        and exists (
          select 1 from public.bridge_organization_memberships m
          where m.organization_id = t.owner_organization_id
            and m.user_id = bridge_private.current_user_id()
            and m.status = 'active'
        )
      )
    )
  );
$$;

create or replace function bridge_private.can_read_title(p_title_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.bridge_titles t
    where t.id = p_title_id and (
      bridge_private.can_manage_title(t.id)
      or bridge_private.is_staff()
      or exists (
        select 1 from public.bridge_buyer_title_access a
        where a.title_id = t.id
          and a.buyer_user_id = bridge_private.current_user_id()
          and a.revoked_at is null
          and (a.expires_at is null or a.expires_at > now())
          and public.bridge_title_buyer_visibility(t.id)
      )
    )
  );
$$;

create or replace function bridge_private.can_read_workspace_title(p_title_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select bridge_private.can_manage_title(p_title_id) or bridge_private.is_staff();
$$;

revoke all on all functions in schema bridge_private from public, anon, authenticated;
grant execute on function bridge_private.current_user_id() to authenticated;
grant execute on function bridge_private.current_internal_role() to authenticated;
grant execute on function bridge_private.is_staff() to authenticated;
grant execute on function bridge_private.is_admin() to authenticated;
grant execute on function bridge_private.can_manage_title(text) to authenticated;
grant execute on function bridge_private.can_read_title(text) to authenticated;
grant execute on function bridge_private.can_read_workspace_title(text) to authenticated;

-- Profile and tenant membership visibility.
drop policy if exists bridge_profiles_self_select on public.bridge_profiles;
create policy bridge_profiles_self_select on public.bridge_profiles
for select to authenticated
using (user_id = bridge_private.current_user_id() or bridge_private.is_admin());

drop policy if exists bridge_organizations_member_select on public.bridge_organizations;
create policy bridge_organizations_member_select on public.bridge_organizations
for select to authenticated
using (
  bridge_private.is_admin()
  or exists (
    select 1 from public.bridge_organization_memberships m
    where m.organization_id = bridge_organizations.id
      and m.user_id = bridge_private.current_user_id()
      and m.status = 'active'
  )
);

drop policy if exists bridge_organization_memberships_self_select on public.bridge_organization_memberships;
create policy bridge_organization_memberships_self_select on public.bridge_organization_memberships
for select to authenticated
using (user_id = bridge_private.current_user_id() or bridge_private.is_admin());

-- Titles are visible to their owner/active studio tenant, verified staff, or
-- a buyer with a live title-specific access grant AND passed publication gates.
drop policy if exists bridge_titles_authorized_select on public.bridge_titles;
create policy bridge_titles_authorized_select on public.bridge_titles
for select to authenticated
using (bridge_private.can_read_title(id));

drop policy if exists bridge_titles_owner_insert on public.bridge_titles;
create policy bridge_titles_owner_insert on public.bridge_titles
for insert to authenticated
with check (
  owner_user_id = bridge_private.current_user_id()
  and status = 'DRAFT'
  and exists (
    select 1 from public.bridge_profiles p
    where p.user_id = bridge_private.current_user_id()
      and p.email_verified = true
      and p.account_type = bridge_titles.owner_account_type
      and p.account_type in ('independent_creator','studio')
  )
);

-- Title UPDATE remains server-authoritative; no direct Data API update policy is created.

-- Asset metadata and object keys remain Studio/internal-only. Buyer asset access
-- must go through the entitlement-checked streaming API, never direct table reads.
drop policy if exists bridge_assets_workspace_select on public.bridge_assets;
create policy bridge_assets_workspace_select on public.bridge_assets
for select to authenticated
using (bridge_private.can_read_workspace_title(title_id));

drop policy if exists bridge_assets_owner_insert on public.bridge_assets;
create policy bridge_assets_owner_insert on public.bridge_assets
for insert to authenticated
with check (
  created_by = bridge_private.current_user_id()
  and bridge_private.can_manage_title(title_id)
);

drop policy if exists bridge_asset_versions_workspace_select on public.bridge_asset_versions;
create policy bridge_asset_versions_workspace_select on public.bridge_asset_versions
for select to authenticated
using (bridge_private.can_read_workspace_title(title_id));

drop policy if exists bridge_asset_versions_owner_insert on public.bridge_asset_versions;
create policy bridge_asset_versions_owner_insert on public.bridge_asset_versions
for insert to authenticated
with check (
  created_by = bridge_private.current_user_id()
  and bridge_private.can_manage_title(title_id)
);

drop policy if exists bridge_title_events_workspace_select on public.bridge_title_events;
create policy bridge_title_events_workspace_select on public.bridge_title_events
for select to authenticated
using (bridge_private.can_read_workspace_title(title_id));

drop policy if exists bridge_title_events_owner_insert on public.bridge_title_events;
create policy bridge_title_events_owner_insert on public.bridge_title_events
for insert to authenticated
with check (
  actor_user_id = bridge_private.current_user_id()
  and bridge_private.can_manage_title(title_id)
);

drop policy if exists bridge_title_submission_intake_workspace_select on public.bridge_title_submission_intake;
create policy bridge_title_submission_intake_workspace_select on public.bridge_title_submission_intake
for select to authenticated
using (bridge_private.can_read_workspace_title(title_id));

drop policy if exists bridge_title_submission_intake_owner_insert on public.bridge_title_submission_intake;
create policy bridge_title_submission_intake_owner_insert on public.bridge_title_submission_intake
for insert to authenticated
with check (bridge_private.can_manage_title(title_id));

drop policy if exists bridge_title_submission_intake_owner_update on public.bridge_title_submission_intake;
create policy bridge_title_submission_intake_owner_update on public.bridge_title_submission_intake
for update to authenticated
using (bridge_private.can_manage_title(title_id))
with check (bridge_private.can_manage_title(title_id));

drop policy if exists bridge_story_concepts_workspace_select on public.bridge_story_concept_submissions;
create policy bridge_story_concepts_workspace_select on public.bridge_story_concept_submissions
for select to authenticated
using (bridge_private.can_read_workspace_title(title_id));

drop policy if exists bridge_story_concepts_owner_insert on public.bridge_story_concept_submissions;
create policy bridge_story_concepts_owner_insert on public.bridge_story_concept_submissions
for insert to authenticated
with check (bridge_private.can_manage_title(title_id));

-- Buyer access rows can only be inspected by the entitled Buyer or internal admin.
drop policy if exists bridge_buyer_title_access_self_select on public.bridge_buyer_title_access;
create policy bridge_buyer_title_access_self_select on public.bridge_buyer_title_access
for select to authenticated
using (buyer_user_id = bridge_private.current_user_id() or bridge_private.is_admin());

-- Deliberately no browser policies for financial, payment, webhook, invitation,
-- identity-link, audit, service-pricing, QC/legal decision, or reconciliation
-- tables. They remain server-authoritative and deny direct Data API access.
