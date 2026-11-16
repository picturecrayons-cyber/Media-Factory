
-- Auth-bound Bridge RLS baseline. No privilege is derived from user-editable metadata.

grant select on public.bridge_profiles to authenticated;
grant select on public.bridge_loop_identity_links to authenticated;
grant select on public.bridge_titles to authenticated;
grant select on public.bridge_buyer_title_access to authenticated;

drop policy if exists "bridge_profiles_self_select" on public.bridge_profiles;
create policy "bridge_profiles_self_select"
on public.bridge_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.bridge_loop_identity_links l
    where l.auth_user_id = (select auth.uid())
      and l.bridge_user_id = bridge_profiles.user_id
  )
);

drop policy if exists "bridge_identity_links_self_select" on public.bridge_loop_identity_links;
create policy "bridge_identity_links_self_select"
on public.bridge_loop_identity_links
for select
to authenticated
using (auth_user_id = (select auth.uid()));

drop policy if exists "bridge_titles_owner_or_buyer_select" on public.bridge_titles;
create policy "bridge_titles_owner_or_buyer_select"
on public.bridge_titles
for select
to authenticated
using (
  exists (
    select 1
    from public.bridge_loop_identity_links l
    where l.auth_user_id = (select auth.uid())
      and (
        l.bridge_user_id = bridge_titles.owner_user_id
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

drop policy if exists "bridge_buyer_title_access_self_select" on public.bridge_buyer_title_access;
create policy "bridge_buyer_title_access_self_select"
on public.bridge_buyer_title_access
for select
to authenticated
using (
  exists (
    select 1
    from public.bridge_loop_identity_links l
    where l.auth_user_id = (select auth.uid())
      and l.bridge_user_id = bridge_buyer_title_access.buyer_user_id
  )
);
