-- Positive and semantic negative DML tests for the merge contract.
-- Runs only in the disposable PostgreSQL 17 CI database; all fixtures roll back.
CREATE OR REPLACE FUNCTION pg_temp.assert_rejected(p_sql text, p_state text, p_label text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  rejected boolean := false;
  actual_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'SEMANTIC_NEGATIVE_TEST_FAIL[%]: statement unexpectedly succeeded', p_label;
  END IF;
  IF actual_state <> p_state THEN
    RAISE EXCEPTION 'SEMANTIC_NEGATIVE_TEST_FAIL[%]: expected SQLSTATE %, got %', p_label, p_state, actual_state;
  END IF;
  RAISE NOTICE 'SEMANTIC_NEGATIVE_TEST_PASS[%]', p_label;
END
$fn$;

BEGIN;

INSERT INTO public.bridge_titles (id, slug, name, owner_user_id, owner_account_type)
VALUES
  ('mg-canonical', 'mg-canonical', 'Merge Gate canonical fixture', 'mg-test-owner', 'independent_creator'),
  ('mg-retiring', 'mg-retiring', 'Merge Gate retiring fixture', 'mg-test-owner', 'independent_creator'),
  ('mg-alternate', 'mg-alternate', 'Merge Gate alternate fixture', 'mg-test-owner', 'independent_creator');

INSERT INTO public.bridge_title_duplicate_reviews
  (id, candidate_title_id, canonical_title_id)
VALUES ('mg-review', 'mg-retiring', 'mg-canonical');

INSERT INTO public.bridge_title_merge_audits
  (merge_id, review_id, canonical_title_id, retiring_title_id, decision)
VALUES
  ('00000000-0000-0000-0000-000000000171', 'mg-review', 'mg-canonical', 'mg-retiring', 'PREVIEW_SAFE');

INSERT INTO public.bridge_title_merge_aliases
  (retiring_title_id, canonical_title_id, merge_id)
VALUES
  ('mg-retiring', 'mg-canonical', '00000000-0000-0000-0000-000000000171');

DO $tests$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bridge_title_merge_aliases
    WHERE retiring_title_id='mg-retiring'
      AND canonical_title_id='mg-canonical'
      AND merge_id='00000000-0000-0000-0000-000000000171'
  ) THEN
    RAISE EXCEPTION 'SEMANTIC_POSITIVE_TEST_FAIL: valid review/audit/alias chain was not accepted';
  END IF;
  RAISE NOTICE 'SEMANTIC_POSITIVE_TEST_PASS: valid review/audit/alias chain accepted';

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_audits
      (merge_id, review_id, canonical_title_id, retiring_title_id, decision)
      VALUES ('00000000-0000-0000-0000-000000000172','missing-review','mg-canonical','mg-alternate','PREVIEW_SAFE')$$,
    '23503','audit-review-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_audits
      (merge_id, review_id, canonical_title_id, retiring_title_id, decision)
      VALUES ('00000000-0000-0000-0000-000000000173','mg-review','missing-title','mg-alternate','PREVIEW_SAFE')$$,
    '23503','audit-title-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_aliases
      (retiring_title_id, canonical_title_id, merge_id)
      VALUES ('missing-retiring','mg-canonical','00000000-0000-0000-0000-000000000171')$$,
    '23503','alias-retiring-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_aliases
      (retiring_title_id, canonical_title_id, merge_id)
      VALUES ('mg-alternate','missing-canonical','00000000-0000-0000-0000-000000000171')$$,
    '23503','alias-canonical-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_aliases
      (retiring_title_id, canonical_title_id, merge_id)
      VALUES ('mg-alternate','mg-canonical','00000000-0000-0000-0000-000000000174')$$,
    '23503','alias-audit-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_aliases
      (retiring_title_id, canonical_title_id, merge_id)
      VALUES ('mg-alternate','mg-retiring','00000000-0000-0000-0000-000000000171')$$,
    '23503','alias-audit-pair-composite-fk');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_audits
      (merge_id, review_id, canonical_title_id, retiring_title_id, decision)
      VALUES ('00000000-0000-0000-0000-000000000175','mg-review','mg-canonical','mg-canonical','PREVIEW_SAFE')$$,
    '23514','audit-no-self-merge');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_audits
      (merge_id, review_id, canonical_title_id, retiring_title_id, decision, completed_at)
      VALUES ('00000000-0000-0000-0000-000000000176','mg-review','mg-canonical','mg-alternate','MERGED',NULL)$$,
    '23514','merged-requires-completed-at');

  PERFORM pg_temp.assert_rejected(
    $$INSERT INTO public.bridge_title_merge_audits
      (merge_id, review_id, canonical_title_id, retiring_title_id, decision, rollback_state)
      VALUES ('00000000-0000-0000-0000-000000000177','mg-review','mg-canonical','mg-alternate','ROLLED_BACK','{}'::jsonb)$$,
    '23514','rolled-back-requires-evidence');

  PERFORM pg_temp.assert_rejected(
    $$UPDATE public.bridge_titles
      SET merged_into_title_id='mg-canonical', merged_at=NULL
      WHERE id='mg-alternate'$$,
    '23514','title-pointer-timestamp-pair');

  PERFORM pg_temp.assert_rejected(
    $$DELETE FROM public.bridge_title_duplicate_reviews WHERE id='mg-review'$$,
    '23503','review-delete-restrict');

  PERFORM pg_temp.assert_rejected(
    $$DELETE FROM public.bridge_titles WHERE id='mg-retiring'$$,
    '23503','title-delete-restrict');

  PERFORM pg_temp.assert_rejected(
    $$DELETE FROM public.bridge_title_merge_audits
      WHERE merge_id='00000000-0000-0000-0000-000000000171'$$,
    '23503','audit-delete-restrict');
END
$tests$;

ROLLBACK;
