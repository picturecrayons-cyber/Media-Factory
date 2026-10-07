-- Historical migration retained for migration-history compatibility.
-- IMPORTANT: this file is intentionally non-destructive.
--
-- Duplicate title reconciliation is now review-first and production-safe.
-- Do not delete or repoint title records from a migration. Use the
-- 20261006230000_duplicate_title_reconciliation.sql review schema and the
-- audited server workflow instead.
--
-- Existing production data is intentionally untouched by this migration.

begin;
commit;
