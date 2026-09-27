import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AccountType, InternalRole, Permission } from "./types";
import type { Actor } from "./rbac";
import { assertPermission, workspaceHome } from "./rbac";
import { PRODUCT_NAME, LEGAL_OWNER, PRODUCTION_DOMAIN } from "./canonical";
import { integrationStatus } from "./env";
import { assertNotDevUser } from "./guards";

export type BridgeActor = Actor & {
  email: string;
  displayName: string;
  organizationName: string | null;
};

function mapRow(r: {
  user_id: string;
  email: string;
  display_name: string;
  account_type: string;
  organization_name: string | null;
  internal_role: string | null;
  email_verified: boolean;
}): BridgeActor {
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

export async function loadActor(userId: string): Promise<BridgeActor | null> {
  assertNotDevUser(userId);
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    email: string;
    display_name: string;
    account_type: string;
    organization_name: string | null;
    internal_role: string | null;
    email_verified: boolean;
  }>`
    select user_id, email, display_name, account_type, organization_name, internal_role, email_verified
    from bridge_profiles where user_id = ${userId} limit 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function requireActor(userId: string): Promise<BridgeActor> {
  const actor = await loadActor(userId);
  if (!actor) throw new Error("Profile required");
  return actor;
}

export function requireActorPermission(actor: Actor, permission: Permission) {
  assertPermission(actor, permission);
}

export const getBridgeSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    let actor = await loadActor(context.userId);
    if (!actor) {
      return { userId: context.userId, profile: null, home: "/onboarding" };
    }
    // A confirmed Supabase account can return through password sign-in without
    // visiting the signup callback. Keep the Bridge profile in sync only after
    // the server has verified Supabase's email confirmation timestamp.
    if (!actor.emailVerified && context.emailConfirmedAt) {
      const sql = await getSql();
      await sql`update bridge_profiles set email_verified = true, updated_at = now()
        where user_id = ${context.userId} and email_verified = false`;
      actor = await loadActor(context.userId);
      if (!actor) throw new Error("Bridge profile could not be loaded");
    }
    return { userId: context.userId, profile: actor, home: workspaceHome(actor) };
  });

export const getBridgePublicStatus = createServerFn({ method: "GET" }).handler(async () => {
  return {
    product: PRODUCT_NAME,
    owner: LEGAL_OWNER,
    domain: PRODUCTION_DOMAIN,
    integrations: integrationStatus(),
  };
});
