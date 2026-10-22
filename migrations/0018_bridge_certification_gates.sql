-- Crayons Bridge certification gates: enforce server-side before new Loop authorization.
-- Additive and fail-closed. This migration does not rewrite or unpublish existing catalogue rows.
-- Apply only to an isolated staging database after review; do not run against Production as part of this PR.

create or replace function public.bridge_assert_distribution_evidence(
  p_title_id text,
  p_territories text[],
  p_languages text[],
  p_models text[],
  p_window_start timestamptz,
  p_window_end timestamptz
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_grant_id uuid;
  v_qc_id uuid;
  v_legal_id uuid;
begin
  if coalesce(array_length(p_territories, 1), 0) = 0
     or coalesce(array_length(p_languages, 1), 0) = 0
     or coalesce(array_length(p_models, 1), 0) = 0
     or p_window_start is null or p_window_end is null
     or p_window_start >= p_window_end
     or not ('TVOD' = any(p_models)) then
    raise exception 'BRIDGE_GATE_BLOCKED: explicit territory, language, TVOD model, and valid time window are required';
  end if;

  -- Require a verified master and at least one verified artwork version.
  if not exists (
    select 1 from bridge_asset_versions av
    where av.title_id = p_title_id
      and lower(av.asset_type) = 'master'
      and av.asset_group = 'VIDEO'
      and av.processing_state = 'PASSED'
      and av.checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
      and av.byte_size > 0
  ) then
    raise exception 'BRIDGE_GATE_BLOCKED: verified master with SHA-256 and positive byte size is required';
  end if;

  if not exists (
    select 1 from bridge_asset_versions av
    where av.title_id = p_title_id
      and av.asset_group = 'ARTWORK'
      and lower(av.asset_type) in ('poster','poster_vertical','poster_horizontal','thumbnail')
      and av.processing_state = 'PASSED'
      and av.checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
      and av.byte_size > 0
  ) then
    raise exception 'BRIDGE_GATE_BLOCKED: verified artwork with SHA-256 and positive byte size is required';
  end if;

  select q.id into v_qc_id
  from bridge_qc_cases q
  where q.title_id = p_title_id
    and q.status = 'PASSED'
    and nullif(trim(q.reviewed_by), '') is not null
    and q.reviewed_at is not null
    and jsonb_typeof(q.reviewer_findings) = 'array'
    and jsonb_array_length(q.reviewer_findings) > 0
    and q.asset_version_id in (
      select av.id from bridge_asset_versions av
      where av.title_id = p_title_id
        and av.processing_state = 'PASSED'
        and av.checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
        and av.byte_size > 0
    )
  order by q.reviewed_at desc
  limit 1;

  if v_qc_id is null then
    raise exception 'BRIDGE_GATE_BLOCKED: authorized QC review tied to a verified asset version is required';
  end if;

  select g.id into v_grant_id
  from bridge_rights_grants g
  where g.title_id = p_title_id
    and g.status = 'VALID'
    and jsonb_typeof(g.evidence) = 'array'
    and jsonb_array_length(g.evidence) > 0
    and g.window_start is not null
    and g.window_end is not null
    and g.window_start <= p_window_start
    and g.window_end >= p_window_end
    and not exists (
      select 1 from unnest(p_territories) requested(value)
      where not (g.territories ? 'WORLDWIDE' or g.territories ? requested.value)
    )
    and not exists (
      select 1 from unnest(p_languages) requested(value)
      where not (g.languages ? requested.value)
    )
    and not exists (
      select 1 from unnest(p_models) requested(value)
      where not (g.media ? requested.value)
    )
  order by g.created_at desc
  limit 1;

  if v_grant_id is null then
    raise exception 'BRIDGE_GATE_BLOCKED: active rights grant with evidence must cover all requested dimensions and window';
  end if;

  select l.id into v_legal_id
  from bridge_legal_cases l
  where l.title_id = p_title_id
    and l.status = 'APPROVED'
    and nullif(trim(l.reviewed_by), '') is not null
    and l.reviewed_at is not null
    and jsonb_typeof(l.evidence) = 'array'
    and jsonb_array_length(l.evidence) > 0
    and exists (
      select 1 from jsonb_array_elements(l.evidence) ev
      where ev->>'grantId' = v_grant_id::text
    )
  order by l.reviewed_at desc
  limit 1;

  if v_legal_id is null then
    raise exception 'BRIDGE_GATE_BLOCKED: independent legal approval linked to the active rights grant is required';
  end if;

  if not exists (
    select 1 from bridge_title_gate_certifications gate
    where gate.title_id = p_title_id
      and gate.ott_preparation_status = 'READY'
      and gate.packaging_status = 'COMPLETE'
      and gate.curation_status = 'APPROVED'
      and gate.delivery_status = 'READY'
      and gate.evidence <> '{}'::jsonb
  ) then
    raise exception 'BRIDGE_GATE_BLOCKED: OTT, packaging, curation, and delivery certification gates must pass with evidence';
  end if;

  if not exists (
    select 1 from bridge_destination_packages pkg
    where pkg.title_id = p_title_id
      and pkg.destination = 'CRAYONS_LOOP'
      and pkg.readiness_state in ('READY','AUTHORIZED','DELIVERED')
      and nullif(trim(pkg.authorized_by), '') is not null
      and pkg.authorized_at is not null
      and pkg.rights_grant_id = v_grant_id
      and pkg.qc_case_id = v_qc_id
      and pkg.legal_case_id = v_legal_id
      and jsonb_typeof(pkg.asset_version_ids) = 'array'
      and jsonb_array_length(pkg.asset_version_ids) > 0
      and not exists (
        select 1
        from jsonb_array_elements_text(pkg.asset_version_ids) item(value)
        where not exists (
          select 1 from bridge_asset_versions av
          where av.id::text = item.value
            and av.title_id = p_title_id
            and av.processing_state = 'PASSED'
            and av.checksum_sha256 ~ '^[0-9a-fA-F]{64}$'
            and av.byte_size > 0
        )
      )
  ) then
    raise exception 'BRIDGE_GATE_BLOCKED: authorized Loop destination package must reference matching QC, legal, rights, and verified asset evidence';
  end if;
end;
$$;

create or replace function public.bridge_guard_loop_publication_authorization()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lower(new.authorization_status) in ('authorized','live','delivered') then
    if nullif(trim(new.approved_by), '') is null
       or new.approved_at is null
       or new.revoked_at is not null then
      raise exception 'BRIDGE_GATE_BLOCKED: explicit non-revoked Bridge authorization with approver and timestamp is required';
    end if;

    perform public.bridge_assert_distribution_evidence(
      new.bridge_title_id,
      new.territories,
      new.languages,
      new.exploitation_models,
      new.window_start,
      new.window_end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_guard_loop_publication_authorization on public.bridge_loop_publications;
create trigger bridge_guard_loop_publication_authorization
before insert or update of authorization_status, territories, languages, exploitation_models,
  window_start, window_end, approved_by, approved_at, revoked_at
on public.bridge_loop_publications
for each row execute function public.bridge_guard_loop_publication_authorization();

-- A new or newly buyer-visible Loop listing must have a matching authorized Bridge record.
-- Existing published rows are not rewritten by this migration; changing their visibility
-- fields requires the same gates as new listings.
create or replace function public.bridge_guard_loop_listing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pub record;
begin
  if new.published is true and new.listed is true then
    if new.bridge_title_id is null then
      raise exception 'BRIDGE_GATE_BLOCKED: Loop listings require a canonical Bridge title';
    end if;

    select p.* into v_pub
    from bridge_loop_publications p
    where p.bridge_title_id = new.bridge_title_id
      and p.loop_title_id = new.id
      and lower(p.authorization_status) in ('authorized','live','delivered')
      and p.approved_by is not null
      and p.approved_at is not null
      and p.revoked_at is null
      and (p.window_start is null or p.window_start <= now())
      and (p.window_end is null or p.window_end > now())
    limit 1;

    if v_pub.bridge_title_id is null then
      raise exception 'BRIDGE_GATE_BLOCKED: published/listed Loop title requires active Bridge authorization';
    end if;

    perform public.bridge_assert_distribution_evidence(
      v_pub.bridge_title_id, v_pub.territories, v_pub.languages,
      v_pub.exploitation_models, v_pub.window_start, v_pub.window_end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_guard_loop_listing on public.loop_titles;
create trigger bridge_guard_loop_listing
before insert or update of published, listed, bridge_title_id
on public.loop_titles
for each row execute function public.bridge_guard_loop_listing();

comment on function public.bridge_assert_distribution_evidence(text,text[],text[],text[],timestamptz,timestamptz) is
  'Fail-closed Bridge QC, verified assets, rights/legal, package, and destination evidence gate. Do not run against Production without independent review and catalogue impact assessment.';
