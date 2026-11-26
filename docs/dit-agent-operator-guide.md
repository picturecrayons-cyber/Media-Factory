# Crayons Bridge Production & DIT — operator guide

## Lifecycle

1. Create a Production Project before the first shoot day.
2. Register each camera-card ingest against that project and the shoot date. The system creates or reuses the project's shooting-day record automatically and moves the project from Pre-production to In-production on its first ingest.
3. Generate a source manifest on the DIT workstation. The scanner reads original files and does not move, rename, overwrite or delete them.
4. Select the original camera-card folder and manifest in Studio → Production & DIT.
5. Bridge uploads originals to OCI Primary, copies each verified object to the separate OCI Recovery Vault, reads both objects back and checks SHA-256 and byte size.
6. Complete operator attestations and sign off the card. Repeat for each card, camera and shoot day.
7. Post-production creates the Finished Film title and its delivery assets.
8. Link the Finished Film output to the Production Project. This creates provenance without treating the camera-card ingest as a finished-film asset and moves the project to Post-production.

## Create a source manifest

```bash
node scripts/dit-manifest.mjs "/path/to/camera-card" --camera A --card A001 --output ./A001-source.json
```

Use camera A, B or C. Keep the camera card and original folder hierarchy intact. The scanner reads files only; it does not copy, move, rename or delete footage. It rejects symlinks and manifests larger than 10,000 files.

## Security and release gates

- Only verified Studio members with an active organization membership and role owner, admin, producer or dit can access DIT operations.
- Production projects, shooting days, ingest sessions, manifests and object evidence are scoped to the active Studio organization.
- Project, shoot-day and DIT evidence tables are server-only: RLS is enabled, browser roles receive no table privileges, and application writes use verified server-side authorization.
- Every project creation, output link, source registration, copy verification and sign-off writes a Bridge audit event.
- Primary and Recovery must be separate OCI buckets. DIT sign-off requires server-side object read-back and SHA-256 evidence for every source file in both buckets.
- DIT sign-off is not Finished Film QC approval, legal/rights clearance, license approval or publication.
- Legacy sessions remain visible. New camera-card registrations no longer require a Finished Film title.
