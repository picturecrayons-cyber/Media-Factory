-- Bridge public functions are server-authoritative; browser roles use Auth only.
-- STAGING-first: jbymleftneggcgutlcqu. Do not apply to Production without approval.
do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Refusing Bridge function ACL hardening: migration must run as postgres owner';
  end if;
end
$$;

-- Prevent future public-schema functions created by postgres from receiving
-- implicit Data API EXECUTE grants to anon/authenticated.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
