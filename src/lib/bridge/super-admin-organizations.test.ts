import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function harness(internalRole = "super_admin") {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    queries.push(query);
    if (query.includes("from bridge_organizations o")) {
      return [{ id: "org-1", legal_name: "Example Studio", status: "active", created_at: new Date("2026-11-18T00:00:00Z"), member_count: 2 }];
    }
    if (query.includes("from bridge_organization_memberships m")) {
      return [{ organization_id: "org-1", legal_name: "Example Studio", user_id: "user-1", display_name: "Member A", account_type: "studio", membership_role: "owner", status: "active", created_at: new Date("2026-11-18T00:00:00Z") }];
    }
    return [];
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": { createServerFn: () => { const builder = { middleware: () => builder, validator: () => builder, handler: (handler: unknown) => handler }; return builder; } },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "zod": { z: { enum: () => ({ default: () => ({}), nullable: () => ({}) }), object: () => ({ refine: () => ({}) }), string: () => ({ min: () => ({ max: () => ({ email: () => ({}) , uuid: () => ({}), trim: () => ({}) }) }), email: () => ({}) }) } },
    "node:crypto": { createHash: () => ({ update: () => ({ digest: () => "hash" }) }), randomBytes: () => ({ toString: () => "token" }) },
    "./audit": { writeAudit: async () => {} },
    "./env": { bridgeEnv: { appUrl: () => "https://bridge-preview.vercel.app" } },
    "./session": { requireVerifiedActor: async () => ({ userId: "operator", emailVerified: true, internalRole }) },
    "./guards": { assertNotDevUser: () => {} },
  };
  const source = readFileSync(new URL("./super-admin-organizations.ts", import.meta.url), "utf8");
  const output = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, { exports, require: (name: string) => { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; } });
  return { handler: exports.listSuperAdminOrganizationGovernance, queries };
}
const context = { userId: "operator" };

test("organization governance reads canonical records only and never sends invitations", async () => {
  const h = harness();
  const result = await h.handler({ context }) as { organizations: Array<{ id: string; memberCount: number }>; memberships: Array<{ userReference: string; role: string }>; invitationWorkflow: string };
  assert.equal(result.organizations[0].memberCount, 2);
  assert.equal(result.memberships[0].userReference, "user-1");
  assert.equal(result.memberships[0].role, "owner");
  assert.equal(result.invitationWorkflow, "NOT_IMPLEMENTED");
  assert.equal(h.queries.length, 2);
  assert.ok(h.queries.every((query) => !/\b(insert|update|delete)\b/i.test(query)));
  assert.ok(h.queries.every((query) => !/email|invite/i.test(query)));
});

test("non-Super Admin staff cannot read organization governance", async () => {
  const h = harness("admin");
  await assert.rejects(h.handler({ context }), /Super Admin access required/);
  assert.equal(h.queries.length, 0);
});
