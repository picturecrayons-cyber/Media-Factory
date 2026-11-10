-- Multi-Studio membership compatibility.
-- Remove the legacy one-active-organization-per-user constraint and add a
-- non-unique lookup index. The unique (organization_id,user_id) constraint
-- remains responsible for preventing duplicate memberships within one Studio.
drop index if exists public.bridge_organization_memberships_one_active_org_per_user;
create index if not exists bridge_organization_memberships_user_status_org_idx
  on public.bridge_organization_memberships(user_id,status,organization_id);
