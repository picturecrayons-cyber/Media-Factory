-- Evidence-gated Buyer / LOOP visibility hardening.
-- Additive function replacement only; never mutates existing title, QC, rights or publication rows.
-- Legacy QC PASS rows without structured technicalEvidence remain NOT VERIFIED and cannot authorize visibility.

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
      and coalesce(nullif(btrim(t.original_title), ''), nullif(btrim(t.name), '')) is not null
      and nullif(btrim(t.content_type), '') is not null
      and nullif(btrim(t.language), '') is not null
      and t.year is not null
      and t.runtime_minutes is not null
      and nullif(btrim(t.country_of_origin), '') is not null
      and t.release_date is not null
      and nullif(btrim(t.synopsis), '') is not null
      and exists (
        select 1
        from jsonb_array_elements(case when jsonb_typeof(t.credits) = 'array' then t.credits else '[]'::jsonb end) credit
        where lower(coalesce(credit->>'role','')) = 'director'
          and nullif(btrim(credit->>'name'), '') is not null
      )
      and exists (
        select 1
        from jsonb_array_elements(case when jsonb_typeof(t.credits) = 'array' then t.credits else '[]'::jsonb end) credit
        where lower(coalesce(credit->>'role','')) = 'producer'
          and nullif(btrim(credit->>'name'), '') is not null
      )
      and exists (
        select 1
        from jsonb_array_elements(case when jsonb_typeof(t.credits) = 'array' then t.credits else '[]'::jsonb end) credit
        where lower(coalesce(credit->>'role','')) = 'cast'
          and nullif(btrim(credit->>'name'), '') is not null
      )
      and exists (
        select 1
        from public.bridge_qc_cases q
        where q.title_id = t.id
          and q.status = 'PASSED'
          and q.reviewer_findings->0->>'masterKey' = t.master_key
          and q.reviewer_findings->0->>'posterKey' = t.poster_key
          and q.reviewed_by is not null
          and q.reviewed_at is not null
          and q.reviewer_findings->0->'technicalEvidence'->>'playbackVerified' = 'true'
          and nullif(q.reviewer_findings->0->'technicalEvidence'->>'codec', '') is not null
          and nullif(q.reviewer_findings->0->'technicalEvidence'->>'resolution', '') is not null
          and nullif(q.reviewer_findings->0->'technicalEvidence'->>'frameRate', '') is not null
          and q.reviewer_findings->0->'technicalEvidence'->>'audioVerified' = 'true'
          and nullif(q.reviewer_findings->0->'technicalEvidence'->>'audioDetails', '') is not null
          and nullif(q.reviewer_findings->0->'technicalEvidence'->>'masterLanguage', '') is not null
          and q.reviewer_findings->0->'technicalEvidence'->>'posterVerified' = 'true'
          and (
            q.reviewer_findings->0->'technicalEvidence'->>'subtitleStatus' = 'NOT_APPLICABLE'
            or (
              q.reviewer_findings->0->'technicalEvidence'->>'subtitleStatus' = 'VERIFIED'
              and nullif(q.reviewer_findings->0->'technicalEvidence'->>'subtitleLanguages', '') is not null
            )
          )
      )
      and exists (
        select 1
        from public.bridge_rights_grants rg
        join public.bridge_legal_cases l
          on l.title_id = rg.title_id
         and l.evidence->0->>'grantId' = rg.id::text
        where rg.title_id = t.id
          and rg.status = 'VALID'
          and rg.window_start < rg.window_end
          and rg.window_end > now()
          and l.status = 'APPROVED'
          and l.reviewed_by is not null
          and l.reviewed_at is not null
          and nullif(l.evidence->0->>'agreementReference', '') is not null
          and nullif(l.evidence->0->>'ownershipReference', '') is not null
          and l.evidence->0->>'reviewerConfirmedEvidence' = 'true'
      )
      and g.ott_preparation_status = 'READY'
      and g.packaging_status = 'COMPLETE'
      and g.curation_status = 'APPROVED'
      and g.delivery_status = 'READY'
      and exists (
        select 1
        from public.bridge_destination_packages p
        where p.title_id = t.id
          and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')
      )
  );
$$;

create or replace function public.bridge_assert_buyer_publishable(p_title_id text)
returns void
language plpgsql
stable
as $$
begin
  if not public.bridge_title_buyer_visibility(p_title_id) then
    raise exception 'TITLE_NOT_BUYER_PUBLISHABLE: metadata, current-asset QC evidence, independent legal approval, all four release certifications and destination delivery readiness are required';
  end if;
end;
$$;

comment on function public.bridge_title_buyer_visibility(text) is
  'Evidence-gated Buyer visibility: requires complete metadata, current-asset technical QC evidence, independent legal approval, all release certifications and destination package readiness.';
