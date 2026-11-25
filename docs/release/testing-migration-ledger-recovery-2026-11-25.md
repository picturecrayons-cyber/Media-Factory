# Testing migration ledger recovery — 2026-11-25

## Scope and safety

This is a read-only recovery of the applied SQL recorded by the Crayons Testing Supabase project `jbymleftneggcgutlcqu`. No hosted database DDL/DML, migration repair, migration apply, `db push`, reset, branch rebase, or Production action was performed.

## Current ledger snapshot

| Environment | Project | Recorded migrations | Latest version |
|---|---|---:|---|
| Testing | `jbymleftneggcgutlcqu` | 98 | `20261125005506` |
| Production | `mlmgugivsyoxzdgwkbpu` | 78 | `20261124222927` |

- Exact migration-version overlap: **0**.
- Testing project status: `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Testing default branch status: `MIGRATIONS_FAILED`.
- The Testing ledger contains test-only and staging-specific entries. The Production migration directory/manifest is not a valid expected-version list for Testing.

## Recovered SQL evidence

The Testing database's `supabase_migrations.schema_migrations` table exposes `version`, `name`, `statements`, `created_by`, `idempotency_key`, and `rollback`. All 98 recorded rows were read without changing the database. The stored `statements` arrays were archived in 10 JSON evidence files:

- `supabase/staging-recovery/ledger-statements-2026-11-25-part-01.json` — records 1–10
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-02.json` — records 11–20
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-03.json` — records 21–30
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-04.json` — records 31–40
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-05.json` — records 41–50
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-06.json` — records 51–60
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-07.json` — records 61–70
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-08.json` — records 71–80
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-09.json` — records 81–90
- `supabase/staging-recovery/ledger-statements-2026-11-25-part-10.json` — records 91–98

Verification of the committed archive files confirmed **98 records, 98 unique version identifiers, and no duplicate version identifiers**. Each record stores the statement array and a SHA-256 fingerprint of the reconstructed statement sequence (statements joined with `\n;\n`). Each current ledger row reports one stored statement.

## Provenance distinction

This archive is the SQL statement content recorded by the Testing database at execution time. It is not the original migration file byte-for-byte and does not itself prove the original Git path, commit, author, or intended release sequence. SHA-256 values here are fingerprints of the reconstructed stored statement sequence, not original repository-file hashes.

The earlier PR #683 audit recorded 10 exact original-source matches and one normalized match among its 61-entry snapshot, with 48 original source-file/commit mappings still unverified. The additional 37 Testing entries now have their applied SQL recovered here; their original Git provenance has not yet been established. Do not label these source mappings as resolved until a repository-wide content and history comparison confirms them.

## Next gates

1. Compare each recovered statement body against candidate historical files and Git commits; record exact, normalized, ambiguous, and unrecoverable mappings separately.
2. Produce and pin the intended Testing schema contract independently of the Production manifest.
3. Compare the current Testing catalog (relations, columns, constraints, indexes, views, functions, triggers, policies, grants, default ACLs, and Storage policies) to that contract.
4. Replay the 98 recovered statements in order in a disposable PostgreSQL 17 environment. Validate statement boundaries and replay failures without connecting to either hosted project.
5. Only after replay and catalog comparison pass, prepare a separate Testing/Preview remediation plan. No hosted repair or push is authorized by this evidence archive.

## Release boundary

PR #835 remains a separate asset-verification change. Its successful GitHub/Vercel checks do not replace the skipped Supabase Preview check or the required OCI object verification. Production film release remains HOLD pending independently verified assets, QC, rights/legal approval, protected playback, and LOOP publication gates.

## Exact body comparison against the canonical Production manifest

A read-only SHA-256 comparison of the 98 recovered Testing statement sequences against the 69-entry canonical Production source manifest found **7 exact SQL-body matches**. Their Testing ledger versions/names differ from the corresponding Production version/name:

| Testing version | Testing ledger name | Matching Production version | Production migration name |
|---|---|---|---|
| 20261028180900 | test_only_bridge_commercial_engine_20261006230000 | 20261006185556 | bridge_commercial_engine_20261006230000 |
| 20261028180912 | test_only_harden_commercial_server_only_20261028 | 20261006185640 | harden_bridge_commercial_server_only_20261007000000 |
| 20261028180915 | test_only_commercial_control_plane_20261028 | 20261006195531 | bridge_commercial_control_plane_20261007013000 |
| 20261028180918 | test_only_financial_reversal_hardening_20261028 | 20261006195536 | bridge_financial_reversal_hardening_20261007020000 |
| 20261114075718 | bridge_dit_ingest_testing_20261114 | 20261114074642 | bridge_dit_ingest_20261114 |
| 20261114093221 | bridge_site_content_cms_20261114 | 20261114093357 | bridge_site_content_cms_20261114 |
| 20261124225934 | reconcile_duplicate_title_merge_gate_20261008 | 20261008113911 | reconcile_duplicate_title_merge_gate_20261008 |

These are exact statement-sequence matches against the Production manifest, not matching migration versions. They confirm reuse of those seven SQL bodies; they do not establish that the entire Testing schema is equivalent to Production or that the remaining Testing entries should be discarded. The prior PR #683 source-provenance audit's 10 exact + 1 normalized source matches remain a separate historical finding and are not arithmetically combined with this comparison.
