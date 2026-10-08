-- Shared Bridge -> Loop identity binding.
-- This table is required before 0008_bridge_data_api_lockdown.sql revokes browser-role access.
-- Keep the definition aligned with the canonical Supabase table; do not grant browser-role privileges here.
create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key references public."user"(id) on delete restrict,
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
