-- Explicit, revocable investor title access is separate from financial participation.
create table if not exists public.bridge_investor_title_access (
  title_id text not null references public.bridge_titles(id) on delete cascade,
  investor_user_id text not null references public.bridge_profiles(user_id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  primary key (title_id, investor_user_id)
);
create index if not exists bridge_investor_title_access_user_idx
  on public.bridge_investor_title_access (investor_user_id, title_id)
  where revoked_at is null;
alter table public.bridge_investor_title_access enable row level security;
revoke all on public.bridge_investor_title_access from anon, authenticated;
comment on table public.bridge_investor_title_access is 'Explicit, revocable Super Admin title access for investor accounts; separate from financial participation records.';
