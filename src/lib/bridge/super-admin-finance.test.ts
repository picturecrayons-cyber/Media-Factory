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
    if (query.includes("from bridge_title_settlements s")) {
      return [{ id: "settlement-ref", title_name: "Test Film", revenue_received_paise: 50000, creator_payable_paise: 30000, investor_payable_paise: 10000, bridge_share_paise: 10000, currency: "INR", status: "PENDING", settled_at: null, created_at: new Date("2026-11-18T00:00:00.000Z") }];
    }
    if (query.includes("from bridge_title_settlements")) {
      return [{ status: "PENDING", currency: "INR", settlement_count: 1, revenue_received_paise: 50000, creator_payable_paise: 30000, investor_payable_paise: 10000, bridge_share_paise: 10000 }];
    }
    if (query.includes("group by status, currency")) {
      return [{
        status: "captured",
        currency: "INR",
        payment_count: 2,
        total_amount_paise: 250000,
      }];
    }
    if (query.includes("from bridge_payments p")) {
      return [{
        id: "payment-ref",
        title_name: "Test Film",
        purpose: "title_license",
        provider: "razorpay",
        status: "captured",
        amount_paise: 125000,
        currency: "INR",
        created_at: new Date("2026-11-18T00:00:00.000Z"),
        verified_at: new Date("2026-11-18T00:01:00.000Z"),
      }];
    }
    if (query.includes("from bridge_title_settlements s")) {
      return [{ id: "settlement-ref", title_name: "Test Film", revenue_received_paise: 50000, creator_payable_paise: 30000, investor_payable_paise: 10000, bridge_share_paise: 10000, currency: "INR", status: "PENDING", settled_at: null, created_at: new Date("2026-11-18T00:00:00.000Z") }];
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
      requireVerifiedActor: async () => ({
        userId: "operator",
        emailVerified: true,
        internalRole,
      }),
    },
    "./guards": { assertNotDevUser: () => {} },
  };
  const source = readFileSync(new URL("./super-admin-finance.ts", import.meta.url), "utf8");
  const output = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { handler: exports.listSuperAdminPaymentOverview, queries };
}

const context = { userId: "operator" };

test("Super Admin payment overview returns aggregate and redacted recent records without writes", async () => {
  const h = harness();
  const result = await h.handler({ context }) as {
    summary: Array<{ paymentCount: number; totalAmountPaise: number }>;
    recentPayments: Array<{ reference: string; titleName: string | null }>;
    settlementSummary: Array<{ count: number; investorPayablePaise: number }>;
    recentSettlements: Array<{ reference: string; status: string }>;
    invoices: { status: string; rows: unknown[] };
    ledger: { status: string; groups: unknown[] };
  };
  assert.equal(result.summary[0].paymentCount, 2);
  assert.equal(result.summary[0].totalAmountPaise, 250000);
  assert.equal(result.recentPayments[0].reference, "payment-ref");
  assert.equal(result.recentPayments[0].titleName, "Test Film");
  assert.equal(result.settlementSummary[0].count, 1);
  assert.equal(result.settlementSummary[0].investorPayablePaise, 10000);
  assert.equal(result.recentSettlements[0].reference, "settlement-ref");
  assert.equal(result.invoices.status, "AVAILABLE");
  assert.equal(result.ledger.status, "AVAILABLE");
  assert.ok(h.queries.length === 6);
  assert.ok(h.queries.every((query) => !/\b(insert|update|delete)\b/i.test(query)));
  assert.ok(h.queries.every((query) => !/email|user_id|customer/i.test(query)));
});

test("non-Super Admin staff cannot read payment oversight", async () => {
  const h = harness("admin");
  await assert.rejects(h.handler({ context }), /Super Admin access required/);
  assert.equal(h.queries.length, 0);
});
