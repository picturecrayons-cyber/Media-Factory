-- Guarded rollback for migrations/0022_multi_studio_memberships.sql.
-- This restores the legacy one-active-Studio rule only when no user currently
-- has multiple active memberships. Otherwise rollback aborts without changes.
do $guard$
begin
  if exists (
    select 1
    from public.bridge_organization_memberships
    where status = 'active'
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'Rollback blocked: active multi-Studio memberships exist';
  end if;
end
$guard$;

drop index if exists public.bridge_organization_memberships_user_status_org_idx;
create unique index if not exists bridge_organization_memberships_one_active_org_per_user
  on public.bridge_organization_memberships(user_id)
  where status = 'active';
