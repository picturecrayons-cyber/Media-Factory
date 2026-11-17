# Supabase migrations

This directory contains 69 exact SQL statements restored from the canonical Crayons Bridge Production migration ledger on 2026-11-16, plus a proposed forward-only identity FK parity migration dated 2026-11-18. The proposed migration is not recorded as applied in Production.
The matching version list and SHA-256 manifest is at `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`.

Do not run `db push` or `migration repair` as part of source reconciliation. Compare local and remote versions and validate replay on a disposable database first.