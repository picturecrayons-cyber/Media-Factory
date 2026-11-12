-- Seven-file Buyer Gallery gate.
-- Existing records are retained. Titles are not Buyer-visible until every required
-- asset has a positive verified byte size and a matching immutable upload-verification
-- audit record carrying the storage ETag/checksum token.
create or replace function public.bridge_title_buyer_visibility(p_title_id text)
returns boolean
language sql
stable
set search_path = public
as $$
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
        select 1 from public.bridge_legal_cases l
        where l.title_id = t.id and l.status = 'APPROVED'
      )
      and g.ott_preparation_status = 'READY'
      and g.packaging_status = 'COMPLETE'
      and g.curation_status = 'APPROVED'
      and g.delivery_status = 'READY'
      and exists (
        select 1 from public.bridge_destination_packages p
        where p.title_id = t.id
          and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
      )
      and not exists (
        select 1
        from unnest(array[
          'master',
          'screener',
          'poster_vertical',
          'poster_horizontal',
          'thumbnail',
          'subtitle',
          'censor_certificate'
        ]::text[]) as required(kind)
        where not exists (
          select 1
          from public.bridge_assets a
          where a.title_id = t.id
            and a.kind = required.kind
            and coalesce(a.byte_size, 0) > 0
            and exists (
              select 1
              from public.bridge_audit_logs audit
              where audit.entity_type = 'bridge_asset'
                and audit.entity_id = a.id
                and audit.action = 'asset.upload_verified'
                and nullif(trim(audit.metadata::jsonb->>'checksum'), '') is not null
                and nullif(trim(audit.metadata::jsonb->>'byteSize'), '') is not null
            )
        )
      )
  );
$$;

create or replace function public.bridge_assert_buyer_publishable(p_title_id text)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.bridge_title_buyer_visibility(p_title_id) then
    raise exception 'TITLE_NOT_BUYER_PUBLISHABLE: six certification gates, destination readiness, and all seven verified Buyer Gallery files are required';
  end if;
end;
$$;

comment on function public.bridge_title_buyer_visibility(text) is
  'Fail-closed Buyer visibility: six certification gates, destination readiness, and seven verified Gallery asset kinds.';
