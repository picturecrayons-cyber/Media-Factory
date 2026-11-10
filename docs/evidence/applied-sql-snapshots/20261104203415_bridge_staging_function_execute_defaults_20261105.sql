do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Refusing Bridge function ACL hardening: migration must run as postgres owner';
  end if;
end
$$;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;