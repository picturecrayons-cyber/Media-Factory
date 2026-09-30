-- Harden Bridge RLS helper functions against direct Data API RPC execution.
--
-- RLS policies may invoke these helpers while evaluating rows, but anonymous
-- and signed-in API clients must not call the SECURITY DEFINER helpers directly.

revoke execute on function public.bridge_current_user_id() from public, anon, authenticated;
revoke execute on function public.bridge_current_internal_role() from public, anon, authenticated;
revoke execute on function public.bridge_is_internal() from public, anon, authenticated;
revoke execute on function public.bridge_can_read_title(text) from public, anon, authenticated;
