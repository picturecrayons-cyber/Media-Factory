import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function harness(options: { role?: string; reject?: string } = {}) {
  const statements: string[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    statements.push(query);
    if (query.includes("from public.bridge_profiles p")) {
      return [{ user_id: "buyer-1", email: "buyer@example.test", display_name: "Buyer One",
        account_type: "buyer", organization_name: "Shown Label", organization_id: null,
        email_verified: true, created_at: new Date("2026-01-01T00:00:00Z"), updated_at: null }];
    }
    if (query.includes("from public.bridge_organizations o")) {
      return [{ id: "org-1", legal_name: "Buyer Org Ltd", status: "active",
        member_count: 2, buyer_count: 1, created_at: new Date("2026-01-02T00:00:00Z") }];
    }
    if (query.includes("from public.bridge_license_packages")) return [{ status: "READY", count: 1 }];
    if (query.includes("from public.bridge_payments")) return [{ status: "captured", count: 1, amount_paise: 50000 }];
    if (query.includes("from public.bridge_entitlements")) return [{ access_type: "license", count: 1 }];
    if (query.includes("from public.bridge_audit_logs")) return [{
      created_at: new Date("2026-01-03T00:00:00Z"), action: "payment.captured",
      entity_type: "bridge_payment", entity_id: "payment-1", actor_user_id: "buyer-1",
    }];
    if (query.includes("from public.bridge_organization_memberships m")) {
      return [{ organization_id: "org-1", user_id: "buyer-1", membership_role: "member",
        status: "active", legal_name: "Buyer Org Ltd" }];
    }
    return [];
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": { createServerFn: () => {
      const builder: Record<string, unknown> = {};
      builder.middleware = () => builder;
      builder.validator = () => builder;
      builder.handler = (fn: (input: unknown) => unknown) => fn;
      return builder;
    } },
    "zod": { z: { object: () => ({}) } },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./guards": { assertNotDevUser: (id: string) => { if (id === "dev-user") throw Error("Mock/dev authorization is disabled"); } },
    "./session": { requireVerifiedActor: async () => ({ userId: "admin-1", emailVerified: true, internalRole: options.role ?? "super_admin" }) },
  };
  const source = readFileSync(new URL("./super-admin-buyers.ts", import.meta.url), "utf8");
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: 9 } }).outputText;
  const exports: Record<string, unknown> = {};
  const require = (name: string) => {
    if (!(name in modules)) throw new Error("Unexpected module " + name);
    return modules[name];
  };
  runInNewContext(js, { exports, require, process: { env: {} }, Date, Map, Error, console });
  return { list: exports.listSuperAdminBuyerManagement as (arg: unknown) => Promise<any>, statements };
}

const context = { userId: "admin-1" };

test("Buyer management returns independent profiles and organization membership separately", async () => {
  const h = harness();
  const result = await h.list({ context });
  assert.equal(result.buyerCount, 1);
  assert.equal(result.buyers[0].userId, "buyer-1");
  assert.equal(result.buyers[0].organizationLabel, "Shown Label");
  assert.equal(result.buyers[0].memberships[0].organizationName, "Buyer Org Ltd");
  assert.equal(result.buyers[0].organizationId, null);
  assert.equal(result.authorization.mutatingActionsEnabled, false);
});

test("Buyer management surfaces licensing aggregates without granting entitlements", async () => {
  const h = harness();
  const result = await h.list({ context });
  assert.equal(result.licensing.paymentStates[0].status, "captured");
  assert.equal(result.licensing.entitlementStates[0].count, 1);
  assert.equal(h.statements.some((s) => /insert|update|delete|grant|revoke/i.test(s)), false);
});

test("Buyer management rejects non-Super Admin internal roles", async () => {
  const h = harness({ role: "admin" });
  await assert.rejects(() => h.list({ context }), /Super Admin access required/);
  assert.equal(h.statements.length, 0);
});
