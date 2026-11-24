-- Reconcile the shared Bridge -> LOOP identity link to the canonical Bridge profile.
-- Historical migrations referenced public."user" (Better Auth), which is not the
-- Bridge identity authority. This forward-only migration binds bridge_user_id to
-- public.bridge_profiles(user_id) and auth_user_id to auth.users(id).
--
-- This file is migration source only. It is not applied to any connected database
-- by this change; deployment requires the separately approved migration gate.

create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  verification_method text not null check (
    verification_method in (
      'verified_email_reauthentication',
      'manual_documented_review',
      'supabase_auth_onboarding'
    )
  ),
  verified_at timestamptz not null,
  verified_by text not null,
  created_at timestamptz not null default now()
);

do $$
declare
  v_constraint record;
  v_bridge_user_attnum smallint;
begin
  if to_regclass('public.bridge_profiles') is null then
    raise exception 'Cannot reconcile bridge_loop_identity_links: public.bridge_profiles is missing';
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'Cannot reconcile bridge_loop_identity_links: auth.users is missing';
  end if;

  select attnum
    into v_bridge_user_attnum
    from pg_attribute
   where attrelid = 'public.bridge_loop_identity_links'::regclass
     and attname = 'bridge_user_id'
     and not attisdropped;

  if v_bridge_user_attnum is null then
    raise exception 'Cannot reconcile bridge_loop_identity_links: bridge_user_id column is missing';
  end if;

  -- Remove only foreign keys attached to bridge_user_id. Preserve the auth.users
  -- FK and all unrelated constraints.
  for v_constraint in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.bridge_loop_identity_links'::regclass
       and c.contype = 'f'
       and v_bridge_user_attnum = any(c.conkey)
  loop
    execute format(
      'alter table public.bridge_loop_identity_links drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table public.bridge_loop_identity_links
    add constraint bridge_loop_identity_links_bridge_profile_fkey
    foreign key (bridge_user_id)
    references public.bridge_profiles(user_id)
    on delete restrict;
end
$$;

alter table public.bridge_loop_identity_links enable row level security;
revoke all on public.bridge_loop_identity_links from anon, authenticated;

comment on table public.bridge_loop_identity_links is
  'Explicit verified Bridge profile to Supabase Auth identity mapping. bridge_user_id references bridge_profiles(user_id); auth_user_id references auth.users(id). No role or payment entitlement is implied.';
