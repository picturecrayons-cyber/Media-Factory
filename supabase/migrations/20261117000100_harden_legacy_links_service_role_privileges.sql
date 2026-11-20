-- Restrict the legacy-link server role to row operations only.
-- Browser roles and PUBLIC retain no table privileges.
revoke all on table public.streamvista_legacy_links from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.streamvista_legacy_links to service_role;
