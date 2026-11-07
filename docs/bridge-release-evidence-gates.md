# Crayons Bridge — 15-gate release evidence evaluator

## Purpose

This is a **read-only evidence evaluator**, not a deployer or an environment scanner. It evaluates a checked-in/exported JSON manifest and fails closed if evidence is absent, stale/invalid, or inconsistent. It does not contact GitHub, Vercel, Supabase, OCI, or Razorpay; connector/API collectors must be implemented and separately reviewed before they are trusted as evidence sources.

## Run

```sh
node scripts/bridge-release-gates.mjs path/to/evidence.json
node --test scripts/bridge-release-gates.test.mjs
```

Exit code is `0` only when all 15 gates have complete evidence; `1` means NOT CERTIFIED; `2` means the manifest could not be read or arguments are invalid. Output is JSON for CI artifact capture. Even a fully populated manifest returns `CERTIFICATION CANDIDATE — HUMAN APPROVAL REQUIRED`, never automatic authorization. Production remains `HOLD / NO-GO` and the pilot remains `NOT AUTHORIZED`.

## Evidence record contract

Top-level shape:

```json
{
  "version": 1,
  "gates": {
    "deploymentMapping": {
      "status": "PASS",
      "checkedAt": "2026-10-22T00:00:00Z",
      "evidenceRef": "https://github.com/ORG/REPO/actions/runs/123",
      "publicDomain": {
        "commitSha": "40-character-commit-sha",
        "deploymentId": "vercel-deployment-id"
      },
      "preview": {
        "commitSha": "40-character-commit-sha",
        "deploymentId": "vercel-deployment-id"
      }
    }
  }
}
```

Every gate must have `status: "PASS"`, a parseable ISO timestamp, an evidence reference, and every required proof field defined in the script. Status labels alone are never accepted. Evidence references should point to durable, access-controlled GitHub runs/PR comments, Vercel deployment metadata, sanitized Supabase project metadata/advisor output, approved test reports, or signed rights/review records. Do not store tokens, secret keys, private keys, database URLs, payment secrets, signed upload URLs, or customer data in the manifest.

## Gate-specific controls

1. **Deployment mapping:** record the full commit SHA and immutable deployment ID for both the canonical public domain and Preview.
2. **Deployment identity:** record Vercel team and project identity. A 403, missing deployment object, or ambiguous domain mapping is BLOCKED—not inferred from HTML.
3. **PR #334:** require Preview SHA to equal the approved expected SHA exactly (`f8520f79c9f26d61a777d9d450d242878054a631` is the current expected value until intentionally revised).
4. **Fonts:** preserve sanitized request evidence from the exact-SHA Preview and show the intended removed/retained font families.
5. **Vercel Live:** record effective Preview-only setting and browser evidence from the exact deployment; source configuration alone is insufficient.
6. **Performance:** capture comparable clean before/after traces under the same device/network/cache conditions; record LCP and main-thread work with units.
7. **Database isolation:** record Preview and Production project refs, plus evidence of branch-specific configuration and denial of any Production write path. Never probe by attempting a Production mutation.
8. **OCI isolation:** record non-secret tenancy fingerprint, region, dedicated test bucket and access-policy evidence. Do not expose OCIDs/private keys or allow Production credentials in Preview.
9. **OCI integrity:** use only an authorized disposable fixture; prove source checksum, destination checksum, read-back and persisted asset reference.
10. **Upload recovery:** record regression-run evidence for progress, retry, cancel and recovery. No real-title retries.
11. **Razorpay:** require test-mode order/payment, signature and server-side verification evidence. No live payment.
12. **RBAC:** record authorized positive and negative tests; do not bypass role enforcement.
13. **Independent review:** identify reviewer, review record and all open findings.
14. **Rights:** title-specific rights evidence and explicit authorization are required; no inferred approval.
15. **Bridge → LOOP:** link the authorized version to publication, playback eligibility and controlled buyer acceptance.

## Fail-closed policy

- HTTP 200, a Ready deployment, passing CI, environment-variable presence, or a source-level setting does not independently pass a gate.
- Unknown, unavailable, mismatched, stale or incomplete evidence is **NOT VERIFIED**.
- Any blocker means **Preview NOT CERTIFIED**, **Production HOLD / NO-GO**, **one-title pilot NOT AUTHORIZED**.
- This evaluator does not deploy, promote, mutate databases, create OCI objects, trigger payments, upload titles, retry verification, submit QC, publish, or merge.
- Collector integrations for GitHub, Vercel and Supabase must be read-only, least-privilege, sanitized, and reviewed separately. Supabase must never be queried against the Production project for this Preview certification workflow.
