revoke all on function public.bridge_is_title_owner(text) from public, anon;
grant execute on function public.bridge_is_title_owner(text) to authenticated;
