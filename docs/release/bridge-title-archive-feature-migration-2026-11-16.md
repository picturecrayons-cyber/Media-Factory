# Bridge Draft Archive feature migration — 16 November 2026

This migration is **post-ledger feature work**. It is not part of the recovered 69-migration Production baseline and must not be written into the immutable reconciliation manifest.

| Field | Value |
|---|---|
| Migration | `20261116150000_bridge_title_archive_restore.sql` |
| SQL bytes | 1117 |
| SHA-256 | `3669b65c17642c2867c6efb7f8505943e8397756890fb6748bb6eb6ced9449bc` |
| Scope | Add nullable archive metadata and owner indexes on `public.bridge_titles` |
| Destructive operations | None |
| Storage / OCI changes | None |

The migration is idempotent and adds `archived_at`, `archived_by`, and `archive_reason`, a consistency check, and two owner/time indexes. It does not delete or rewrite any title, asset, submission, rights, QC, legal, financial, delivery or Loop record.

The exact migration file is separately validated by `scripts/supabase-migration-replay.mjs` after the 69 checksummed baseline migrations are replayed in a disposable local Supabase stack.
