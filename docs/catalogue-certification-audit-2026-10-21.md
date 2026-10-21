# Crayons Bridge catalogue certification audit — 2026-10-21

## Decision

**NOT CERTIFIED — publication hold remains in place.**

This audit is based on read-only metadata queries against the primary Crayons Bridge Supabase project and the staging project. No database rows, title statuses, assets, rights records, or publication states were changed.

## Confirmed database findings

- The primary project contains title records whose metadata is insufficient to establish identity (missing original title, year, runtime, or language).
- `Koodal` (`legacy-film-7`) is marked `LIVE_FOR_BUYERS`, but its `original_title` is `Jananam 1947 Pranayam Thudarunnu`. That is a material identity conflict requiring an operator decision. **Do not rename, merge, or delete either record automatically.**
- `Jananam 1947 Pranayam Thudarunnu` (`cb8c141dc72d727a53a4f35d8851e100`) is `PREPARING`, has a poster key, no canonical master key, zero QC cases, and zero valid/active rights grants in the inspected metadata.
- `Pazhuth` (`e9ff96cacd87a98f38e07e62e44fb7b6`) and `Sevagramam` (`28ef44b9694d6771c7d5b23bb87a6735`) are `UPLOADING`, without canonical poster or master keys, and have zero QC cases and zero valid/active rights grants.
- `INTERNAL TEST ONLY — OCI Storage E2E` (`bridge-oci-e2e-7be3ab166df28709`) is in `UPLOADING`. It has an asset row but no poster/master key, no QC case, and no valid/active rights grant. Keep it excluded from buyer-facing catalogue and release certification.
- `Swapna Sundari` (`2a650c8ba052151feaa0dc262e3b9b94`) is `PREPARING`; the canonical master key is set, but no poster key or QC case is present. Four rights-grant rows exist, but their validity/evidence still needs review.
- The staging project query returned one `bridge_titles` row, `Jananam 1947 Pranayam Thudarunnu`; it did not contain the full catalogue visible in the supplied screenshots. This limits staging parity verification.

## Implementation in this change

Added `scripts/catalogue-audit.mjs`, a read-only metadata gate audit that:
- scans title metadata and canonical asset keys;
- counts associated asset rows, QC cases, and valid/active rights grants;
- flags missing metadata, missing master assets in active release states, active states without QC/rights evidence, explicitly named test titles, merged records, and original-title collisions;
- emits JSON findings and exits non-zero when blockers are found;
- performs no INSERT, UPDATE, DELETE, DDL, upload, merge, or publish operation.

Run with a trusted, read-only database connection:

```bash
DATABASE_URL='<read-only connection string>' node scripts/catalogue-audit.mjs
```

Do not commit connection strings or secrets. The script's query uses a read-only transaction; use a database role with SELECT-only access as an additional safeguard.

## Certification boundary

This is a metadata-level audit, **not** proof that every listed film exists, that stored media bytes match the named film, or that Crayons Pictures has a valid chain of title and TVOD rights. External identity references must be reconciled per canonical Bridge ID. Asset checksums and playable masters, QC results, signed rights/licence evidence, territory/window coverage, and publication-gate tests must pass before any title is certified.

No automatic merge/deletion is authorized by this report. In particular, the `Koodal` / `Jananam` identity conflict must be resolved with production-owner evidence before any corrective write.
