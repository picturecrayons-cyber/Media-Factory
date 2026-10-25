-- Allow a signed-in user to read only their own Bridge profile row.
-- This is a self-read policy, not a client-side role grant or write surface.
grant select on table public.bridge_profiles to authenticated;
alter table public.bridge_profiles enable row level security;
drop policy if exists bridge_profiles_self_read on public.bridge_profiles;
create policy bridge_profiles_self_read
on public.bridge_profiles
for select
to authenticated
using (auth.uid()::text = user_id);
