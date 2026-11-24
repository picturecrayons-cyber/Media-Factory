-- Expose only the rights-filtered public LOOP catalogue through the publishable key.
-- The function is read-only, returns public metadata only, and applies every publication
-- and active-rights gate before returning a title.
alter function public.public_loop_catalog() security definer;
alter function public.public_loop_catalog() set search_path = '';

revoke all on function public.public_loop_catalog() from public;
revoke all on function public.public_loop_catalog() from anon;
revoke all on function public.public_loop_catalog() from authenticated;
grant execute on function public.public_loop_catalog() to anon;
grant execute on function public.public_loop_catalog() to authenticated;
grant execute on function public.public_loop_catalog() to service_role;

comment on function public.public_loop_catalog() is
'Read-only public LOOP catalogue projection. SECURITY DEFINER with empty search_path; returns only titles with approved, active, non-revoked worldwide rights and approved/published/listed LOOP state.';
