# Crayons Bridge

Title record, rights, and licensing OS. Legal owner: **StreamVista OPC Pvt Ltd**.

Production domain: `bridge.crayonspictures.com` · Vercel project `bridge` · GitHub `picturecrayons-cyber/Media-Factory`.

Crayons Bridge is the B2B control plane for title records, rights, licensing, delivery authorization, and operational workflows. CRAYONS LOOP remains the consumer streaming frontend.

## Canonical pins

| Thing | Value |
|---|---|
| Supabase | `mlmgugivsyoxzdgwkbpu` |
| Mail from | `abijithasokan@crayonspictures.com` |
| Vercel | project `bridge` · production from `main` |

Any non-canonical Supabase project is rejected in `src/lib/bridge/canonical.ts`.

## Stack

- TanStack Start + React 19
- Supabase Auth for production email/password authentication
- Postgres via `getSql()`
- Private AWS S3 signed URLs (fail closed)
- Razorpay order + signature verify + idempotent webhook (entitlement **only** after capture)
- Hostinger SMTP (fail closed)

## Desks

| Path | Who |
|---|---|
| `/` | Public landing |
| `/login` `/signup` `/forgot-password` `/reset-password` `/verify-email` | Auth |
| `/onboarding` | Account type: independent creator / studio / buyer |
| `/creator` `/studio` | Title create + upload |
| `/buyer` | Live catalog + license checkout |
| `/internal` | Invite-only QC / legal / finance / admin |
| `/title/$id` | One title record |

Lifecycle: `DRAFT → UPLOADING → PREPARING → QC_REVIEW → RIGHTS_REVIEW → LICENSING_READY → LIVE_FOR_BUYERS → IN_NEGOTIATION → LICENSED → DELIVERED`.

`LICENSED` is not a manual advance. It is granted after a captured Razorpay payment.

## Scripts

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
node scripts/secret-scan.mjs
node --experimental-strip-types scripts/legacy-migrate.mjs --file /private/titles.json
```

Legacy import is dry-run only. See [docs/legacy-mapping.md](docs/legacy-mapping.md).

Production releases are cut from `main` only after preview/build verification.

## License

Proprietary — StreamVista OPC Pvt Ltd / Crayons Pictures. All rights reserved.
