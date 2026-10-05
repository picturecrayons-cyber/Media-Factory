# Crayons Bridge

Title record, rights, and licensing OS. Legal owner: **StreamVista OPC Pvt Ltd**.

Production domain: `www.crayonspictures.in` · Vercel project `bridge` · GitHub `picturecrayons-cyber/Media-Factory`.

Crayons Bridge is the B2B control plane for title records, rights, licensing, delivery authorization, and operational workflows. CRAYONS LOOP remains the consumer streaming frontend.

## Canonical pins

| Thing | Value |
|---|---|
| Supabase | `mlmgugivsyoxzdgwkbpu` |
| Media storage | Oracle OCI Object Storage · Mumbai |
| Mail from | `abijithokan@crayonspictures.com` |
| Vercel | project `bridge` · production from `main` |

Any non-canonical Supabase project is rejected in `src/lib/bridge/canonical.ts`.

## Stack

- TanStack Start + React 19
- Supabase Auth for production email/password authentication
- Postgres via `getSql()`
- **Oracle OCI Object Storage (Mumbai)** for Bridge media; signed upload/download and verification fail closed
- Razorpay order + signature verification + idempotent webhook; entitlement only after capture
- Hostinger SMTP for transactional mail; fail closed

AWS S3 code is **legacy compatibility/test code only**. It is not the Bridge production media backend and must not be used as production readiness evidence.

## Release rule

Production releases are cut from `main` only after exact-head CI, Vercel deployment, Supabase migrations, OCI media E2E, Razorpay webhook/entitlement E2E, and mail E2E evidence are verified.

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
node scripts/secret-scan.mjs
node scripts/release-readiness.mjs
```

Legacy import is dry-run only. See `docs/legacy-mapping.md`.

## License

Proprietary — StreamVista OPC Pvt Ltd / Crayons Pictures. All rights reserved.
