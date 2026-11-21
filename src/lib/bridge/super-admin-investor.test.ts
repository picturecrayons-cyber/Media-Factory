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
    if (query.includes("count(distinct title_id)")) {
      return [{ title_count: 1, record_count: 2, linked_count: 1, unlinked_count: 1, total_capital_paise: 250000 }];
    }
    if (query.includes("from bridge_title_investors i")) {
      return [{
        id: "investor-record",
        title_id: "title-12345678",
        title_name: "Test Film",
        investor_name: "Investor A",
        investor_display_name: "Account A",
        linked: true,
        investment_reference: "INV-001",
        invested_amount_paise: 125000,
        currency: "INR",
        participation_percent: "10.00",
        created_at: new Date("2026-11-18T00:00:00.000Z"),
      }];
    }
    return [];
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": {
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          handler: (handler: unknown) => handler,
        };
        return builder;
      },
    },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./session": {
      requireVerifiedActor: async () => ({ userId: "operator", emailVerified: true, internalRole }),
    },
    "./guards": { assertNotDevUser: () => {} },
  };
  const source = readFileSync(new URL("./super-admin-investor.ts", import.meta.url), "utf8");
  const output = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { handler: exports.listSuperAdminInvestorGovernance, queries };
}

const context = { userId: "operator" };

test("Super Admin investor mapping is read-only and excludes private investor notes/emails", async () => {
  const h = harness();
  const result = await h.handler({ context }) as {
    summary: { titleCount: number; linkedCount: number };
    records: Array<{ reference: string; investorName: string; linkedDisplayName: string | null }>;
  };
  assert.equal(result.summary.titleCount, 1);
  assert.equal(result.summary.linkedCount, 1);
  assert.equal(result.records[0].reference, "investor-record");
  assert.equal(result.records[0].investorName, "Investor A");
  assert.equal(result.records[0].linkedDisplayName, "Account A");
  assert.equal(h.queries.length, 2);
  assert.ok(h.queries.every((query) => !/\b(insert|update|delete)\b/i.test(query)));
  assert.ok(h.queries.every((query) => !/email|notes|bank|account_number/i.test(query)));
});

test("non-Super Admin staff cannot read investor governance", async () => {
  const h = harness("admin");
  await assert.rejects(h.handler({ context }), /Super Admin access required/);
  assert.equal(h.queries.length, 0);
});
