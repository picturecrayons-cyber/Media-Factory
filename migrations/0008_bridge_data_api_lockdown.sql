-- The identity-link table is required by this lockdown and later RLS bindings.
-- Keep its definition here so a clean migration replay never depends on an
-- untracked production-only object.
create table if not exists public.bridge_loop_identity_links (
  id bigserial primary key,
  bridge_user_id text not null,
  auth_user_id uuid not null unique,
  verification_method text not null,
  verified_at timestamptz not null default now(),
  verified_by text not null
);

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
