# Studio schema candidates — not executable migrations

These SQL files are retained for review only. They must not be copied into `migrations/` or `supabase/migrations/`, and must not be applied to Testing or Production.

Read-only inspection of the isolated Testing project `jbymleftneggcgutlcqu` on 2026-11-20 found that the Studio schedule, invitation and ownership-transfer tables already exist. Its migration ledger already records:

- `20261118000214` — `bridge_production_schedule_20261118`
- `20261118001111` — `bridge_studio_invites_and_owner_transfer_20261118`

The live table columns, key constraints, RLS enabled/forced flags and lack of direct `anon`/`authenticated` table grants were inspected. No schema writes were performed.

Before any future migration change, recover and compare the exact canonical migration SQL and checksums for those ledger versions. Do not reapply the candidate SQL based only on these copies.
