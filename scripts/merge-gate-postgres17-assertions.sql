-- Exact Merge Gate contract assertions for PostgreSQL 17.
-- Fail closed. Run only against the disposable CI PostgreSQL service.
DO $verify$
DECLARE
  failures text[] := ARRAY[]::text[];
  review_rel oid := to_regclass('public.bridge_title_duplicate_reviews');
  ok boolean;
  c record;
  table_name text;
  privilege_name text;
BEGIN
  -- #1 Review relation and id primary key.
  IF review_rel IS NULL THEN
    failures := array_append(failures, '#1 missing public.bridge_title_duplicate_reviews');
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint pk
    WHERE pk.conrelid=review_rel AND pk.contype='p'
      AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
           FROM unnest(pk.conkey) WITH ORDINALITY u(attnum,ord)
           JOIN pg_attribute a ON a.attrelid=pk.conrelid AND a.attnum=u.attnum)
          = ARRAY['id']::text[]
  ) THEN
    failures := array_append(failures, '#1 review id primary key missing');
  END IF;

  IF to_regclass('public.bridge_title_merge_audits') IS NULL THEN
    failures := array_append(failures, 'missing public.bridge_title_merge_audits');
  END IF;
  IF to_regclass('public.bridge_title_merge_aliases') IS NULL THEN
    failures := array_append(failures, 'missing public.bridge_title_merge_aliases');
  END IF;

  -- #2 Audit.review_id -> review.id, validated and ON DELETE RESTRICT.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL
     AND review_rel IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint fk
      WHERE fk.conrelid='public.bridge_title_merge_audits'::regclass
        AND fk.confrelid=review_rel AND fk.contype='f'
        AND fk.confdeltype='r' AND fk.convalidated
        AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
             FROM unnest(fk.conkey) WITH ORDINALITY u(attnum,ord)
             JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.attnum)
            = ARRAY['review_id']::text[]
        AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
             FROM unnest(fk.confkey) WITH ORDINALITY u(attnum,ord)
             JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=u.attnum)
            = ARRAY['id']::text[]
    ) INTO ok;
    IF NOT ok THEN failures := array_append(failures, '#2 audit.review_id FK to review.id must be validated ON DELETE RESTRICT'); END IF;
  ELSIF to_regclass('public.bridge_title_merge_audits') IS NOT NULL THEN
    failures := array_append(failures, '#2 review target unavailable for audit.review_id FK');
  END IF;
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='bridge_title_merge_audits' AND column_name='review_id'
  ) THEN failures := array_append(failures, '#2 audit.review_id column missing'); END IF;

  -- #3 Separate exact audit -> title RESTRICT FKs.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL
     AND to_regclass('public.bridge_titles') IS NOT NULL THEN
    FOREACH table_name IN ARRAY ARRAY['canonical_title_id','retiring_title_id'] LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint fk
        WHERE fk.conrelid='public.bridge_title_merge_audits'::regclass
          AND fk.confrelid='public.bridge_titles'::regclass
          AND fk.contype='f' AND fk.confdeltype='r' AND fk.convalidated
          AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
               FROM unnest(fk.conkey) WITH ORDINALITY u(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.attnum)
              = ARRAY[table_name]::text[]
          AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
               FROM unnest(fk.confkey) WITH ORDINALITY u(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=u.attnum)
              = ARRAY['id']::text[]
      ) INTO ok;
      IF NOT ok THEN failures := array_append(failures, '#3 audit.' || table_name || ' -> bridge_titles.id RESTRICT FK missing or invalid'); END IF;
    END LOOP;
  END IF;

  -- #4 Three separate exact alias RESTRICT FKs.
  IF to_regclass('public.bridge_title_merge_aliases') IS NOT NULL THEN
    FOR c IN SELECT * FROM (VALUES
      ('retiring_title_id','bridge_titles','id'),
      ('canonical_title_id','bridge_titles','id'),
      ('merge_id','bridge_title_merge_audits','merge_id')
    ) AS x(src_col,target_table,target_col)
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint fk
        WHERE fk.conrelid='public.bridge_title_merge_aliases'::regclass
          AND fk.confrelid=to_regclass('public.' || c.target_table)
          AND fk.contype='f' AND fk.confdeltype='r' AND fk.convalidated
          AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
               FROM unnest(fk.conkey) WITH ORDINALITY u(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.attnum)
              = ARRAY[c.src_col]::text[]
          AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
               FROM unnest(fk.confkey) WITH ORDINALITY u(attnum,ord)
               JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=u.attnum)
              = ARRAY[c.target_col]::text[]
      ) INTO ok;
      IF NOT ok THEN failures := array_append(failures, '#4 alias.' || c.src_col || ' -> ' || c.target_table || '.' || c.target_col || ' RESTRICT FK missing or invalid'); END IF;
    END LOOP;
  END IF;

  -- #5 Composite FK preserves the exact merge/canonical/retiring tuple.
  IF to_regclass('public.bridge_title_merge_aliases') IS NOT NULL
     AND to_regclass('public.bridge_title_merge_audits') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint fk
      WHERE fk.conrelid='public.bridge_title_merge_aliases'::regclass
        AND fk.confrelid='public.bridge_title_merge_audits'::regclass
        AND fk.contype='f' AND fk.confdeltype='r' AND fk.convalidated
        AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
             FROM unnest(fk.conkey) WITH ORDINALITY u(attnum,ord)
             JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=u.attnum)
            = ARRAY['merge_id','canonical_title_id','retiring_title_id']::text[]
        AND (SELECT array_agg(a.attname::text ORDER BY u.ord)
             FROM unnest(fk.confkey) WITH ORDINALITY u(attnum,ord)
             JOIN pg_attribute a ON a.attrelid=fk.confrelid AND a.attnum=u.attnum)
            = ARRAY['merge_id','canonical_title_id','retiring_title_id']::text[]
    ) INTO ok;
    IF NOT ok THEN failures := array_append(failures, '#5 alias merge/title tuple composite FK to matching audit tuple missing or invalid'); END IF;
  END IF;

  -- #6 Validated no-self-merge check.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bridge_title_merge_audits'::regclass
      AND contype='c' AND convalidated
      AND regexp_replace(lower(pg_get_expr(conbin,conrelid)), '[[:space:]()]', '', 'g')
          = 'canonical_title_id<>retiring_title_id'
  ) THEN failures := array_append(failures, '#6 validated audit no-self-merge check missing'); END IF;

  -- #7 MERGED requires completed_at.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bridge_title_merge_audits'::regclass
      AND contype='c' AND convalidated
      AND regexp_replace(lower(pg_get_expr(conbin,conrelid)), '[[:space:]()]', '', 'g')
          = 'decision<>''merged''orcompleted_atisnotnull'
  ) THEN failures := array_append(failures, '#7 validated MERGED -> completed_at check missing'); END IF;

  -- #8 ROLLED_BACK requires non-empty rollback evidence.
  IF to_regclass('public.bridge_title_merge_audits') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bridge_title_merge_audits'::regclass
      AND contype='c' AND convalidated
      AND regexp_replace(lower(pg_get_expr(conbin,conrelid)), '[[:space:]()]', '', 'g')
          = 'decision<>''rolled_back''orrollback_stateisnotnullandrollback_state<>''{}''::jsonb'
  ) THEN failures := array_append(failures, '#8 validated ROLLED_BACK -> non-empty rollback_state check missing'); END IF;

  -- #9 Title pointer and timestamp must be paired.
  IF to_regclass('public.bridge_titles') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.bridge_titles'::regclass
      AND contype='c' AND convalidated
      AND regexp_replace(lower(pg_get_expr(conbin,conrelid)), '[[:space:]()]', '', 'g')
          = 'merged_into_title_idisnullandmerged_atisnullormerged_into_title_idisnotnullandmerged_atisnotnull'
  ) THEN failures := array_append(failures, '#9 validated title merge pointer/timestamp paired-null check missing'); END IF;

  -- Supporting indexes.
  IF to_regclass('public.bridge_title_merge_audits_titles_idx') IS NULL THEN failures := array_append(failures, 'audit lookup index missing'); END IF;
  IF to_regclass('public.bridge_title_merge_aliases_canonical_idx') IS NULL THEN failures := array_append(failures, 'alias canonical index missing'); END IF;
  IF to_regclass('public.bridge_titles_merged_into_idx') IS NULL THEN failures := array_append(failures, 'title merged-into index missing'); END IF;

  -- Server-only surface: RLS, explicit deny policies and no direct browser ACLs.
  FOREACH table_name IN ARRAY ARRAY['bridge_title_merge_audits','bridge_title_merge_aliases'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      SELECT relrowsecurity INTO ok FROM pg_class WHERE oid=to_regclass('public.' || table_name);
      IF NOT coalesce(ok,false) THEN failures := array_append(failures, table_name || ' RLS disabled'); END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename=table_name AND cmd='ALL'
          AND roles @> ARRAY['anon','authenticated']::name[]
          AND qual='false' AND with_check='false'
      ) THEN failures := array_append(failures, table_name || ' explicit anon/authenticated deny policy missing'); END IF;
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege('anon','public.' || table_name,privilege_name)
           OR has_table_privilege('authenticated','public.' || table_name,privilege_name) THEN
          failures := array_append(failures, table_name || ' browser role retains ' || privilege_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF cardinality(failures) > 0 THEN
    RAISE EXCEPTION 'MERGE_GATE_CONTRACT_FAIL: %', array_to_string(failures, ' | ');
  END IF;
  RAISE NOTICE 'MERGE_GATE_CONTRACT_PASS: all nine assertions and supporting security checks passed';
END
$verify$;
