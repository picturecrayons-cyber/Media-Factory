# Testing migration SQL archive search — 2026-11-21

## Scope and safety

- Repository searched: `picturecrayons-cyber/Media-Factory`
- Branch inspected: `audit/testing-migration-reconciliation-20261121`
- STAGING / Testing DB `jbymleftneggcgutlcqu`: READ-ONLY; no SQL executed for this search.
- PRODUCTION DB `mlmgugivsyoxzdgwkbpu`: HOLD; no access or writes.
- Repository access: READ-ONLY search/fetch, followed by this documentation-only commit.
- Risk: no application, migration, schema, data, or deployment changes.

## Findings

**Testing migration SQL archive / trusted hash manifest: NOT FOUND in the inspected repository.**

Searches covered:
- migration hash manifest references;
- Testing migration archive references;
- exact Testing-only identifiers including
  `test_only_bridge_core_baseline_20261028` and
  `20261106_story_concept_buyer_mandates`;
- Testing schema migration manifest references.

No repository search result exposed SQL bodies or per-version hashes for the 70
Testing ledger records.

A separate file exists:
`docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`.
It is explicitly the **Production** migration-source reconciliation. It records
73 Production-ledger SQL statements with byte counts and SHA-256 values. It is
useful as a trusted source manifest for those Production migrations, but it is
not the SQL archive/hash manifest for the 70 independently versioned Testing
ledger records and cannot be substituted for that evidence.

The repository also contains:
- `supabase/migrations/README.md`, identifying the active migration directory
  as restored Production-ledger SQL;
- `supabase/migrations_archive_unreconciled_20261116/README.md`, describing
  17 archived pre-reconciliation files, not the 70 Testing SQL bodies.

## Disposition

- Production-source manifest (73 rows): **FOUND**.
- Testing migration SQL archive (70 rows): **NOT FOUND**.
- Testing per-version trusted SHA-256 manifest (70 rows): **NOT FOUND**.
- Semantic mapping of Testing ledger to source migrations: **BLOCKED / NOT VERIFIED**.
- Name-based candidates remain non-authoritative and must not be used to repair
  the ledger.

## Required input

Obtain from an authorized source the exact SQL bodies or a trusted export
manifest for all 70 Testing migration versions. Preserve duplicate names as
separate versioned records. A valid export should include at minimum:
version, name, SQL byte length, SHA-256 of exact SQL bytes, and the SQL body or
a retrievable immutable archive reference.

Once received, compare each Testing SQL body against the 75 source files and
classify exact, semantically equivalent, divergent, Testing-only, or unresolved.
Then review DDL, policies, grants, function definitions, SECURITY DEFINER,
search_path and EXECUTE privileges for each proposed mapping.

## Release boundary

| Target | Action | Access | Risk / disposition |
|---|---|---|---|
| STAGING / Testing `jbymleftneggcgutlcqu` | Wait for authorized SQL export; continue catalog inspection only | READ-ONLY | No hosted writes |
| Disposable CI | Build comparison/replay fixtures after export | Isolated WRITE | No hosted DB impact |
| PRODUCTION `mlmgugivsyoxzdgwkbpu` | HOLD | No WRITE | NOT CERTIFIED / NO-GO |
| Merge / promotion | Not authorized | No action | Separate approval required |


## Correction — Testing DB-resident SQL bodies discovered (2026-11-21)

The repository search above correctly found no standalone Testing SQL archive or Testing hash manifest in the inspected repository. However, the subsequent READ-ONLY inspection of the **STAGING / Testing DB** found the exact SQL bodies inside `supabase_migrations.schema_migrations.statements`. Therefore the earlier conclusion that SQL-body evidence was unavailable is superseded.

- STAGING / Testing DB: `jbymleftneggcgutlcqu`.
- Action: READ-ONLY query of migration ledger statements and SHA-256 calculation; no hosted writes.
- 70/70 ledger rows contain exactly one stored SQL statement; 0 rows lack SQL; total stored SQL = 200,815 bytes.
- Exact migration version overlap against 75 current source SQL files: 0.
- Exact byte/hash matches against 73 canonical Production source SQL statements: 7.
- Exact matches against the two active feature-candidate SQL files: 0.
- Remaining 63 Testing SQL statements do not exactly hash-match the current 75 source files. This is **not** proof of semantic incompatibility or absence; each requires DDL/policy/grant/function/trigger/dependency/order review.
- Full 70-row version/name/byte-count/SHA-256 inventory and the seven exact source mappings are recorded in [testing-db-migration-sql-hash-inventory-2026-11-21.md](testing-db-migration-sql-hash-inventory-2026-11-21.md).

Status: Testing SQL-body evidence **FOUND**; exact mapping **7 PASS / 63 NOT VERIFIED**; hosted Testing parity **NOT CERTIFIED**. PRODUCTION remains HOLD / NOT CERTIFIED / NO-GO.
