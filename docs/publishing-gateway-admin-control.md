# Publishing Gateway Admin Control

The Publishing Gateway control is located in the Bridge Admin Control Plane at `/admin`. It is a fail-closed verification surface, not a deployment tool.

## Required evidence

- Latest main-branch GitHub Actions run succeeds for Bridge and Crayons Loop.
- Each latest workflow run has at least one non-expired artifact.
- Vercel reports a READY production deployment for both projects.
- `crayonsloop.in` is verified on the `crayonsloop` project and `crayonspictures.in` is verified on the `bridge` project.
- Both public HTTPS domains are reachable.
- A configured end-to-end smoke endpoint explicitly reports passing gateway checks for both domains.

## Server environment

- `VERCEL_TOKEN`: read-only Vercel API token with access to both projects.
- `VERCEL_TEAM_ID` or `VERCEL_ORG_ID`: set when the projects belong to a team.
- `GITHUB_TOKEN` or `GH_TOKEN`: optional token for GitHub Actions/artifact visibility, especially for private repositories.
- `PUBLISHING_GATEWAY_SMOKE_URL`: HTTPS endpoint that runs the real end-to-end smoke checks and returns JSON matching this contract:

```json
{
  "status": "passed",
  "gateway": "publishing-gateway",
  "domains": ["crayonsloop.in", "crayonspictures.in"]
}
```

The smoke endpoint must only return `status: "passed"` after it has tested both domain paths end-to-end. A plain homepage HTTP 200 is not enough.

## Authorization and safety

- Status checks require a verified Bridge admin or super-admin session.
- Release approval requires a verified super-admin session, a fresh server-side recheck of all gates, and explicit confirmation.
- Missing credentials or evidence are reported as UNVERIFIED and keep the status at HOLD.
- Release approval writes an audit event only. It does not deploy, promote, alter domains, change release state in Production, or mutate catalog data.
- Production deployment/promotion remains a separate operation requiring explicit authorization outside this control.
