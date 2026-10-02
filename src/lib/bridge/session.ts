import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AccountType, InternalRole, Permission } from "./types";
import type { Actor } from "./rbac";
import { assertPermission, canAccessDashboard, workspaceHome } from "./rbac";
import { PRODUCT_NAME, LEGAL_OWNER, PRODUCTION_DOMAIN } from "./canonical";
import { integrationStatus } from "./env";
import { assertNotDevUser } from "./guards";

export type BridgeActor = Actor & {
  email: string;
  displayName: string;
  organizationName: string | null;
};

type BridgeProfileRow = {
  user_id: string;
  email: string;
  display_name: string;
  account_type: string;
  organization_name: string | null;
  internal_role: string | null;
  email_verified: boolean;
};

function mapRow(r: BridgeProfileRow): BridgeActor {
  return {
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    accountType: r.account_type as AccountType,
    organizationName: r.organization_name,
    internalRole: (r.internal_role as InternalRole | null) ?? null,
    emailVerified: !!r.email_verified,
  };
}

async function loadActorByBridgeUserId(userId: string): Promise<BridgeActor | null> {
  const sql = await getSql();
  const rows = await sql<BridgeProfileRow>`
    select user_id, email, display_name, account_type, organization_name, internal_role, email_verified
    from bridge_profiles where user_id = ${userId} limit 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function resolveBridgeUserId(authUserId: string): Promise<string> {
  assertNotDevUser(authUserId);
  const sql = await getSql();
  const direct = await sql<{ user_id: string }>`
    select user_id from bridge_profiles where user_id = ${authUserId} limit 1
  `;
  if (direct[0]?.user_id) return direct[0].user_id;

  const linked = await sql<{ bridge_user_id: string }>`
    select bridge_user_id
    from bridge_loop_identity_links
    where auth_user_id = ${authUserId}::uuid
    limit 1
  `;
  return linked[0]?.bridge_user_id ?? authUserId;
}

export async function loadActor(authUserId: string): Promise<BridgeActor | null> {
  const bridgeUserId = await resolveBridgeUserId(authUserId);
  return loadActorByBridgeUserId(bridgeUserId);
}

export async function requireActor(userId: string): Promise<BridgeActor> {
  const actor = await loadActor(userId);
  if (!actor) throw new Error("Profile required");
  return actor;
}

export async function requireVerifiedActor(userId: string): Promise<BridgeActor> {
  const actor = await requireActor(userId);
  if (!actor.emailVerified) throw new Error("Email verification required");
  return actor;
}

export function requireActorPermission(actor: Actor, permission: Permission) {
  assertPermission(actor, permission);
}

/**
 * Private Bridge owner/control-plane gate.
 *
 * Operational and admin surfaces must not rely on client-side navigation hiding.
 * A verified internal role is required before protected Bridge routes render.
 * Creator/studio/buyer account permissions remain available for data-level policy,
 * but they cannot enter the private owner workspace while this lock is enabled.
 */
export function isPrivateBridgeOperator(actor: Actor): boolean {
  return actor.emailVerified && Boolean(actor.internalRole);
}

export const getBridgeSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    let actor = await loadActor(context.userId);
    if (!actor) {
      return { userId: context.userId, profile: null, home: "/onboarding" };
    }
    if (!actor.emailVerified && context.emailConfirmedAt) {
      const bridgeUserId = await resolveBridgeUserId(context.userId);
      const sql = await getSql();
      await sql`update bridge_profiles set email_verified = true, updated_at = now()
        where user_id = ${bridgeUserId} and email_verified = false`;
      actor = await loadActor(context.userId);
      if (!actor) throw new Error("Bridge profile could not be loaded");
    }
    return { userId: context.userId, profile: actor, home: workspaceHome(actor) };
  });

export const getDashboardSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canAccessDashboard(actor)) throw new Error("Super admin access required");
    return { profile: actor };
  });

export const getBridgePublicStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    product: PRODUCT_NAME,
    owner: LEGAL_OWNER,
    domain: PRODUCTION_DOMAIN,
    integrations: integrationStatus(),
  };
});
