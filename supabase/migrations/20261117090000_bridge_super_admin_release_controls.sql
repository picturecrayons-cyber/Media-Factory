-- Super Admin release controls are stored with the existing gate evidence.
-- Buyer visibility now requires a valid, in-window grant linked to its legal approval,
-- all publication gates, a ready destination package, and no active HOLD/BLOCK.
create or replace function public.bridge_title_buyer_visibility(p_title_id text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.bridge_titles t
    join public.bridge_title_gate_certifications g on g.title_id = t.id
    where t.id = p_title_id
      and t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      and exists (
        select 1 from public.bridge_qc_cases q
        where q.title_id = t.id and q.status = 'PASSED'
      )
      and exists (
        select 1
        from public.bridge_rights_grants rg
        join public.bridge_legal_cases l on l.title_id = rg.title_id
        where rg.title_id = t.id
          and rg.status = 'VALID'
          and rg.window_start is not null
          and rg.window_start <= now()
          and rg.window_end is not null
          and rg.window_end > now()
          and l.status = 'APPROVED'
          and exists (
            select 1
            from jsonb_array_elements(l.evidence) le
            where le->>'grantId' = rg.id::text
          )
      )
      and g.ott_preparation_status = 'READY'
      and g.packaging_status = 'COMPLETE'
      and g.curation_status = 'APPROVED'
      and g.delivery_status = 'READY'
      and coalesce(g.evidence #>> '{releaseControl,status}', 'CLEAR') = 'CLEAR'
      and exists (
        select 1
        from public.bridge_destination_packages p
        join public.bridge_rights_grants rg on rg.id = p.rights_grant_id
        where p.title_id = t.id
          and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
          and rg.status = 'VALID'
      )
  );
$function$;

create or replace function public.bridge_assert_buyer_publishable(p_title_id text)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $function$
begin
  if not public.bridge_title_buyer_visibility(p_title_id) then
    raise exception 'TITLE_NOT_BUYER_PUBLISHABLE: valid rights, legal approval, QC, four publication gates, release control and destination package are required';
  end if;
end;
$function$;

comment on function public.bridge_title_buyer_visibility(text) is
  'Fail-closed buyer visibility: requires a valid grant linked to legal approval, QC, four publication gates, a ready destination package, and no active title HOLD/BLOCK.';
