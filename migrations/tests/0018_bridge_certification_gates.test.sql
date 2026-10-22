-- Rollback-only integration test for migrations/0018_bridge_certification_gates.sql.
-- Run ONLY against an isolated disposable/staging database after all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/tests/0018_bridge_certification_gates.test.sql
-- All fixture writes are rolled back. Never point this test at Production.
begin;

do $test$
declare
  v_title text := 'test-cert-gates-' || replace(gen_random_uuid()::text, '-', '');
  v_loop text := 'test-loop-cert-gates-' || replace(gen_random_uuid()::text, '-', '');
  v_master uuid;
  v_art uuid;
  v_qc uuid;
  v_grant uuid;
  v_legal uuid;
  v_window_start timestamptz := now() - interval '1 hour';
  v_window_end timestamptz := now() + interval '30 days';
  v_blocked boolean := false;
begin
  insert into public.bridge_titles
    (id, slug, name, owner_user_id, owner_account_type, status, language)
  values
    (v_title, v_title, 'Synthetic certification gate test', 'test-only', 'studio', 'DRAFT', 'Malayalam');

  insert into public.loop_titles
    (id, bridge_title_id, slug, title, language, listed, published, access_tier)
  values
    (v_loop, v_title, v_loop, 'Synthetic certification gate test', 'Malayalam', false, false, 'TVOD');

  -- Negative test 1: no evidence must block an attempted Bridge authorization.
  begin
    insert into public.bridge_loop_publications
      (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
       exploitation_models, window_start, window_end, approved_by, approved_at)
    values
      ('test-pub-' || v_title, v_title, v_loop, 'authorized', array['IN'], array['Malayalam'],
       array['TVOD'], v_window_start, v_window_end, 'synthetic-reviewer', now());
    raise exception 'TEST_FAILED: authorization unexpectedly passed with missing evidence';
  exception
    when others then
      if sqlerrm like 'BRIDGE_GATE_BLOCKED:%' then
        v_blocked := true;
      elsif sqlerrm like 'TEST_FAILED:%' then
        raise;
      else
        raise;
      end if;
  end;
  if not v_blocked then
    raise exception 'TEST_FAILED: incomplete evidence was not blocked';
  end if;

  -- Negative test 2: Loop must not become buyer-visible without an active Bridge authorization.
  v_blocked := false;
  begin
    update public.loop_titles set listed = true, published = true where id = v_loop;
    raise exception 'TEST_FAILED: Loop became buyer-visible without Bridge authorization';
  exception
    when others then
      if sqlerrm like 'BRIDGE_GATE_BLOCKED:%' then
        v_blocked := true;
      elsif sqlerrm like 'TEST_FAILED:%' then
        raise;
      else
        raise;
      end if;
  end;
  if not v_blocked then
    raise exception 'TEST_FAILED: unauthorized buyer visibility was not blocked';
  end if;

  -- Create synthetic, non-production-only evidence for the positive path.
  insert into public.bridge_asset_versions
    (title_id, asset_group, asset_type, s3_key, checksum_sha256, byte_size,
     processing_state, created_by)
  values
    (v_title, 'VIDEO', 'MASTER', 'synthetic/' || v_title || '/master',
     repeat('a', 64), 1234, 'PASSED', 'test-only')
  returning id into v_master;

  insert into public.bridge_asset_versions
    (title_id, asset_group, asset_type, s3_key, checksum_sha256, byte_size,
     processing_state, created_by)
  values
    (v_title, 'ARTWORK', 'POSTER_VERTICAL', 'synthetic/' || v_title || '/poster',
     repeat('b', 64), 123, 'PASSED', 'test-only')
  returning id into v_art;

  insert into public.bridge_qc_cases
    (title_id, asset_version_id, status, reviewer_findings, reviewed_by, reviewed_at)
  values
    (v_title, v_master, 'PASSED', '[{"check":"synthetic-test","result":"passed"}]'::jsonb,
     'independent-test-reviewer', now())
  returning id into v_qc;

  insert into public.bridge_rights_grants
    (title_id, territories, languages, media, window_start, window_end, evidence, status, created_by)
  values
    (v_title, '["IN"]'::jsonb, '["Malayalam"]'::jsonb, '["TVOD"]'::jsonb,
     v_window_start, v_window_end, '[{"reference":"synthetic-test-evidence"}]'::jsonb,
     'VALID', 'test-only')
  returning id into v_grant;

  insert into public.bridge_legal_cases
    (title_id, status, evidence, reviewed_by, reviewed_at)
  values
    (v_title, 'APPROVED',
     jsonb_build_array(jsonb_build_object('grantId', v_grant::text, 'reference', 'synthetic-test-evidence')),
     'independent-test-legal-reviewer', now())
  returning id into v_legal;

  insert into public.bridge_title_gate_certifications
    (title_id, ott_preparation_status, packaging_status, curation_status, delivery_status,
     updated_by, evidence, updated_at)
  values
    (v_title, 'READY', 'COMPLETE', 'APPROVED', 'READY',
     'test-only',
     '{"ott":{"evidence":"synthetic"},"packaging":{"evidence":"synthetic"},"curation":{"evidence":"synthetic"},"delivery":{"evidence":"synthetic"}}'::jsonb,
     now());

  insert into public.bridge_destination_packages
    (title_id, destination, rights_grant_id, qc_case_id, legal_case_id, asset_version_ids,
     readiness_state, authorized_by, authorized_at)
  values
    (v_title, 'CRAYONS_LOOP', v_grant, v_qc, v_legal,
     jsonb_build_array(v_master::text, v_art::text),
     'AUTHORIZED', 'synthetic-bridge-authorizer', now());

  -- Positive test: complete synthetic evidence must allow Bridge authorization.
  insert into public.bridge_loop_publications
    (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
     exploitation_models, window_start, window_end, approved_by, approved_at)
  values
    ('test-pub-' || v_title, v_title, v_loop, 'authorized', array['IN'], array['Malayalam'],
     array['TVOD'], v_window_start, v_window_end, 'synthetic-bridge-authorizer', now());

  -- Positive test: Loop may become buyer-visible only after that authorization exists.
  update public.loop_titles set listed = true, published = true where id = v_loop;

  if not exists (
    select 1 from public.loop_titles where id = v_loop and listed and published
  ) then
    raise exception 'TEST_FAILED: valid synthetic fixture did not become buyer-visible';
  end if;

  raise notice 'PASS: missing evidence blocked; complete synthetic evidence authorized; buyer visibility gated';
end
$test$;

rollback;
