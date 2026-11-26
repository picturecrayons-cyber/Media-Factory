import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { writeAudit } from "@/lib/bridge/audit";

const ACCOUNT_TYPES = ["independent_creator", "studio", "buyer", "investor"] as const;

async function requireSuperAdmin(authUserId: string) {
  const actor = await requireVerifiedActor(authUserId);
  if (actor.internalRole !== "super_admin") throw new Error("Super Admin access required");
  return actor;
}

export const getMembershipControlPlane = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireSuperAdmin(context.userId);
    const sql = await getSql();
    const [plans, memberships] = await Promise.all([
      sql<{
        id: string; plan_key: string; version: number; display_name: string;
        account_types: string[]; trial_days: number; billing_interval: string;
        price_amount_paise: string | number | null; gst_basis_points: number | null;
        grace_period_days: number | null; billing_enabled: boolean; plan_status: string;
        created_at: string;
      }>`
        select id, plan_key, version, display_name, account_types, trial_days,
          billing_interval, price_amount_paise::text as price_amount_paise,
          gst_basis_points, grace_period_days, billing_enabled, plan_status, created_at
        from bridge_membership_plans
        order by plan_key, version desc
      `,
      sql<{
        id: string; user_id: string; email: string; display_name: string;
        account_type: string; organization_name: string | null; plan_id: string;
        plan_name: string; plan_version: number; status: string;
        effective_status: string; trial_started_at: string | null; trial_ends_at: string | null;
        current_period_ends_at: string | null; grace_ends_at: string | null;
        suspension_reason: string | null; created_at: string; updated_at: string;
      }>`
        select m.id, m.user_id, p.email, p.display_name, m.account_type,
          p.organization_name, m.plan_id, pl.display_name as plan_name,
          pl.version as plan_version, m.status,
          case when m.status = 'trialing' and m.trial_ends_at <= now()
            then 'expired' else m.status end as effective_status,
          m.trial_started_at, m.trial_ends_at, m.current_period_ends_at,
          m.grace_ends_at, m.suspension_reason, m.created_at, m.updated_at
        from bridge_memberships m
        join bridge_profiles p on p.user_id = m.user_id
        join bridge_membership_plans pl on pl.id = m.plan_id
        order by m.updated_at desc
        limit 500
      `,
    ]);
    const counts = {
      total: memberships.length,
      trialing: memberships.filter((m) => m.effective_status === "trialing").length,
      active: memberships.filter((m) => m.effective_status === "active").length,
      complimentary: memberships.filter((m) => m.effective_status === "complimentary").length,
      suspended: memberships.filter((m) => m.effective_status === "suspended").length,
      expired: memberships.filter((m) => m.effective_status === "expired").length,
    };
    return { actor: { userId: actor.userId }, plans, memberships, counts, billingEnabled: false as const };
  });

const createPlanSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  accountTypes: z.array(z.enum(ACCOUNT_TYPES)).min(1).max(4),
  trialDays: z.number().int().min(0).max(90),
  billingInterval: z.enum(["unconfigured", "monthly", "annual"]),
  priceAmountPaise: z.number().int().min(0).nullable(),
  gstBasisPoints: z.number().int().min(0).max(10000).nullable(),
  gracePeriodDays: z.number().int().min(0).max(90).nullable(),
}).superRefine((value, ctx) => {
  if (value.billingInterval === "unconfigured" && value.priceAmountPaise !== null) {
    ctx.addIssue({ code: "custom", path: ["priceAmountPaise"], message: "Leave price blank until billing cadence is selected." });
  }
  if (value.billingInterval !== "unconfigured" && value.priceAmountPaise === null) {
    ctx.addIssue({ code: "custom", path: ["priceAmountPaise"], message: "Enter a price for the selected billing cadence." });
  }
});

export const createMembershipPlanVersion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createPlanSchema)
  .handler(async ({ context, data }) => {
    const actor = await requireSuperAdmin(context.userId);
    const sql = await getSql();
    const created = await sql.transaction(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('bridge_membership_plan:bridge_standard'))`;
      const versions = await tx<{ next_version: number }>`
        select coalesce(max(version), 0) + 1 as next_version
        from bridge_membership_plans where plan_key = 'bridge_standard'
      `;
      const version = versions[0]?.next_version ?? 1;
      const rows = await tx<{ id: string; version: number }>`
        insert into bridge_membership_plans (
          plan_key, version, display_name, account_types, trial_days,
          billing_interval, price_amount_paise, gst_basis_points,
          grace_period_days, billing_enabled, plan_status, created_by
        ) values (
          'bridge_standard', ${version}, ${data.displayName}, ${data.accountTypes},
          ${data.trialDays}, ${data.billingInterval}, ${data.priceAmountPaise},
          ${data.gstBasisPoints}, ${data.gracePeriodDays}, false, 'active', ${actor.userId}
        )
        returning id, version
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: "membership.plan_version_created",
        entityType: "bridge_membership_plan",
        entityId: rows[0]!.id,
        metadata: {
          version, trialDays: data.trialDays, billingInterval: data.billingInterval,
          billingEnabled: false, gracePeriodDays: data.gracePeriodDays,
        },
      }, tx);
      return rows[0]!;
    });
    return { ...created, billingEnabled: false as const };
  });

const grantSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  planId: z.string().uuid(),
  grantType: z.enum(["trial", "complimentary"]),
  note: z.string().trim().max(500).optional(),
});

export const grantBridgeMembership = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(grantSchema)
  .handler(async ({ context, data }) => {
    const actor = await requireSuperAdmin(context.userId);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const profiles = await tx<{ user_id: string; account_type: string; organization_id: string | null }>`
        select user_id, account_type, organization_id from bridge_profiles
        where user_id = ${data.userId} for update
      `;
      const profile = profiles[0];
      if (!profile) throw new Error("Bridge profile not found");
      if (!ACCOUNT_TYPES.includes(profile.account_type as (typeof ACCOUNT_TYPES)[number])) {
        throw new Error("This profile type is not eligible for Bridge membership.");
      }
      const plans = await tx<{ id: string; trial_days: number; account_types: string[]; plan_status: string }>`
        select id, trial_days, account_types, plan_status
        from bridge_membership_plans where id = ${data.planId}::uuid limit 1
      `;
      const plan = plans[0];
      if (!plan || plan.plan_status !== "active") throw new Error("Select an active membership plan.");
      if (!plan.account_types.includes(profile.account_type)) throw new Error("The selected plan does not include this account type.");
      if (data.grantType === "trial" && plan.trial_days < 1) throw new Error("This plan has no trial period.");
      const existing = await tx<{ id: string }>`
        select id from bridge_memberships where user_id = ${data.userId} limit 1
      `;
      if (existing[0]) throw new Error("This account already has a Bridge membership. Use the membership actions instead.");
      const status = data.grantType === "trial" ? "trialing" : "complimentary";
      const inserted = await tx<{ id: string }>`
        insert into bridge_memberships (
          user_id, organization_id, account_type, plan_id, status,
          trial_started_at, trial_ends_at, granted_by
        ) values (
          ${profile.user_id}, ${profile.organization_id}, ${profile.account_type},
          ${plan.id}::uuid, ${status},
          case when ${data.grantType} = 'trial' then now() else null end,
          case when ${data.grantType} = 'trial' then now() + (${plan.trial_days} * interval '1 day') else null end,
          ${actor.userId}
        ) returning id
      `;
      await tx`
        insert into bridge_membership_events (
          membership_id, actor_user_id, event_type, to_status, note, metadata
        ) values (
          ${inserted[0]!.id}::uuid, ${actor.userId},
          ${data.grantType === "trial" ? "trial_granted" : "complimentary_granted"},
          ${status}, ${data.note ?? null},
          ${JSON.stringify({ planId: plan.id, trialDays: data.grantType === "trial" ? plan.trial_days : null })}
        )
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: data.grantType === "trial" ? "membership.trial_granted" : "membership.complimentary_granted",
        entityType: "bridge_membership",
        entityId: inserted[0]!.id,
        metadata: { userId: profile.user_id, accountType: profile.account_type, note: data.note ?? null },
      }, tx);
      return { membershipId: inserted[0]!.id, status };
    });
  });

const statusSchema = z.object({
  membershipId: z.string().uuid(),
  action: z.enum(["suspend", "reinstate"]),
  reason: z.string().trim().max(500).optional(),
});

export const updateBridgeMembershipStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusSchema)
  .handler(async ({ context, data }) => {
    const actor = await requireSuperAdmin(context.userId);
    if (data.action === "suspend" && !data.reason?.trim()) {
      throw new Error("A reason is required to suspend a membership.");
    }
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const rows = await tx<{
        id: string; user_id: string; status: string; suspended_from_status: string | null;
      }>`
        select id, user_id, status, suspended_from_status
        from bridge_memberships where id = ${data.membershipId}::uuid for update
      `;
      const current = rows[0];
      if (!current) throw new Error("Membership not found.");
      let nextStatus: string;
      let eventType: string;
      if (data.action === "suspend") {
        if (!["trialing", "active", "complimentary", "past_due"].includes(current.status)) {
          throw new Error("Only current memberships can be suspended.");
        }
        nextStatus = "suspended";
        eventType = "suspended";
        await tx`
          update bridge_memberships set status = 'suspended',
            suspended_from_status = ${current.status},
            suspended_by = ${actor.userId}, suspension_reason = ${data.reason!.trim()},
            updated_at = now()
          where id = ${current.id}::uuid
        `;
      } else {
        if (current.status !== "suspended") throw new Error("Only suspended memberships can be reinstated.");
        nextStatus = current.suspended_from_status ?? "active";
        if (nextStatus === "past_due" || nextStatus === "expired") nextStatus = "active";
        eventType = "reinstated";
        await tx`
          update bridge_memberships set status = ${nextStatus},
            suspended_from_status = null, suspended_by = null, suspension_reason = null,
            updated_at = now()
          where id = ${current.id}::uuid
        `;
      }
      await tx`
        insert into bridge_membership_events (
          membership_id, actor_user_id, event_type, from_status, to_status, note
        ) values (
          ${current.id}::uuid, ${actor.userId}, ${eventType},
          ${current.status}, ${nextStatus}, ${data.reason ?? null}
        )
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: `membership.${eventType}`,
        entityType: "bridge_membership",
        entityId: current.id,
        metadata: { userId: current.user_id, fromStatus: current.status, toStatus: nextStatus, reason: data.reason ?? null },
      }, tx);
      return { membershipId: current.id, status: nextStatus };
    });
  });
