-- Crayons Bridge Data API identity binding.
--
-- IMPORTANT: Bridge operational access remains server-authoritative.
-- migrations/0008_bridge_data_api_lockdown.sql revokes anon/authenticated table
-- privileges, so these policies do not expose a new browser write surface.
--
-- These SELECT policies bind Supabase Auth identities to the existing Bridge
-- text user IDs for defense in depth and for a future explicitly granted
-- authenticated read surface. Do not add broad USING (true) policies.

create or replace function public.bridge_current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select l.bridge_user_id
      from public.bridge_loop_identity_links l
      where l.auth_user_id = (select auth.uid())
      limit 1
    ),
    (
      select p.user_id
      from public.bridge_profiles p
      where p.user_id = (select auth.uid())::text
      limit 1
    )
  );
$$;

create or replace function public.bridge_current_internal_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.internal_role
  from public.bridge_profiles p
  where p.user_id = public.bridge_current_user_id()
    and p.email_verified = true
  limit 1;
$$;

create or replace function public.bridge_is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.bridge_current_internal_role() in
      ('viewer','qc_reviewer','legal_reviewer','finance','admin','super_admin'),
    false
  );
$$;

create or replace function public.bridge_can_read_title(p_title_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bridge_titles t
    where t.id = p_title_id
      and (
        t.owner_user_id = public.bridge_current_user_id()
        or public.bridge_is_internal()
        or exists (
          select 1
          from public.bridge_buyer_title_access a
          where a.title_id = t.id
            and a.buyer_user_id = public.bridge_current_user_id()
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > now())
        )
      )
  );
$$;

revoke all on function public.bridge_current_user_id() from public;
revoke all on function public.bridge_current_internal_role() from public;
revoke all on function public.bridge_is_internal() from public;
revoke all on function public.bridge_can_read_title(text) from public;

grant execute on function public.bridge_current_user_id() to authenticated;
grant execute on function public.bridge_current_internal_role() to authenticated;
grant execute on function public.bridge_is_internal() to authenticated;
grant execute on function public.bridge_can_read_title(text) to authenticated;

drop policy if exists bridge_assets_title_read on public.bridge_assets;
create policy bridge_assets_title_read
on public.bridge_assets for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_asset_versions_title_read on public.bridge_asset_versions;
create policy bridge_asset_versions_title_read
on public.bridge_asset_versions for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_qc_cases_title_read on public.bridge_qc_cases;
create policy bridge_qc_cases_title_read
on public.bridge_qc_cases for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_legal_cases_title_read on public.bridge_legal_cases;
create policy bridge_legal_cases_title_read
on public.bridge_legal_cases for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_rights_grants_title_read on public.bridge_rights_grants;
create policy bridge_rights_grants_title_read
on public.bridge_rights_grants for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_destination_packages_title_read on public.bridge_destination_packages;
create policy bridge_destination_packages_title_read
on public.bridge_destination_packages for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_loop_publications_title_read on public.bridge_loop_publications;
create policy bridge_loop_publications_title_read
on public.bridge_loop_publications for select to authenticated
using (public.bridge_can_read_title(bridge_title_id));

drop policy if exists bridge_title_events_title_read on public.bridge_title_events;
create policy bridge_title_events_title_read
on public.bridge_title_events for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_payments_self_read on public.bridge_payments;
create policy bridge_payments_self_read
on public.bridge_payments for select to authenticated
using (
  user_id = public.bridge_current_user_id()
  or public.bridge_current_internal_role() in ('finance','admin','super_admin')
);

drop policy if exists bridge_entitlements_self_read on public.bridge_entitlements;
create policy bridge_entitlements_self_read
on public.bridge_entitlements for select to authenticated
using (
  user_id = public.bridge_current_user_id()
  or public.bridge_current_internal_role() in ('admin','super_admin')
);

drop policy if exists bridge_audit_logs_internal_read on public.bridge_audit_logs;
create policy bridge_audit_logs_internal_read
on public.bridge_audit_logs for select to authenticated
using (public.bridge_is_internal());

-- Intentionally no browser policies for webhook events, email challenges, or
-- invites. Those remain server-only operational/security surfaces.
