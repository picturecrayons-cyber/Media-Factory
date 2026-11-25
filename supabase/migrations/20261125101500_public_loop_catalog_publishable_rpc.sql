-- Harden the existing read-only public LOOP catalogue RPC.
-- Keep SECURITY INVOKER: callers must remain subject to the underlying table
-- grants and RLS policies. Do not elevate this public endpoint to SECURITY DEFINER.
alter function public.public_loop_catalog() security invoker;
alter function public.public_loop_catalog() set search_path = '';

revoke all on function public.public_loop_catalog() from public;
revoke all on function public.public_loop_catalog() from anon;
revoke all on function public.public_loop_catalog() from authenticated;
grant execute on function public.public_loop_catalog() to anon;
grant execute on function public.public_loop_catalog() to authenticated;
grant execute on function public.public_loop_catalog() to service_role;

comment on function public.public_loop_catalog() is
'Read-only public LOOP catalogue projection. SECURITY INVOKER with empty search_path; returns only titles with approved, active, non-revoked worldwide rights and approved/published/listed LOOP state.';
