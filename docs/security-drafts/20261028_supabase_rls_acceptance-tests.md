# Supabase RLS acceptance tests — staging only

Status: **NOT RUN** — staging project access and test identities are not verified.

## Preconditions
- [ ] Confirm this is staging project ref `bbtrosuwisnxacuxvegt`, not Production `mlmgugivsyoxzdgwkbpu`.
- [ ] Confirm schema/migration version and exact Preview commit SHA.
- [ ] Confirm the runtime identity model. Existing migration documents Better Auth + Bridge RBAC and says `auth.uid()` is not the Bridge identity source.
- [ ] Use dedicated test identities and non-sensitive test records. Never use Production data.
- [ ] Capture before/after policy and grant inventory; do not apply the draft SQL file.

## Required test cases

| Table/flow | Identity | Expected result | Evidence |
|---|---|---|---|
| `bridge_production_assets` | anonymous | Denied | NOT RUN |
| `bridge_production_assets` | unrelated user | Denied | NOT RUN |
| `bridge_production_assets` | owner | Own-title records only | NOT RUN |
| `bridge_production_assets` | buyer without valid license/access | Denied | NOT RUN |
| `bridge_production_assets` | buyer with valid access | Read-only authorized rows | NOT RUN |
| `bridge_delivery_jobs` | unassigned vendor | Denied | NOT RUN |
| `bridge_delivery_jobs` | assigned vendor | Assigned jobs only; allowed fields/transitions only | NOT RUN |
| `bridge_delivery_jobs` | assigned vendor | Delete/reassign/alter title binding | Denied | NOT RUN |
| `bridge_story_concept_submissions` | unrelated user | Denied | NOT RUN |
| `bridge_story_concept_submissions` | owner | Own submissions only | NOT RUN |
| `bridge_story_concept_submissions` | buyer not shortlisted/granted | Denied | NOT RUN |
| `bridge_story_concept_submissions` | buyer explicitly granted | Read-only granted submissions | NOT RUN |
| 12 server-only tables | anon/authenticated | All direct CRUD denied | NOT RUN |
| all protected server flows | authorized server session | Existing Better Auth + RBAC behavior preserved | NOT RUN |

## Required checks before approving a migration
- Verify policy names in the staging catalog; permissive policies combine with OR.
- Verify table grants, views, RPCs, triggers, and SECURITY DEFINER functions.
- Verify UPDATE policies constrain both old rows (`USING`) and new rows (`WITH CHECK`).
- Attempt tampering with title ID, owner ID, assigned vendor, role, and authorization fields.
- Run application regression tests for upload, dashboard read/write, buyer access, and delivery workflow.
- Save query output, test identity role, exact commit SHA, and pass/fail evidence without secrets.

No Production SQL, Auth settings, deployment promotion, or real payment/mail/storage operation is authorized by this test plan.
