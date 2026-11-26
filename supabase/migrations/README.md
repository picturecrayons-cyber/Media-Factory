# Supabase migrations

This directory contains the 70 exact SQL statements restored from the canonical Crayons Bridge Production migration ledger on 2026-11-16.
Application-owned migrations added after ledger recovery are replayed after these historical migrations and are intentionally excluded from that historical manifest.\nThe matching version list and SHA-256 manifest is at `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`.

Do not run `db push` or `migration repair` as part of source reconciliation. Compare local and remote versions and validate replay on a disposable database first.