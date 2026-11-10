#!/usr/bin/env node
/**
 * RETIRED WRITE-CAPABLE SMOKE TEST — intentionally fail-closed.
 *
 * The former script was pinned to the retired Supabase project
 * bbtrosuwisnxacuxvegt and created synthetic fixtures / exercised asset
 * confirmation inside a transaction. The canonical Testing DB is now
 * jbymleftneggcgutlcqu, but schema/migration/RLS/ACL compatibility has not
 * been approved for this write-capable test.
 *
 * Do not repoint this script at the canonical Testing DB. Use
 * scripts/staging-schema-audit-readonly.mjs for catalog-only inspection.
 * Reintroducing an authenticated write-capable RBAC E2E requires a separate
 * approval after schema reconciliation and verified Preview isolation.
 */

console.error("BLOCKED: legacy staging RBAC smoke is retired; it is pinned to an obsolete project and performs write-capable fixture operations.");
console.error("Action: READ-ONLY schema audit only. Run npm run audit:staging-schema:readonly after supplying the canonical Testing DB connection.");
console.error("No database connection was opened and no data, schema, grants, policies, or storage objects were changed.");
process.exitCode = 2;
