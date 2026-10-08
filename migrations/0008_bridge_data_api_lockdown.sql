-- Crayons Bridge Data API boundary hardening.
--
-- Bridge currently authenticates and authorizes application requests in the
-- server runtime (Better Auth + server-side RBAC) and accesses Postgres through
-- the server database connection. The public Supabase Data API is therefore not
-- an authorization surface for Bridge operational tables.
--
-- Keep RLS enabled as defense in depth, but fail closed at the privilege layer:
-- browser roles must not query or mutate Bridge operational, payment, webhook,
-- entitlement, audit, identity-link, or publication records directly.
--
-- Do not replace these revokes with broad `to authenticated` RLS policies. If a
-- future Supabase-Auth browser flow is introduced, add narrowly scoped policies
-- only after identity/ownership mappings are explicit and tested.

create table if not exists public.bridge_loop_identity_links (
  bridge_user_id text primary key references public.bridge_profiles(user_id) on delete cascade,
  auth_user_id uuid not null unique,
  verification_method text not null,
  verified_at timestamptz not null default now(),
  verified_by text not null
);

create index if not exists bridge_loop_identity_links_auth_idx
  on public.bridge_loop_identity_links(auth_user_id);

revoke all privileges on table public.bridge_profiles from anon, authenticated;
revoke all privileges on table public.bridge_titles from anon, authenticated;
revoke all privileges on table public.bridge_title_events from anon, authenticated;
revoke all privileges on table public.bridge_assets from anon, authenticated;
revoke all privileges on table public.bridge_payments from anon, authenticated;
revoke all privileges on table public.bridge_webhook_events from anon, authenticated;
revoke all privileges on table public.bridge_entitlements from anon, authenticated;
revoke all privileges on table public.bridge_audit_logs from anon, authenticated;
revoke all privileges on table public.bridge_email_challenges from anon, authenticated;
revoke all privileges on table public.bridge_invites from anon, authenticated;
revoke all privileges on table public.bridge_loop_identity_links from anon, authenticated;
revoke all privileges on table public.bridge_loop_publications from anon, authenticated;
