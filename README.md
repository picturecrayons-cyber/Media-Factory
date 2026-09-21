# Crayons Bridge

Title record, rights, and licensing OS. Legal owner: **StreamVista OPC Pvt Ltd**.

Production domain: `bridge.crayonspictures.com` · Vercel project `bridge` · GitHub `picturecrayons-cyber/Media-Factory`.

This branch (`feat/crayons-bridge-production`) rebuilds Bridge on TanStack Start. It is **not** CRAYONS LOOP. Loop cinema routes, PIN gates, and fake payments are removed here.

## Canonical pins

| Thing | Value |
|---|---|
| Supabase | `uakpqqardziifcwzvgfx` |
| Mail from | `abijithasokan@crayonspictures.com` |
| Vercel | project `bridge`, **preview only** on this branch |

Any other Supabase project is rejected in `src/lib/bridge/canonical.ts`.

## Stack

- TanStack Start + React 19
- Better Auth (email/password + Google / X) — no mock / `dev-user` Bridge ops
- Postgres via `getSql()` (PGLite in preview, `DATABASE_URL` when set)
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

Do not merge `main` or promote production from this branch without owner approval.

## License

Proprietary — StreamVista OPC Pvt Ltd / Crayons Pictures. All rights reserved.
