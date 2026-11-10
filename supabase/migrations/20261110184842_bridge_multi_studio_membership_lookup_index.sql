-- Supporting index for multi-Studio membership resolution.
-- Non-unique by design: one user may hold active memberships in several organizations.
create index if not exists bridge_organization_memberships_user_status_org_idx
  on public.bridge_organization_memberships(user_id,status,organization_id);
