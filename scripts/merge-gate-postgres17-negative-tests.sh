#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_URL:?POSTGRES_URL must target the disposable PostgreSQL 17 CI database}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
BASE_DB_NAME="${POSTGRES_URL##*/}"

run_psql() { psql -d "$1" -X -v ON_ERROR_STOP=1 -Atqc "$2"; }
expect_failure() {
  local case_name="$1" ddl="$2" expected="$3"
  local db="merge_gate_negative_$case_name"
  createdb --maintenance-db=postgres --template="$BASE_DB_NAME" "$db"
  run_psql "$db" "$ddl"
  set +e
  local output
  output="$(psql -d "$db" -X -v ON_ERROR_STOP=1 -f scripts/merge-gate-postgres17-assertions.sql 2>&1)"
  local status=$?
  set -e
  dropdb --maintenance-db=postgres "$db"
  if [[ $status -eq 0 ]] || ! grep -Fq "$expected" <<<"$output"; then
    echo "NEGATIVE_TEST_FAIL[$case_name]: expected assertion failure '$expected'; status=$status"
    echo "$output"
    exit 1
  fi
  echo "NEGATIVE_TEST_PASS[$case_name]"
}

# Every test mutates only a disposable clone of the already-migrated CI database.
expect_failure review_object "DROP TABLE public.bridge_title_duplicate_reviews CASCADE;" "#1"
expect_failure review_fk "ALTER TABLE public.bridge_title_merge_audits DROP CONSTRAINT bridge_title_merge_audits_review_fk;" "#2"
expect_failure audit_title_fk "ALTER TABLE public.bridge_title_merge_audits DROP CONSTRAINT bridge_title_merge_audits_canonical_fk;" "#3"
expect_failure alias_fk "ALTER TABLE public.bridge_title_merge_aliases DROP CONSTRAINT bridge_title_merge_aliases_retiring_fk;" "#4"
expect_failure alias_audit_pair "ALTER TABLE public.bridge_title_merge_aliases DROP CONSTRAINT bridge_title_merge_aliases_audit_pair_fk;" "#5"
expect_failure no_self_merge "ALTER TABLE public.bridge_title_merge_audits DROP CONSTRAINT bridge_title_merge_audits_no_self_merge;" "#6"
expect_failure merged_completed "ALTER TABLE public.bridge_title_merge_audits DROP CONSTRAINT bridge_title_merge_audits_merged_requires_completed;" "#7"
expect_failure rollback_evidence "ALTER TABLE public.bridge_title_merge_audits DROP CONSTRAINT bridge_title_merge_audits_rolled_back_requires_evidence;" "#8"
expect_failure pointer_pair "ALTER TABLE public.bridge_titles DROP CONSTRAINT bridge_titles_merge_pointer_paired;" "#9"

echo "MERGE_GATE_NEGATIVE_TESTS_PASS: 9/9"
