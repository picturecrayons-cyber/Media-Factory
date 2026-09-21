-- Crayons Bridge RLS
-- Project: uakpqqardziifcwzvgfx ONLY.
-- Review + owner approval required before applying to production.

-- Enable RLS. Authenticated users read/write through policies.
-- Service role (webhooks) bypasses RLS by design — keep service role server-only.

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

drop policy if exists bridge_profiles_select_self on public.bridge_profiles;
create policy bridge_profiles_select_self
  on public.bridge_profiles for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists bridge_titles_owner_all on public.bridge_titles;
create policy bridge_titles_owner_all
  on public.bridge_titles for all to authenticated
  using (owner_user_id = auth.uid()::text)
  with check (owner_user_id = auth.uid()::text);

drop policy if exists bridge_titles_buyer_select on public.bridge_titles;
create policy bridge_titles_buyer_select
  on public.bridge_titles for select to authenticated
  using (status in ('LIVE_FOR_BUYERS', 'IN_NEGOTIATION', 'LICENSED', 'DELIVERED'));

drop policy if exists bridge_payments_own on public.bridge_payments;
create policy bridge_payments_own
  on public.bridge_payments for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists bridge_entitlements_own on public.bridge_entitlements;
create policy bridge_entitlements_own
  on public.bridge_entitlements for select to authenticated
  using (user_id = auth.uid()::text);

-- Webhook + invite + email challenge tables: no client policies (server/service only).
