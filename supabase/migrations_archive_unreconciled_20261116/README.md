# Archived pre-reconciliation migration files

These 17 files are copied byte-for-byte from `main` as of 2026-11-16.
They were moved out of the active `supabase/migrations/` directory because their filenames or SQL bodies did not represent the exact 69 recorded Production migrations.

Do not run them manually or restore them to the active migration directory without reviewing `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`.

Ten SQL bodies matched a Production ledger migration under a different timestamped name. Seven did not match any Production ledger statement and require separate review.

No Production database change was made.