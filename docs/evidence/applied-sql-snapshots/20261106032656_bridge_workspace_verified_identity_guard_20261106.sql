create or replace function bridge_private.can_manage_title(p_title_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.bridge_titles t
    where t.id = p_title_id and (
      bridge_private.is_admin()
      or exists (
        select 1 from public.bridge_profiles p
        where p.user_id = bridge_private.current_user_id()
          and p.email_verified = true
          and (
            (t.owner_user_id = p.user_id and p.account_type in ('independent_creator','studio'))
            or (
              t.owner_account_type = 'studio'
              and t.owner_organization_id is not null
              and exists (
                select 1 from public.bridge_organization_memberships m
                where m.organization_id = t.owner_organization_id
                  and m.user_id = p.user_id
                  and m.status = 'active'
              )
            )
          )
      )
    )
  );
$$;