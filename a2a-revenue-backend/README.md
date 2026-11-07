# A2A Revenue Dashboard — Supabase-only backend

## Status
This is a code contribution, not a deployed or production-certified service. The migration has not been applied to any Supabase project, and no live API test has been performed.

## Included
- `server.js`: Express API with Supabase Auth bearer-token validation and an explicit administrator UUID allowlist.
- `supabase/migrations/20261015_a2a_revenue_dashboard.sql`: schema plus idempotent lead seed.
- `.env.example`: placeholders only; no credentials.
- `package.json`: Node.js 20+ runtime and dependencies.

## Before using
1. Confirm which Supabase project is authorized for this A2A dashboard. Do not assume the Crayons Bridge project is the dashboard's canonical production database.
2. Review and apply the migration only to that verified project, preferably in staging first.
3. Create/sign in the operator through Supabase Auth and set that user's UUID in `A2A_ADMIN_USER_IDS`.
4. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY` in the backend host. Never expose the secret key to browser code or commit it.
5. Set `CORS_ORIGINS` to exact frontend origin(s).
6. Run `npm install`, then `npm start` using Node.js 20 or later.
7. Frontend requests must include `Authorization: Bearer <Supabase access token>`.
8. Test health, authenticated lead reads, stage updates, and logs in a non-production environment before any promotion.

## API
- `GET /api/health`: confirms process health only; it does not prove database connectivity.
- `GET /api/leads`: requires a valid Supabase Auth user on the admin allowlist.
- `PATCH /api/leads/:id`: validates editable fields and stage values.
- `GET /api/logs`: fetches the latest execution log records.
- `POST /api/logs`: records an operator note only; does not execute an agent.

## Evidence integrity
- Seed records' `sent_verified` is deliberately false until each email is reconciled against actual Hostinger Sent evidence.
- Amounts are pipeline targets, not realized revenue.
- This package does not implement Hostinger IMAP polling, outbound email sending, AI-agent execution, calendar sync, or payment verification.
- Logs must not claim these integrations succeeded unless a real integration call returns verifiable evidence.
