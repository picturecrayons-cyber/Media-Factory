-- Remove Supabase default service_role table grants and keep mandate rows append-only.
revoke all on table public.bridge_creator_distribution_mandates from service_role;
grant select, insert on table public.bridge_creator_distribution_mandates to service_role;
