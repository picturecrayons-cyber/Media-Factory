# Bridge Command Center

Internal `/internal` is the B2B operating desk. Studio/creator desks stay tenant-scoped.

Existing internal roles map to departments (no parallel role table):

| Role | Department |
|---|---|
| super_admin / admin | Command, people, partners, finance, distribution |
| qc_reviewer | QC |
| legal_reviewer | Legal / rights |
| finance | Payments |
| viewer | Directory + audit read |

YouTube, WhatsApp, CloudFront: **not configured**. Env-only integrations are **configured**, never **connected**, until a live probe succeeds (Postgres `select 1`, S3 HeadBucket).

Partner invites start **pending**. Approval is a separate action — signup is not ACTIVE.

Schema: `migrations/0010_partners.sql` (Preview after owner YES).
