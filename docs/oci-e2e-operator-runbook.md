# Bridge release verification and OCI E2E runbook

## Release validation

The repository generates the TanStack route tree during `npm run build`. Run lint first, then build, then typecheck; do not move typecheck ahead of build unless route generation is separated and verified.

```bash
npm ci
npm run lint
npm run build
node scripts/check-vercel-output.mjs
npm run typecheck
npm test
npm run secret-scan
git diff --check
```

The same checks are available as `npm run verify:release`.

## Preview-only database-writing OCI E2E

Do not run this against production or a customer-owned title. Provision a new disposable title and pending asset in a dedicated non-production Preview database. The title slug must start with `internal-oci-storage-e2e-`, its name must start with `INTERNAL TEST ONLY`, and both the title and asset must be less than 24 hours old. The asset must be pending (no `byte_size`) and owned by the title owner.

Configure the required values in the branch-scoped Vercel Preview environment or a secure local environment; never paste private keys or database credentials into chat, source files, PR descriptions, or logs:

- `OCI_TENANCY_OCID`
- `OCI_USER_OCID`
- `OCI_FINGERPRINT`
- `OCI_PRIVATE_KEY`
- `OCI_REGION`
- `OCI_NAMESPACE`
- `OCI_BUCKET_NAME`
- `DATABASE_URL` (dedicated non-production database only)
- `BRIDGE_E2E_ASSET_ID` (fresh pending disposable asset only)
- `BRIDGE_E2E_ENVIRONMENT=preview`

Only after the fixture and cleanup plan are approved, run:

```bash
npm run test:oci-storage-e2e -- --confirm-mutable
```

The script refuses to proceed without the explicit flag, a Preview marker, a non-production PostgreSQL URL, and a fresh internal fixture. If persistence becomes uncertain, inspect the asset row and audit log before deleting any sealed object.

## OCI object round-trip

This test writes unique temporary objects to the configured OCI bucket. Use it only after the storage owner explicitly approves a real write and confirms the bucket/compartment is appropriate:

```bash
npm run test:oci-production-e2e -- --confirm-oci-write
```

The test reports failed cleanup rather than silently swallowing deletion errors. A successful object round-trip does not certify database persistence, title rights, payments, entitlements, or playback.

## Preview and Production isolation

- Configure the audit branch using Vercel's Preview target and branch-specific environment-variable scope.
- Use a dedicated non-production database and OCI test bucket/compartment for Preview.
- Never copy Production secrets into Preview and never set placeholder or empty secret values.
- Inspect the Vercel deployment's commit SHA and check status after each push.
- Keep the Production Stability Lock active. Do not merge or promote until CI, exact-head Preview, OCI upload/verify/seal/read-back, database persistence/audit, and relevant business E2E gates are certified.
