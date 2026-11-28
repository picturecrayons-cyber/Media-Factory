-- Keep LOOP presentation mutations and the shared Bridge audit trail atomic.
-- The service-role-only RPC is called only after the LOOP API verifies a linked,
-- email-verified Bridge admin identity.
create or replace function public.bridge_loop_admin_set_featured(
  p_actor_user_id text,
  p_title_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required';
  end if;

  if p_actor_user_id is null or p_title_id is null or p_featured is null then
    raise exception 'required arguments are missing';
  end if;

  if not exists (
    select 1
    from public.bridge_profiles p
    where p.user_id = p_actor_user_id
      and p.email_verified = true
      and p.internal_role in ('admin', 'super_admin')
  ) then
    raise exception 'verified Bridge admin identity required';
  end if;

  update public.loop_titles
  set featured = p_featured
  where id = p_title_id;

  if not found then
    raise exception 'LOOP title not found';
  end if;

  insert into public.bridge_audit_logs (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    p_actor_user_id,
    'loop.title.featured_updated',
    'loop_title',
    p_title_id::text,
    jsonb_build_object('featured', p_featured)::text
  );
end;
$function$;

revoke all on function public.bridge_loop_admin_set_featured(text, uuid, boolean) from public;
revoke all on function public.bridge_loop_admin_set_featured(text, uuid, boolean) from anon;
revoke all on function public.bridge_loop_admin_set_featured(text, uuid, boolean) from authenticated;
grant execute on function public.bridge_loop_admin_set_featured(text, uuid, boolean) to service_role;
