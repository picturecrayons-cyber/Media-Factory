-- Expose only the rights-filtered public LOOP catalogue through the publishable key.
-- SECURITY DEFINER is intentional: anon/authenticated have no direct SELECT on the
-- underlying title/publication tables. The function is read-only, fully schema-qualified,
-- uses an empty search_path, and returns only approved, active public catalogue metadata.
alter function public.public_loop_catalog() security definer;
alter function public.public_loop_catalog() set search_path = '';

revoke all on function public.public_loop_catalog() from public;
revoke all on function public.public_loop_catalog() from anon;
revoke all on function public.public_loop_catalog() from authenticated;
grant execute on function public.public_loop_catalog() to anon;
grant execute on function public.public_loop_catalog() to authenticated;
grant execute on function public.public_loop_catalog() to service_role;

comment on function public.public_loop_catalog() is
'Read-only public LOOP catalogue projection. SECURITY DEFINER with empty search_path and fully qualified relations; returns only titles with approved, active, non-revoked worldwide rights and approved/published/listed LOOP state.';
