-- RECOVERED APPLIED SQL BODY — STAGING / Testing DB ONLY.
-- Ledger: supabase_migrations.schema_migrations
-- Version: 20261116234234
-- Name: harden_legacy_links_service_role_privileges_20261117
-- Serialized statement bytes: 315
-- Ledger statement serialization SHA-256: 64197182edca4bece2c4d5b2de4ed6e52f514a3c45fd442a189a4b9d05e84fb1
-- READ-ONLY retrieved from project jbymleftneggcgutlcqu on 2026-11-17.
-- Archival evidence only. NOT an active migration. Do not apply to any hosted DB.
-- This is not proof of original source-file/commit provenance.

-- Restrict the legacy-link server role to row operations only.
-- Browser roles and PUBLIC retain no table privileges.
revoke all on table public.streamvista_legacy_links from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.streamvista_legacy_links to service_role;
