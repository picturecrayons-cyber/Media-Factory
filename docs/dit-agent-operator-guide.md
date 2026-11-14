# Crayons Bridge DIT Agent — operator guide

## Purpose
The Studio DIT Agent desk records a camera-card manifest and verifies that the Primary Vault and Recovery Vault copies contain the same relative paths, byte sizes and SHA-256 checksums before sign-off.

## Create a source manifest
On the DIT workstation, run:

```bash
node scripts/dit-manifest.mjs "/path/to/camera-card" --camera A --card A001 --output ./A001-source.json
```

Use camera A, B or C. Keep the camera card and original folder hierarchy intact. The scanner reads files only; it does not copy, move, rename or delete footage. It rejects symlinks and manifests larger than 10,000 files.

## Register the ingest session
In Studio → DIT Agent, select the finished film, camera unit, camera/card labels, shoot date, source volume and source path. Upload the generated JSON manifest and register it.

## Verify copies
After the separately approved storage copy has completed, scan the Primary Vault copy and upload its manifest. Repeat for the Recovery Vault copy. The server independently normalizes and hashes each manifest. A copy is marked verified only when the manifest digest, file count and total bytes match the source.

## Sign-off
Confirm that folder structure and original filenames are preserved and that the original camera card is retained. Enter an operator note. Sign-off remains blocked until both copies match.

## Security and production boundaries
- Only verified members with an active Studio organization membership and role owner, admin, producer or dit can access DIT operations.
- The title must be a finished-film record owned by the active Studio organization. Story & Concept records are excluded.
- DIT sessions, file manifests and copy evidence are server-only tables with RLS enabled and browser Data API privileges revoked.
- Every source registration, copy verification and sign-off writes a Bridge audit event.
- This MVP records ingest evidence; it does not execute storage transfers or claim an OCI upload succeeded. Continue to use the approved storage-transfer workflow and independently scan both destination copies.
