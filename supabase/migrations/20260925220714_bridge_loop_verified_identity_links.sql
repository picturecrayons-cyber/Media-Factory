create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key references public."user"(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  verification_method text not null check (verification_method in ('verified_email_reauthentication','manual_documented_review')),
  verified_at timestamptz not null,
  verified_by text not null,
  created_at timestamptz not null default now()
);
alter table public.bridge_loop_identity_links enable row level security;
revoke all on public.bridge_loop_identity_links from anon, authenticated;
comment on table public.bridge_loop_identity_links is 'Explicit, verified Bridge Better Auth to shared Supabase Auth identity mapping; no role or payment entitlement is implied.';