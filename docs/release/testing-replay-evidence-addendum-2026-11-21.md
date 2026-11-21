# Testing migration audit — replay evidence addendum (2026-11-21)

## Purpose

This addendum supersedes the stale CI/replay status in
`testing-source-migration-inventory-2026-11-21.md`. It does not alter the
migration inventory, claim SQL parity, or authorize hosted database changes.

## Scope and access

- Repository: `picturecrayons-cyber/Media-Factory`
- Branch: `audit/testing-migration-reconciliation-20261121`
- Audited commit: `d6df77ccd6edd7496aa35a328dcd4fc22263b089`
- GitHub Actions run: [44888521470](https://github.com/picturecrayons-cyber/Media-Factory/actions/runs/44888521470)
- STAGING / Testing DB `jbymleftneggcgutlcqu`: READ-ONLY; no hosted writes.
- PRODUCTION DB `mlmgugivsyoxzdgwkbpu`: HOLD; no access or writes.
- Risk: isolated CI replay only; no hosted schema/data mutation.

## Latest CI result

**PASS — all three jobs in run 44888521470 completed successfully.**

1. **Gate job — PASS**
   - checkout and Node setup
   - `npm ci`
   - production build and Vercel output check
   - typecheck and ESLint
   - unit tests
   - secret scan
   - legacy dump prohibition check

2. **PostgreSQL workflow tests — PASS**
   - `npm run test:workflow`

3. **Supabase migration replay — PASS**
   - Supabase CLI setup
   - isolated local Supabase stack startup
   - replay of 73 historical Production-ledger migrations
   - replay of the TVOD and Sublicensing feature migration candidates
   - reported Creator Vault / Sublicensing preservation assertions

This is evidence from the isolated CI environment only. It is not evidence that
the hosted Testing project was changed, that its migration ledger is equivalent
to the source chain, or that Production is certified.

## Parit​y status remains unresolved

- Source SQL inventory: 75 files (73 historical Production-ledger files plus
  two feature candidates).
- Hosted Testing migration ledger: 70 records.
- Exact version overlap: 0.
- SQL-equivalent mappings certified: **0**.
- The Supabase migration ledger exposes version/name metadata, not the SQL
  bodies or trusted source hashes needed to prove semantic equivalence.
- Duplicate Testing migration name
  `20261106_story_concept_buyer_mandates` occurs at two distinct versions;
  preserve both records independently.
- Name similarity is not proof of SQL equivalence.

Required evidence remains an approved export of the 70 Testing migration SQL
bodies or a trusted per-version SHA-256 manifest. Until supplied, mapping is
**BLOCKED / NOT VERIFIED**.

## TVOD and preservation disposition

- Isolated feature-migration replay: **PASS**.
- TVOD application checkout/webhook compatibility against the inspected
  Testing schema: **FAIL** (documented incompatibilities remain).
- End-to-end TVOD behavioral coverage against a Testing-catalog fixture:
  **NOT VERIFIED**.
- Creator Vault / Sublicensing preservation assertions in the successful CI
  replay: **PASS for the assertions actually run**; this does not certify all
  effective-role access paths.
- Production Assets / DIT effective-role regression coverage:
  **NOT VERIFIED**.
- Effective runtime RLS/grant authorization: **NOT VERIFIED**; catalog
  inspection alone is insufficient.

No application runtime code or migration SQL was changed as part of this
addendum.

## Next gates

1. Obtain the approved Testing migration SQL archive or trusted hash manifest.
2. Complete the 70-to-75 semantic mapping and per-migration DDL, policy, grant,
   function, SECURITY DEFINER, search_path and EXECUTE review.
3. Run TVOD behavior and effective-role preservation tests in disposable CI
   fixtures; fix source/runtime code only under a separately bounded
   implementation approval.
4. Keep hosted Testing READ-ONLY and Production on HOLD until separate
   authorization and evidence-based release gates are satisfied.

## Release controls

| Target | Action | Access | Risk / disposition |
|---|---|---|---|
| STAGING / Testing `jbymleftneggcgutlcqu` | Inspect only | READ-ONLY | No hosted writes |
| Disposable CI database | Replay and tests | Isolated WRITE | No hosted DB impact |
| PRODUCTION `mlmgugivsyoxzdgwkbpu` | HOLD | No WRITE | NOT CERTIFIED / NO-GO |
| Merge / deployment promotion | Not authorized | No action | Requires separate approval |

**CI PASS is not release certification.** No hosted Testing migration, reset,
rebase, Production operation, merge, deployment promotion, customer email or
live Razorpay action is authorized by this addendum.
