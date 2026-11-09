-- Shared Bridge -> Loop identity binding.
-- This table is required before 0008_bridge_data_api_lockdown.sql revokes browser-role access.
-- Bridge identity is anchored to the canonical Bridge profile, not the legacy Better Auth user table.
-- Supabase Auth remains the authentication principal; Bridge profiles remain the application principal.
-- Keep this definition aligned with src/lib/bridge/profiles.ts and the disposable Scope A tests.
-- Do not grant browser-role privileges here.
create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key
    references public.bridge_profiles(user_id) on delete restrict,
  auth_user_id uuid not null unique
    references auth.users(id) on delete cascade,
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
