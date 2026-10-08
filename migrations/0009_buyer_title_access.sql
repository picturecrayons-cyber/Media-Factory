-- Explicit, revocable buyer access. This table is server-only like the other
-- Bridge operational tables; browser roles receive no grants or policies.
create table if not exists bridge_buyer_title_access (
  title_id text not null references bridge_titles(id) on delete cascade,
  buyer_user_id text not null references bridge_profiles(user_id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  primary key (title_id, buyer_user_id)
);
create index if not exists bridge_buyer_title_access_buyer_idx
  on bridge_buyer_title_access (buyer_user_id, title_id)
  where revoked_at is null;
alter table bridge_buyer_title_access enable row level security;
revoke all on bridge_buyer_title_access from anon, authenticated;
