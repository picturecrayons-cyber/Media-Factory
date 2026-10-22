-- Rollback-only integration test for migrations/0018_bridge_certification_gates.sql.
-- Run ONLY against an isolated disposable/staging database after all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/tests/0018_bridge_certification_gates.test.sql
-- All fixture writes are rolled back. Never point this test at Production.
begin;

do $test$
declare
  v_title text := 'test-cert-gates-' || replace(gen_random_uuid()::text, '-', '');
  v_other_title text := 'test-cert-gates-other-' || replace(gen_random_uuid()::text, '-', '');
  v_loop text := 'test-loop-cert-gates-' || replace(gen_random_uuid()::text, '-', '');
  v_other_loop text := 'test-loop-cert-gates-other-' || replace(gen_random_uuid()::text, '-', '');
  v_master uuid;
  v_art uuid;
  v_qc uuid;
  v_grant uuid;
  v_legal uuid;
  v_admin_actor text := 'test-admin-' || replace(gen_random_uuid()::text, '-', '');
  v_qc_actor text := 'test-qc-' || replace(gen_random_uuid()::text, '-', '');
  v_legal_actor text := 'test-legal-' || replace(gen_random_uuid()::text, '-', '');
  v_viewer_actor text := 'test-viewer-' || replace(gen_random_uuid()::text, '-', '');
  v_window_start timestamptz := now() - interval '1 hour';
  v_window_end timestamptz := now() + interval '30 days';
  v_blocked boolean := false;
  v_model text;
begin
  insert into public.bridge_profiles
    (user_id, email, display_name, account_type, internal_role, email_verified)
  values
    (v_admin_actor, v_admin_actor || '@example.invalid', 'Synthetic Admin', 'independent_creator', 'admin', true),
    (v_qc_actor, v_qc_actor || '@example.invalid', 'Synthetic QC Reviewer', 'independent_creator', 'qc_reviewer', true),
    (v_legal_actor, v_legal_actor || '@example.invalid', 'Synthetic Legal Reviewer', 'independent_creator', 'legal_reviewer', true),
    (v_viewer_actor, v_viewer_actor || '@example.invalid', 'Synthetic Viewer', 'independent_creator', 'viewer', true);

  insert into public.bridge_titles
    (id, slug, name, owner_user_id, owner_account_type, status, language)
  values
    (v_title, v_title, 'Synthetic certification gate test', 'test-only', 'studio', 'DRAFT', 'Malayalam');

  insert into public.loop_titles
    (id, bridge_title_id, slug, title, language, listed, published, access_tier)
  values
    (v_loop, v_title, v_loop, 'Synthetic certification gate test', 'Malayalam', false, false, 'TVOD');

  insert into public.bridge_titles
    (id, slug, name, owner_user_id, owner_account_type, status, language)
  values
    (v_other_title, v_other_title, 'Synthetic alternate title for relink test', 'test-only', 'studio', 'DRAFT', 'Malayalam');

  insert into public.loop_titles
    (id, bridge_title_id, slug, title, language, listed, published, access_tier)
  values
    (v_other_loop, v_other_title, v_other_loop, 'Synthetic alternate Loop title', 'Malayalam', false, false, 'TVOD');

  -- Negative test 1: no evidence must block an attempted Bridge authorization.
  begin
    insert into public.bridge_loop_publications
      (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
       exploitation_models, window_start, window_end, approved_by, approved_at)
    values
      ('test-pub-' || v_title, v_title, v_loop, 'authorized', array['WORLDWIDE'], array['Malayalam'],
       array['TVOD'], v_window_start, v_window_end, v_admin_actor, now());
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

  -- Negative test 1b: a verified but unauthorized viewer cannot impersonate an approver.
  v_blocked := false;
  begin
    insert into public.bridge_loop_publications
      (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
       exploitation_models, window_start, window_end, approved_by, approved_at)
    values
      ('test-unauth-pub-' || v_title, v_title, v_loop, 'authorized', array['WORLDWIDE'], array['Malayalam'],
       array['TVOD'], v_window_start, v_window_end, v_viewer_actor, now());
    raise exception 'TEST_FAILED: viewer role was allowed to authorize Loop publication';
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
    raise exception 'TEST_FAILED: unauthorized viewer approval was not blocked';
  end if;

  -- Negative test 1c: Loop authorization cannot be limited to a non-worldwide territory.
  v_blocked := false;
  begin
    insert into public.bridge_loop_publications
      (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
       exploitation_models, window_start, window_end, approved_by, approved_at)
    values
      ('test-territory-pub-' || v_title, v_title, v_loop, 'authorized', array['IN'], array['Malayalam'],
       array['TVOD'], v_window_start, v_window_end, v_admin_actor, now());
    raise exception 'TEST_FAILED: non-WORLDWIDE TVOD scope was allowed';
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
    raise exception 'TEST_FAILED: non-WORLDWIDE territory was not blocked';
  end if;

  -- Negative test 1d: Loop authorization cannot use SVOD instead of TVOD.
  v_blocked := false;
  begin
    insert into public.bridge_loop_publications
      (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
       exploitation_models, window_start, window_end, approved_by, approved_at)
    values
      ('test-model-pub-' || v_title, v_title, v_loop, 'authorized', array['WORLDWIDE'], array['Malayalam'],
       array['SVOD'], v_window_start, v_window_end, v_admin_actor, now());
    raise exception 'TEST_FAILED: SVOD Loop scope was allowed';
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
    raise exception 'TEST_FAILED: non-TVOD exploitation model was not blocked';
  end if;

  -- Negative test 1e: TVOD must not be combined with SVOD, AVOD, or FREE.
  foreach v_model in array array['SVOD', 'AVOD', 'FREE'] loop
    v_blocked := false;
    begin
      insert into public.bridge_loop_publications
        (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
         exploitation_models, window_start, window_end, approved_by, approved_at)
      values
        ('test-combined-model-' || v_model || '-' || v_title, v_title, v_loop, 'authorized',
         array['WORLDWIDE'], array['Malayalam'], array['TVOD', v_model],
         v_window_start, v_window_end, v_admin_actor, now());
      raise exception 'TEST_FAILED: TVOD combined with % was allowed', v_model;
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
      raise exception 'TEST_FAILED: TVOD combined with % was not blocked', v_model;
    end if;
  end loop;

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
     v_qc_actor, now())
  returning id into v_qc;

  insert into public.bridge_rights_grants
    (title_id, territories, languages, media, window_start, window_end, evidence, status, created_by)
  values
    (v_title, '["WORLDWIDE"]'::jsonb, '["Malayalam"]'::jsonb, '["TVOD"]'::jsonb,
     v_window_start, v_window_end, '[{"reference":"synthetic-test-evidence"}]'::jsonb,
     'VALID', 'test-only')
  returning id into v_grant;

  insert into public.bridge_legal_cases
    (title_id, status, evidence, reviewed_by, reviewed_at)
  values
    (v_title, 'APPROVED',
     jsonb_build_array(jsonb_build_object('grantId', v_grant::text, 'reference', 'synthetic-test-evidence')),
     v_legal_actor, now())
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
     'AUTHORIZED', v_admin_actor, now());

  -- Positive test: complete synthetic evidence must allow Bridge authorization.
  insert into public.bridge_loop_publications
    (id, bridge_title_id, loop_title_id, authorization_status, territories, languages,
     exploitation_models, window_start, window_end, approved_by, approved_at)
  values
    ('test-pub-' || v_title, v_title, v_loop, 'authorized', array['WORLDWIDE'], array['Malayalam'],
     array['TVOD'], v_window_start, v_window_end, v_admin_actor, now());

  -- Negative test 3: relinking an authorized publication to another Bridge title must re-run the gate.
  v_blocked := false;
  begin
    update public.bridge_loop_publications
    set bridge_title_id = v_other_title
    where id = 'test-pub-' || v_title;
    raise exception 'TEST_FAILED: authorized publication was relinked to another Bridge title';
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
    raise exception 'TEST_FAILED: Bridge-title relink was not blocked';
  end if;

  -- Negative test 4: relinking an authorized publication to another Loop record must re-run the gate.
  v_blocked := false;
  begin
    update public.bridge_loop_publications
    set loop_title_id = v_other_loop
    where id = 'test-pub-' || v_title;
    raise exception 'TEST_FAILED: authorized publication was relinked to another Loop title';
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
    raise exception 'TEST_FAILED: Loop-title relink was not blocked';
  end if;

  -- Positive test: Loop may become buyer-visible only after that authorization exists.
  update public.loop_titles set listed = true, published = true where id = v_loop;

  if not exists (
    select 1 from public.loop_titles where id = v_loop and listed and published
  ) then
    raise exception 'TEST_FAILED: valid synthetic fixture did not become buyer-visible';
  end if;

  -- Negative test 5: an authorized TVOD listing cannot be switched to FREE while visible.
  v_blocked := false;
  begin
    update public.loop_titles set access_tier = 'FREE' where id = v_loop;
    raise exception 'TEST_FAILED: buyer-visible Loop title changed to FREE access tier';
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
    raise exception 'TEST_FAILED: buyer-visible non-TVOD access tier was not blocked';
  end if;

  raise notice 'PASS: incomplete evidence, unauthorized roles, invalid rights scope, relinking, and non-TVOD buyer visibility blocked; complete TVOD evidence authorized';
end
$test$;

rollback;
