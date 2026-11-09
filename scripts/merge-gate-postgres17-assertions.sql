-- Merge Gate PostgreSQL 17 contract assertions.
-- Runs only against the disposable GitHub Actions PostgreSQL service.
-- Intentionally fails closed when the migration does not satisfy the reviewed contract.
DO $verify$
DECLARE
  failures text[] := ARRAY[]::text[];
  missing text;
  fk_count integer;
  has_rls boolean;
  table_name text;
  privilege_name text;
  policy_ok boolean;
BEGIN
  -- Required objects and columns (merge-gate only; duplicate_reviews is a separate subsystem).
  IF to_regclass('public.bridge_title_merge_audits') IS NULL THEN
    failures := array_append(failures, 'missing public.bridge_title_merge_audits');
  END IF;
  IF to_regclass('public.bridge_title_merge_aliases') IS NULL THEN
    failures := array_append(failures, 'missing public.bridge_title_merge_aliases');
  END IF;

  SELECT string_agg(v.table_name || '.' || v.column_name, ', ')
    INTO missing
  FROM (VALUES
    ('bridge_title_merge_audits','merge_id'),
    ('bridge_title_merge_audits','canonical_title_id'),
    ('bridge_title_merge_audits','retiring_title_id'),
    ('bridge_title_merge_audits','decision'),
    ('bridge_title_merge_audits','completed_at'),
    ('bridge_title_merge_audits','rollback_state'),
    ('bridge_title_merge_aliases','retiring_title_id'),
    ('bridge_title_merge_aliases','canonical_title_id'),
    ('bridge_title_merge_aliases','merge_id'),
    ('bridge_titles','merged_into_title_id'),
    ('bridge_titles','merged_at')
  ) AS v(table_name,column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=v.table_name AND c.column_name=v.column_name
  WHERE c.column_name IS NULL;
  IF missing IS NOT NULL THEN failures := array_append(failures, 'missing required columns: ' || missing); END IF;

  -- Required FK coverage and ON DELETE RESTRICT semantics.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL THEN
    SELECT count(*) INTO fk_count
    FROM pg_constraint c
    WHERE c.conrelid='public.bridge_title_merge_audits'::regclass
      AND c.contype='f' AND c.confdeltype='r';
    IF fk_count < 2 THEN failures := array_append(failures, 'merge audits require RESTRICT FKs to canonical title and retiring title'); END IF;
  END IF;
  IF to_regclass('public.bridge_title_merge_aliases') IS NOT NULL THEN
    SELECT count(*) INTO fk_count
    FROM pg_constraint c
    WHERE c.conrelid='public.bridge_title_merge_aliases'::regclass
      AND c.contype='f' AND c.confdeltype='r';
    IF fk_count < 3 THEN failures := array_append(failures, 'merge aliases require RESTRICT FKs to retiring title, canonical title and audit'); END IF;
  END IF;
  IF to_regclass('public.bridge_titles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.bridge_titles'::regclass AND c.contype='f'
      AND pg_get_constraintdef(c.oid) ILIKE '%merged_into_title_id%'
      AND c.confdeltype='r'
  ) THEN failures := array_append(failures, 'bridge_titles merged_into_title_id self-FK RESTRICT is missing'); END IF;

  -- Fail-closed merge-state constraints.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bridge_title_merge_audits'::regclass AND pg_get_constraintdef(oid) ILIKE '%canonical_title_id%retiring_title_id%') THEN
      failures := array_append(failures, 'audit no-self-merge constraint is missing');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bridge_title_merge_audits'::regclass AND pg_get_constraintdef(oid) ILIKE '%completed_at%') THEN
      failures := array_append(failures, 'MERGED requires completed_at constraint is missing');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bridge_title_merge_audits'::regclass AND pg_get_constraintdef(oid) ILIKE '%rollback_state%') THEN
      failures := array_append(failures, 'ROLLED_BACK requires rollback evidence constraint is missing');
    END IF;
  END IF;
  IF to_regclass('public.bridge_titles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.bridge_titles'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%merged_into_title_id%'
      AND pg_get_constraintdef(oid) ILIKE '%merged_at%'
  ) THEN failures := array_append(failures, 'title merge pointer/timestamp paired-null constraint is missing'); END IF;

  -- Required indexes.
  IF to_regclass('public.bridge_title_merge_audits_titles_idx') IS NULL THEN failures := array_append(failures, 'audit lookup index missing'); END IF;
  IF to_regclass('public.bridge_title_merge_aliases_canonical_idx') IS NULL THEN failures := array_append(failures, 'alias canonical index missing'); END IF;
  IF to_regclass('public.bridge_titles_merged_into_idx') IS NULL THEN failures := array_append(failures, 'title merged-into index missing'); END IF;

  -- RLS and explicit browser-role deny policies plus direct ACL revocation.
  FOREACH table_name IN ARRAY ARRAY['bridge_title_merge_audits','bridge_title_merge_aliases'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      SELECT relrowsecurity INTO has_rls FROM pg_class WHERE oid=('public.' || table_name)::regclass;
      IF NOT coalesce(has_rls,false) THEN failures := array_append(failures, table_name || ' RLS is disabled'); END IF;
      SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename=table_name
          AND cmd='ALL' AND roles @> ARRAY['anon','authenticated']::name[]
          AND qual='false' AND with_check='false'
      ) INTO policy_ok;
      IF NOT policy_ok THEN failures := array_append(failures, table_name || ' explicit anon/authenticated deny policy missing'); END IF;
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege('anon','public.' || table_name,privilege_name)
          OR has_table_privilege('authenticated','public.' || table_name,privilege_name) THEN
          failures := array_append(failures, table_name || ' browser ACL still grants ' || privilege_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'MERGE_GATE_CONTRACT_FAIL: %', array_to_string(failures, ' | ');
  END IF;
  RAISE NOTICE 'MERGE_GATE_CONTRACT_PASS';
END
$verify$;
