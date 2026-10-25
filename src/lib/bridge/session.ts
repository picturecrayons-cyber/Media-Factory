import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AccountType, InternalRole, Permission } from "./types";
import type { Actor } from "./rbac";
import { assertPermission, canAccessDashboard, workspaceHome } from "./rbac";
import { PRODUCT_NAME, LEGAL_OWNER, PRODUCTION_DOMAIN } from "./canonical";
import { integrationStatus } from "./env";
import { assertNotDevUser } from "./guards";
import { isMissingOrganizationSchemaError, workspaceFailureCode } from "./workspace-schema";

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
  organization_id: string | null;
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
    organizationId: r.organization_id,
    internalRole: (r.internal_role as InternalRole | null) ?? null,
    emailVerified: !!r.email_verified,
  };
}

async function loadActorByBridgeUserId(userId: string): Promise<BridgeActor | null> {
  const sql = await getSql();

  // Profile resolution must not depend on optional Studio organization schema.
  // In particular, the production super-admin profile is an independent_creator.
  const rows = await sql<BridgeProfileRow>`
    select bp.user_id, bp.email, bp.display_name, bp.account_type, bp.organization_name,
      null::text as organization_id, bp.internal_role, bp.email_verified
    from bridge_profiles bp where bp.user_id = ${userId} limit 1
  `;
  if (!rows[0]) return null;

  const actor = mapRow(rows[0]);
  if (actor.accountType !== "studio" || !actor.emailVerified) return actor;

  // Organization scope is an optional, server-resolved capability. If its
  // schema is absent, keep the profile available but do not grant organization
  // scope. Never infer an ID from organization_name or use another environment's ID.
  try {
    const memberships = await sql<{ organization_id: string }>`
      select bp.organization_id
      from bridge_profiles bp
      join bridge_organization_memberships m
        on m.organization_id = bp.organization_id
       and m.user_id = bp.user_id
       and m.status = 'active'
      join bridge_organizations o
        on o.id = m.organization_id
       and o.status = 'active'
      where bp.user_id = ${userId}
        and bp.organization_id is not null
      limit 1
    `;
    actor.organizationId = memberships[0]?.organization_id ?? null;
  } catch (error) {
    if (!isMissingOrganizationSchemaError(error)) throw error;
    actor.organizationId = null;
    console.warn("[bridge-session] optional organization schema unavailable; profile loaded without organization scope", {
      code: workspaceFailureCode(error),
    });
  }
  return actor;
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
  if (linked[0]?.bridge_user_id) return linked[0].bridge_user_id;

  // Legacy Bridge profiles may predate the Supabase identity-link table.
  // Recover the mapping only when the authenticated Supabase user's verified
  // email exactly matches the existing Bridge profile email.
  const byEmail = await sql<{ bridge_user_id: string }>`
    select bp.user_id as bridge_user_id
    from bridge_profiles bp
    join auth.users au on lower(au.email) = lower(bp.email)
    where au.id = ${authUserId}::uuid
      and au.email_confirmed_at is not null
    limit 1
  `;
  return byEmail[0]?.bridge_user_id ?? authUserId;
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
  return canAccessDashboard(actor);
}

export const getBridgeSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    try {
      const actor = await loadActor(context.userId);
      if (!actor) {
        return { userId: context.userId, profile: null, home: "/onboarding" };
      }
      return { userId: context.userId, profile: actor, home: workspaceHome(actor) };
    } catch (error) {
      const code = workspaceFailureCode(error);
      console.error("[bridge-session] workspace session resolution failed", { code, error });
      throw new Error(`${code}: Workspace session unavailable.`);
    }
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
