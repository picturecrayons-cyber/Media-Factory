-- Private Investor preview grants. Additive; no public access or implicit investor access.
create table if not exists public.bridge_investor_preview_access (
  title_id text not null references public.bridge_titles(id) on delete cascade,
  investor_user_id text not null references public.bridge_profiles(user_id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text not null,
  primary key (title_id, investor_user_id),
  constraint bridge_investor_preview_expiry_check
    check (expires_at is null or expires_at > granted_at)
);
create index if not exists bridge_investor_preview_access_investor_idx
  on public.bridge_investor_preview_access(investor_user_id, title_id)
  where revoked_at is null;
alter table public.bridge_investor_preview_access enable row level security;
revoke all on public.bridge_investor_preview_access from anon, authenticated;
comment on table public.bridge_investor_preview_access is
  'Server-only, revocable, expiring investor private preview grants. Does not authorize masters or public catalogue access.';
