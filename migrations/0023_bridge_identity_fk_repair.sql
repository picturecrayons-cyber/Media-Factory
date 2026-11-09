-- Repair the identity-link FK targets for databases that already recorded 0007a.
-- 0007a remains corrected for fresh replays; this additive migration repairs older
-- installations where the original Better Auth FK was already recorded.
-- Fail closed if existing links do not resolve to real Bridge profiles/Auth users:
-- do not auto-create or infer identity records to make this migration pass.

create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key,
  auth_user_id uuid not null unique,
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

alter table public.bridge_loop_identity_links
  drop constraint if exists bridge_loop_identity_links_bridge_user_id_fkey;

alter table public.bridge_loop_identity_links
  add constraint bridge_loop_identity_links_bridge_user_id_fkey
  foreign key (bridge_user_id)
  references public.bridge_profiles(user_id)
  on delete restrict;

alter table public.bridge_loop_identity_links
  drop constraint if exists bridge_loop_identity_links_auth_user_id_fkey;

alter table public.bridge_loop_identity_links
  add constraint bridge_loop_identity_links_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete cascade;
