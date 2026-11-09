-- Safe rollback for 20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql.
-- Run manually as the migration owner (or an authorized DB administrator).
-- STAGING-only recovery procedure; never target PRODUCTION without separate approval.
--
-- Deliberately does NOT drop merge-gate tables, columns, or indexes. Those
-- objects are owned by 0020_duplicate_title_merge_gate.sql and may contain data.
-- Restores only the direct anon/authenticated ACL entries captured by the UP
-- migration, and drops only deny policies that the UP migration itself created.
-- If the recovery journal is missing or the policy has drifted, this aborts.

begin;

do $rollback$
declare
  target record;
  policy_row record;
  acl_row record;
  grantee_name text;
  policy_count integer;
  matching_policy_count integer;
  recovery_rows integer;
  deleted_migration_rows integer;
begin
  if to_regclass('public._bridge_title_merge_recovery') is null then
    raise exception 'Recovery journal missing; refusing destructive or guessed rollback';
  end if;

  select count(*) into recovery_rows
  from public._bridge_title_merge_recovery
  where migration_name = '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql'
    and entry_type = 'POLICY';

  if recovery_rows <> 2 then
    raise exception 'Expected exactly 2 policy recovery records, found %', recovery_rows;
  end if;

  -- Remove only policies created by this migration. Preserve pre-existing
  -- matching policies. If a created policy has drifted, stop for manual review.
  for policy_row in
    select target_table, policy_name, policy_created
    from public._bridge_title_merge_recovery
    where migration_name = '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql'
      and entry_type = 'POLICY'
  loop
    if policy_row.policy_created then
      select count(*) into policy_count
      from pg_policies
      where schemaname = 'public'
        and tablename = policy_row.target_table
        and policyname = policy_row.policy_name;

      select count(*) into matching_policy_count
      from pg_policies
      where schemaname = 'public'
        and tablename = policy_row.target_table
        and policyname = policy_row.policy_name
        and cmd = 'ALL'
        and cardinality(roles) = 2
        and roles @> array['anon', 'authenticated']::name[]
        and qual = 'false'
        and with_check = 'false';

      if policy_count <> 1 or matching_policy_count <> 1 then
        raise exception 'Policy %.% changed since migration; refusing to drop it',
          policy_row.target_table, policy_row.policy_name;
      end if;

      execute format('drop policy %I on public.%I',
        policy_row.policy_name, policy_row.target_table);
    end if;
  end loop;

  -- Clear only direct grants for the two browser roles, then restore their
  -- exact pre-UP privilege set and grant-option flags from the journal.
  for target in
    select unnest(array['bridge_title_merge_audits', 'bridge_title_merge_aliases']) as table_name
  loop
    if to_regclass(format('public.%I', target.table_name)) is null then
      raise exception 'Expected pre-existing table public.% is missing; refusing rollback',
        target.table_name;
    end if;

    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      target.table_name
    );

    for acl_row in
      select grantee_oid, privilege_type, is_grantable
      from public._bridge_title_merge_recovery
      where migration_name = '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql'
        and entry_type = 'ACL'
        and target_table = target.table_name
    loop
      select rolname into grantee_name
      from pg_roles
      where oid = acl_row.grantee_oid;

      if grantee_name is null then
        raise exception 'Original ACL grantee OID % no longer exists; refusing partial restoration',
          acl_row.grantee_oid;
      end if;

      execute format(
        'grant %s on table public.%I to %I%s',
        acl_row.privilege_type,
        target.table_name,
        grantee_name,
        case when acl_row.is_grantable then ' with grant option' else '' end
      );
    end loop;
  end loop;

  -- Keep RLS enabled: it was already enabled by 0020_duplicate_title_merge_gate.sql.
  -- Keep all merge tables/columns/indexes and any business data intact.
  drop table public._bridge_title_merge_recovery;

  -- Remove the exact migration ledger row so a deliberate re-apply can run.
  delete from public._migrations
  where name = '20261008113000_reconcile_duplicate_title_merge_gate_20261008.sql';
  get diagnostics deleted_migration_rows = row_count;
  if deleted_migration_rows <> 1 then
    raise exception 'Expected to remove exactly one migration ledger row, removed %',
      deleted_migration_rows;
  end if;
end
$rollback$;

commit;
