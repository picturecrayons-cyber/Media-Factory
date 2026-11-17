-- Forward-only identity-link FK parity.
-- Production currently references public."user"(id); Testing already references
-- public.bridge_profiles(user_id). Preserve all identity rows and legacy auth
-- tables. This migration changes only the FK target and fails closed if the
-- live schema or profile mapping differs from the reviewed preconditions.

DO $identity_fk_parity$
DECLARE
  v_link_table oid := to_regclass('public.bridge_loop_identity_links');
  v_profile_table oid := to_regclass('public.bridge_profiles');
  v_legacy_table oid := to_regclass('public.user');
  v_bridge_user_attnum smallint;
  v_fk_count integer;
  v_fk_name text;
  v_fk_target oid;
  v_orphan_count bigint;
BEGIN
  IF v_link_table IS NULL OR v_profile_table IS NULL THEN
    RAISE EXCEPTION 'Identity FK parity precondition failed: required Bridge identity tables are missing';
  END IF;

  SELECT attnum INTO v_bridge_user_attnum
  FROM pg_attribute
  WHERE attrelid = v_link_table
    AND attname = 'bridge_user_id'
    AND attnum > 0
    AND NOT attisdropped;

  IF v_bridge_user_attnum IS NULL THEN
    RAISE EXCEPTION 'Identity FK parity precondition failed: bridge_user_id column is missing';
  END IF;

  SELECT count(*)::integer INTO v_fk_count
  FROM pg_constraint
  WHERE conrelid = v_link_table
    AND contype = 'f'
    AND conkey = ARRAY[v_bridge_user_attnum]::smallint[];

  IF v_fk_count <> 1 THEN
    RAISE EXCEPTION 'Identity FK parity precondition failed: expected exactly one bridge_user_id foreign key, found %', v_fk_count;
  END IF;

  SELECT conname, confrelid
  INTO v_fk_name, v_fk_target
  FROM pg_constraint
  WHERE conrelid = v_link_table
    AND contype = 'f'
    AND conkey = ARRAY[v_bridge_user_attnum]::smallint[];

  IF v_fk_target = v_profile_table THEN
    SELECT count(*) INTO v_orphan_count
    FROM public.bridge_loop_identity_links l
    LEFT JOIN public.bridge_profiles p ON p.user_id = l.bridge_user_id
    WHERE p.user_id IS NULL;

    IF v_orphan_count <> 0 THEN
      RAISE EXCEPTION 'Identity FK parity validation failed: % identity links have no Bridge profile', v_orphan_count;
    END IF;

    RAISE NOTICE 'Identity FK already targets bridge_profiles(user_id); no change required';
    RETURN;
  END IF;

  IF v_legacy_table IS NULL OR v_fk_target <> v_legacy_table THEN
    RAISE EXCEPTION 'Identity FK parity precondition failed: bridge_user_id references an unexpected relation';
  END IF;

  SELECT count(*) INTO v_orphan_count
  FROM public.bridge_loop_identity_links l
  LEFT JOIN public.bridge_profiles p ON p.user_id = l.bridge_user_id
  WHERE p.user_id IS NULL;

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Identity FK parity blocked: % existing identity links have no Bridge profile; no rows were changed', v_orphan_count;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.bridge_loop_identity_links DROP CONSTRAINT %I',
    v_fk_name
  );

  ALTER TABLE public.bridge_loop_identity_links
    ADD CONSTRAINT bridge_loop_identity_links_bridge_user_id_fkey
    FOREIGN KEY (bridge_user_id)
    REFERENCES public.bridge_profiles(user_id)
    ON DELETE RESTRICT;

  RAISE NOTICE 'Identity FK now references bridge_profiles(user_id); identity rows and legacy auth tables were preserved';
END
$identity_fk_parity$;
