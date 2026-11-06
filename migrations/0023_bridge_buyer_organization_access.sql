-- Dual-mode Buyer title access.
-- Additive source migration only. Existing grants are preserved as user grants;
-- no automatic organization assignment or organization-name inference.
alter table public.bridge_buyer_title_access
  add column if not exists access_scope text not null default 'user',
  add column if not exists buyer_organization_id uuid
    references public.bridge_organizations(id) on delete cascade;

alter table public.bridge_buyer_title_access
  alter column buyer_user_id drop not null;

alter table public.bridge_buyer_title_access
  drop constraint if exists bridge_buyer_title_access_pkey;

alter table public.bridge_buyer_title_access
  add constraint bridge_buyer_title_access_scope_check
  check (
    (access_scope = 'user' and buyer_user_id is not null and buyer_organization_id is null)
    or
    (access_scope = 'organization' and buyer_user_id is null and buyer_organization_id is not null)
  );

alter table public.bridge_buyer_title_access
  add constraint bridge_buyer_title_access_scope_value_check
  check (access_scope in ('user', 'organization'));

create unique index if not exists bridge_buyer_title_access_user_unique
  on public.bridge_buyer_title_access (title_id, buyer_user_id)
  where access_scope = 'user';

create unique index if not exists bridge_buyer_title_access_organization_unique
  on public.bridge_buyer_title_access (title_id, buyer_organization_id)
  where access_scope = 'organization';

create index if not exists bridge_buyer_title_access_org_active_idx
  on public.bridge_buyer_title_access (buyer_organization_id, title_id)
  where access_scope = 'organization' and revoked_at is null;

alter table public.bridge_buyer_title_access enable row level security;
revoke all privileges on table public.bridge_buyer_title_access from public, anon, authenticated;

-- RLS mirrors the server-side grant scope and membership checks.
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
            and a.revoked_at is null
            and (a.expires_at is null or a.expires_at > now())
            and (
              (
                a.access_scope = 'user'
                and a.buyer_user_id = public.bridge_current_user_id()
                and a.buyer_organization_id is null
              )
              or
              (
                a.access_scope = 'organization'
                and a.buyer_user_id is null
                and exists (
                  select 1
                  from public.bridge_profiles bp
                  join public.bridge_organization_memberships m
                    on m.user_id = bp.user_id
                   and m.organization_id = a.buyer_organization_id
                   and m.status = 'active'
                  join public.bridge_organizations o
                    on o.id = m.organization_id
                   and o.status = 'active'
                  where bp.user_id = public.bridge_current_user_id()
                    and bp.account_type = 'buyer'
                    and bp.email_verified = true
                )
              )
            )
        )
      )
  );
$$;

revoke all on function public.bridge_can_read_title(text) from public;
grant execute on function public.bridge_can_read_title(text) to authenticated;
