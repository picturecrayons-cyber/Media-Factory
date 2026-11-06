-- Buyer publication must be backed by the exact current evidence selected
-- for the destination package. Additive source migration only; not applied here.
create or replace function public.bridge_title_buyer_visibility(p_title_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.bridge_titles t
    join public.bridge_title_gate_certifications g on g.title_id = t.id
    where t.id = p_title_id
      and t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
      and exists (
        select 1
        from public.bridge_destination_packages p
        join public.bridge_rights_grants r
          on r.id = p.rights_grant_id
         and r.title_id = p.title_id
        join public.bridge_qc_cases q
          on q.id = p.qc_case_id
         and q.title_id = p.title_id
        join public.bridge_legal_cases l
          on l.id = p.legal_case_id
         and l.title_id = p.title_id
        where p.title_id = t.id
          and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
          and r.status = 'VALID'
          and r.window_start is not null
          and r.window_start <= now()
          and r.window_end is not null
          and r.window_end > now()
          and jsonb_array_length(
            case when jsonb_typeof(r.territories) = 'array' then r.territories else '[]'::jsonb end
          ) > 0
          and jsonb_array_length(
            case when jsonb_typeof(r.languages) = 'array' then r.languages else '[]'::jsonb end
          ) > 0
          and jsonb_array_length(
            case when jsonb_typeof(r.media) = 'array' then r.media else '[]'::jsonb end
          ) > 0
          and (
            r.media @> jsonb_build_array(p.destination)
            or exists (
              select 1 from jsonb_array_elements_text(
                case when jsonb_typeof(r.media) = 'array' then r.media else '[]'::jsonb end
              ) m(value)
              where upper(m.value) in ('OTT','STREAMING','DIGITAL','ALL','*')
            )
            or (
              p.commercial_model is not null
              and r.media @> jsonb_build_array(p.commercial_model)
            )
          )
          and q.status = 'PASSED'
          and q.reviewer_findings -> 0 ->> 'masterKey' = t.master_key
          and q.reviewer_findings -> 0 ->> 'posterKey' = t.poster_key
          and l.status = 'APPROVED'
          and l.evidence -> 0 ->> 'grantId' = r.id::text
      )
      and g.ott_preparation_status = 'READY'
      and g.packaging_status = 'COMPLETE'
      and g.curation_status = 'APPROVED'
      and g.delivery_status = 'READY'
  );
$$;

create or replace function public.bridge_assert_buyer_publishable(p_title_id text)
returns void
language plpgsql
stable
as $$
begin
  if not public.bridge_title_buyer_visibility(p_title_id) then
    raise exception 'TITLE_NOT_BUYER_PUBLISHABLE: publication gates and exact current QC, legal and active rights evidence are required';
  end if;
end;
$$;

comment on function public.bridge_title_buyer_visibility(text) is
  'Fail-closed Buyer visibility: active rights grant, exact package-linked QC/Legal cases and current title asset keys are mandatory.';
