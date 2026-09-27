# StreamVista → Bridge integration contract

## Architecture binding (verified 2026-09-27)

| Component | Canonical binding |
| --- | --- |
| Bridge source | `picturecrayons-cyber/Media-Factory`, `main`; Vercel project `bridge` (`prj_fT7VTrZMcgP9NutDhPvMhDAPtXNo`) |
| Loop frontend | Vercel project `crayonsloop` (`prj_3plh37Oe141udF7V2LUPbB5cFNHH`) |
| Shared identity and database | Supabase project `mlmgugivsyoxzdgwkbpu`, Supabase Auth |
| StreamVista frontend | Separate `streamvista` Vercel project; all operational data uses the shared database |
| Payments | Razorpay signed webhook receiver must be configured to reach the canonical server endpoint; deployment alone is not proof of delivery |

New work must preserve these bindings. Do not create another Supabase project, grant Loop editing authority over Bridge rights, infer RBAC from legacy flags, or bind the other Vercel projects to the Bridge domain. Changes to this contract require explicit owner review, migration plan and end-to-end verification.

Use the existing canonical Supabase database and Supabase Auth identity. StreamVista is the production work layer; Bridge owns title, rights, licensing, approval and Loop publication. A job's `bridge_title_id` is an internal handoff reference, not distribution authorization. Only the Bridge publication preflight can authorize a Loop title.

`streamvista_orders` records the customer, service, lane and source/output S3 keys. `streamvista_jobs` records pipeline stages and human review. Create an order from a server endpoint after verifying the Supabase bearer token and matching `owner_user_id` to that identity. Issue presigned S3 uploads from the server with a narrow key prefix. Set output only after QC approval. Require a Bridge operator to link the approved order to a Bridge title; the existing rights and publication checks remain mandatory. Do not expose AWS credentials to the browser.

The migration creates no consumer-facing access policy. Before wiring UI buttons, implement server actions with verified Supabase identity and explicit Bridge RBAC for updates, QC approval and handoff. Then add narrowly scoped RLS policies if browser access is required. Applying this migration alone does not make upload, payment or notifications functional.

## Historical export mapping

| Export | Destination / rule |
| --- | --- |
| `accounts_user` | Reconcile email to Supabase Auth only after identity verification; ignore Django `is_staff`, `is_superuser`, `user_type` for RBAC. |
| `films_film`, `films_filmdraft` | Stage title metadata via Bridge legacy mapper as draft; verify ownership and rights before publishing. |
| `films_filmbuyermapping` | Stage buyer/film reference and download permission for legal review; never grant live access from an export. |
| `films_payment` | Reconcile provider IDs against Razorpay server records; legacy signature fields are historical evidence, not a new entitlement. |
| `films_status` | Reconcile S3 keys against actual object existence and QC; `completed` in an export does not certify a deliverable. |
| `films_viewhistory` | Historical analytics only; do not recreate consumer entitlements. |

Store only source table, legacy ID, target reference and human review outcome in `streamvista_legacy_links`. Keep raw JSON and personal data outside Git. Import with idempotent batches, dry-run counts and exception report, then approve mappings before any customer access. Neither this migration nor a green deployment proves production end-to-end behavior.
