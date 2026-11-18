import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function harness(internalRole = "super_admin") {
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": { createServerFn: () => { const builder = { middleware: () => builder, handler: (handler: unknown) => handler }; return builder; } },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "./session": { requireVerifiedActor: async () => ({ userId: "operator", emailVerified: true, internalRole }) },
    "./guards": { assertNotDevUser: () => {} },
    "./rbac": {
      permissionsFor: (actor: { internalRole: string | null; accountType: string }) => new Set(actor.internalRole === "super_admin" ? ["audit.read", "title.read_catalog", "payment.create_order"] : actor.internalRole === "admin" ? ["audit.read", "title.read_catalog"] : actor.accountType === "buyer" ? ["payment.create_order"] : []),
      canGrantInternalRole: (actor: { internalRole: string }, target: string) => actor.internalRole === "super_admin" && target !== "super_admin" ? false : actor.internalRole === "super_admin" && target === "super_admin",
    },
    "./types": { ACCOUNT_TYPES: ["independent_creator", "studio", "buyer", "investor"], INTERNAL_ROLES: ["admin", "super_admin", "viewer"], PERMISSIONS: ["audit.read", "title.read_catalog", "payment.create_order"] },
  };
  const source = readFileSync(new URL("./super-admin-rbac.ts", import.meta.url), "utf8");
  const output = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, { exports, require: (name: string) => { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; } });
  return exports.getSuperAdminRbacGovernance;
}

test("Super Admin RBAC governance reports separate policy matrices without querying assignments", async () => {
  const handler = harness();
  const result = await handler({ context: { userId: "operator" } }) as { internalRoles: Array<{ role: string; permissions: string[] }>; accountTypes: Array<{ accountType: string; permissions: string[] }>; assignments: string; mutationControls: string };
  assert.equal(result.internalRoles[0].role, "admin");
  assert.ok(result.internalRoles[1].permissions.includes("audit.read"));
  assert.ok(result.accountTypes.find((row) => row.accountType === "buyer")?.permissions.includes("payment.create_order"));
  assert.equal(result.assignments, "NOT_QUERIED");
  assert.equal(result.mutationControls, "NOT_IMPLEMENTED");
});

test("non-Super Admin staff cannot inspect privileged RBAC governance", async () => {
  const handler = harness("admin");
  await assert.rejects(handler({ context: { userId: "operator" } }), /Super Admin access required/);
});
