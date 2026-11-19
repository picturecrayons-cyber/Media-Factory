import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

function harness(options: { role?: string } = {}) {
  const statements: string[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    statements.push(query);
    if (query.includes("from public.bridge_profiles p")) return [{
      user_id: "buyer-1", email: "buyer@example.test", display_name: "Buyer One",
      account_type: "buyer", organization_name: "Shown Label", organization_id: null,
      email_verified: true, created_at: new Date("2026-01-01T00:00:00Z"), updated_at: null,
    }];
    if (query.includes("from public.bridge_organizations o")) return [{
      id: "org-1", legal_name: "Buyer Org Ltd", status: "active", member_count: 2,
      buyer_count: 1, created_at: new Date("2026-01-02T00:00:00Z"),
    }];
    if (query.includes("from public.bridge_license_packages")) return [{ status: "READY", count: 1 }];
    if (query.includes("from public.bridge_payments")) return [{ status: "captured", count: 1, amount_paise: 50000 }];
    if (query.includes("from public.bridge_entitlements")) return [{ access_type: "license", count: 1 }];
    if (query.includes("from public.bridge_audit_logs")) return [{
      created_at: new Date("2026-01-03T00:00:00Z"), action: "payment.captured",
      entity_type: "bridge_payment", entity_id: "payment-1", actor_user_id: "buyer-1",
    }];
    if (query.includes("from public.bridge_organization_memberships m")) return [{
      organization_id: "org-1", user_id: "buyer-1", membership_role: "member",
      status: "active", legal_name: "Buyer Org Ltd",
    }];
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
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./guards": { assertNotDevUser: (id: string) => {
      if (id === "dev-user") throw Error("Mock/dev authorization is disabled");
    } },
    "./session": { resolveBridgeUserId: async (id: string) => id === "auth-user-1" ? "admin-1" : id, requireVerifiedActor: async () => ({
      userId: "admin-1", emailVerified: true, internalRole: options.role ?? "super_admin",
    }) },
  };
  const source = `
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor, resolveBridgeUserId } from "./session";
export const listSuperAdminBuyerManagement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const bridgeUserId = await resolveBridgeUserId(context.userId);
    const actor = await requireVerifiedActor(bridgeUserId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
    const sql = await getSql();
    const [buyers, organizations, packages, payments, entitlements, audit] = await Promise.all([
      sql`select p.user_id, p.email, p.display_name, p.account_type, p.organization_name, p.organization_id, p.email_verified, p.created_at, p.updated_at from public.bridge_profiles p where p.account_type='buyer' order by p.created_at desc nulls last limit 500`,
      sql`select o.id, o.legal_name, o.status, o.created_at, count(distinct m.user_id)::int as member_count, count(distinct p.user_id) filter (where p.account_type='buyer')::int as buyer_count from public.bridge_organizations o left join public.bridge_organization_memberships m on m.organization_id=o.id and m.status='active' left join public.bridge_profiles p on p.user_id=m.user_id group by o.id order by o.created_at desc limit 200`,
      sql`select status, count(*)::int as count from public.bridge_license_packages group by status order by status`,
      sql`select status, count(*)::int as count, coalesce(sum(amount_paise) filter (where status='captured'),0)::bigint as amount_paise from public.bridge_payments group by status order by status`,
      sql`select access_type, count(*)::int as count from public.bridge_entitlements group by access_type order by access_type`,
      sql`select created_at, action, entity_type, entity_id, actor_user_id from public.bridge_audit_logs where action like 'buyer.%' or action like 'organization.%' or action like 'payment.%' or action like 'licensing.%' order by created_at desc limit 100`
    ]);
    const buyerIds = buyers.map((row) => row.user_id);
    let membershipRows = [];
    if (buyerIds.length) {
      try {
        membershipRows = await sql`select m.organization_id, m.user_id, m.membership_role, m.status, o.legal_name from public.bridge_organization_memberships m join public.bridge_organizations o on o.id=m.organization_id where m.user_id=any(${buyerIds}::text[]) order by o.legal_name, m.user_id`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/42P01|does not exist|undefined table/i.test(message)) throw error;
      }
    }
    const membershipByUser = new Map();
    for (const row of membershipRows) {
      const items = membershipByUser.get(row.user_id) ?? [];
      items.push(row); membershipByUser.set(row.user_id, items);
    }
    return {
      generatedAt:new Date().toISOString(), buyerCount:buyers.length, organizationCount:organizations.length,
      buyers:buyers.map(row=>({userId:row.user_id,email:row.email,displayName:row.display_name,accountType:row.account_type,organizationLabel:row.organization_name,organizationId:row.organization_id,emailVerified:row.email_verified,createdAt:row.created_at,updatedAt:row.updated_at,memberships:(membershipByUser.get(row.user_id)??[]).map(m=>({organizationId:m.organization_id,organizationName:m.legal_name,role:m.membership_role,status:m.status}))})),
      organizations:organizations.map(row=>({id:row.id,legalName:row.legal_name,status:row.status,memberCount:Number(row.member_count),buyerCount:Number(row.buyer_count),createdAt:row.created_at})),
      licensing:{packageStates:packages.map(row=>({status:row.status,count:Number(row.count)})),paymentStates:payments.map(row=>({status:row.status,count:Number(row.count),capturedAmountPaise:Number(row.amount_paise)})),entitlementStates:entitlements.map(row=>({accessType:row.access_type,count:Number(row.count)}))},
      recentAudit:audit.map(row=>({createdAt:row.created_at,action:row.action,entityType:row.entity_type,entityId:row.entity_id,actorReference:row.actor_user_id})),
      authorization:{profileWindow:"LATEST_500_BUYER_PROFILES",organizationsWindow:"LATEST_200_ORGANIZATIONS",mutatingActionsEnabled:false,accountCreation:"NOT_EXPOSED",roleChanges:"NOT_EXPOSED",licensingAndEntitlements:"OWNED_BY_EXISTING_BRIDGE_PAYMENT_WORKFLOW"}
    };
  });
`;
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: 9 } }).outputText;
  const exports: Record<string, unknown> = {};
  const require = (name: string) => {
    if (!(name in modules)) throw new Error("Unexpected module " + name);
    return modules[name];
  };
  runInNewContext(js, { exports, require, process: { env: {} }, Date, Map, Error, console });
  return { list: exports.listSuperAdminBuyerManagement as (arg: unknown) => Promise<any>, statements };
}

const context = { userId: "auth-user-1" };

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
