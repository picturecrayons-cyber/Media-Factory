-- Align Production Studio membership roles with the server-validated Studio desk.
-- Existing rows and membership identity keys are preserved.
alter table public.bridge_organization_memberships
  drop constraint if exists bridge_organization_memberships_membership_role_check;
alter table public.bridge_organization_memberships
  add constraint bridge_organization_memberships_membership_role_check
  check (membership_role in ('owner', 'admin', 'member', 'producer', 'dit'));
