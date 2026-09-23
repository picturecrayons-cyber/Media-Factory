-- Crayons Bridge RLS
-- Project: uakpqqardziifcwzvgfx ONLY.
-- Better Auth is the only application authentication system.
--
-- IMPORTANT:
-- Do not apply this file to production yet. The Bridge application connects
-- server-side through DATABASE_URL and authorizes requests in Better Auth + RBAC.
-- Supabase Auth's auth.uid() is therefore NOT the Bridge identity source.

alter table if exists public.bridge_profiles enable row level security;
alter table if exists public.bridge_titles enable row level security;
alter table if exists public.bridge_title_events enable row level security;
alter table if exists public.bridge_assets enable row level security;
alter table if exists public.bridge_payments enable row level security;
alter table if exists public.bridge_webhook_events enable row level security;
alter table if exists public.bridge_entitlements enable row level security;
alter table if exists public.bridge_audit_logs enable row level security;
alter table if exists public.bridge_email_challenges enable row level security;
alter table if exists public.bridge_invites enable row level security;

-- No anon/authenticated client policies are defined here intentionally.
-- Bridge data access is server-only and guarded by Better Auth session identity
-- plus src/lib/bridge/rbac.ts authorization checks.
--
-- Do not add auth.uid() policies unless Supabase Auth is intentionally adopted
-- for Bridge in a future architecture change.
