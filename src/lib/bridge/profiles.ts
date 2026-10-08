import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { ACCOUNT_TYPES, INTERNAL_ROLES } from "./types";
import { writeAudit } from "./audit";
import { loadActor, requireVerifiedActor } from "./session";
import { verificationProfileId } from "./verification-profile-id";
import { assertPermission, canGrantInternalRole, workspaceHome } from "./rbac";
import { createHash, randomBytes } from "node:crypto";
import { bridgeEnv } from "./env";
import { bridgeInvitationUrl, bridgeVerificationUrl } from "./origin";
import { assertNotDevUser } from "./guards";
import { ONBOARDING_EMAIL_CONFLICT_MESSAGE, isBridgeProfileEmailConflict } from "./onboarding-errors";

function tokenPair() {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

async function mail(opts: { to: string; subject: string; text: string }) {
  const { sendBridgeMail } = await import("./mail.server");
  return sendBridgeMail(opts);
}



async function claimLegacyCreatorIntake(sql: Sql, email: string, authUserId: string) {
  const rows = await sql<{ legacy_user_id: number }>`
    select legacy_user_id
    from legacy_creator_intake
    where lower(email) = lower(${email})
    limit 1
  `;
  const legacy = rows[0];
  if (!legacy) return { claimed: false, titleCount: 0 };

  const legacyOwner = `legacy-user-${legacy.legacy_user_id}`;
  const updated = await sql<{ id: string }>`
    update bridge_titles
    set owner_user_id = ${authUserId},
        owner_account_type = 'independent_creator',
        updated_at = now()
    where owner_user_id = ${legacyOwner}
    returning id
  `;
  return { claimed: true, titleCount: updated.length };
}

async function persistSupabaseIdentityLink(sql: Sql, bridgeUserId: string, authUserId: string) {
  await sql`
    insert into bridge_loop_identity_links (
      bridge_user_id, auth_user_id, verification_method, verified_at, verified_by
    ) values (
      ${bridgeUserId}, ${authUserId}::uuid, 'supabase_auth_onboarding', now(), ${bridgeUserId}
    )
    on conflict (auth_user_id) do nothing
  `;
  const links = await sql<{ bridge_user_id: string }>`
    select bridge_user_id
    from bridge_loop_identity_links
    where auth_user_id = ${authUserId}::uuid
    limit 1
  `;
  if (links[0]?.bridge_user_id !== bridgeUserId) {
    throw new Error("Authenticated identity is already bound to another Bridge profile");
  }
}

export const syncSupabaseSessionUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const sql = await getSql();
    const existing = await loadActor(context.userId);
    const email = context.userEmail || existing?.email;
    if (!context.emailConfirmedAt) throw new Error("Confirm your email before entering Bridge.");

    if (existing) {
      await persistSupabaseIdentityLink(sql, existing.userId, context.userId);
      if (!existing.emailVerified) {
        await sql`update bridge_profiles set email_verified = true, updated_at = now() where user_id = ${existing.userId}`;
        const updated = await loadActor(context.userId);
        return { profile: updated, isComplete: true, home: workspaceHome(updated!) };
      }
      return { profile: existing, isComplete: true, home: workspaceHome(existing) };
    }

    return { profile: null, isComplete: false, email };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().min(1).max(80),
      accountType: z.enum(ACCOUNT_TYPES),
      organizationName: z.string().max(120).optional(),
      inviteToken: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const sql = await getSql();
    const existing = await loadActor(context.userId);
    if (!context.emailConfirmedAt) throw new Error("Confirm your email before entering Bridge.");
    if (existing) {
      await persistSupabaseIdentityLink(sql, existing.userId, context.userId);
      return { home: workspaceHome(existing), profile: existing };
    }

    const email = context.userEmail;
    if (!email) throw new Error("Account email is required from Supabase session");
    const verified = true;

    // Email uniqueness is a safety boundary, not an ownership signal. If this
    // authenticated identity is not already directly/explicitly linked, never
    // adopt an existing profile merely because the mailbox matches.
    const emailOwner = await sql<{ user_id: string }>`
      select user_id from bridge_profiles where lower(email) = lower(${email}) limit 1
    `;
    if (emailOwner[0]?.user_id && emailOwner[0].user_id !== context.userId) {
      throw new Error(ONBOARDING_EMAIL_CONFLICT_MESSAGE);
    }

    const org =
      data.accountType === "independent_creator" ? null : (data.organizationName ?? "").trim() || null;
    if (data.accountType !== "independent_creator" && !org) {
      throw new Error("Organization name is required");
    }

    let internalRole: string | null = null;
    let invitedBy: string | null = null;
    let inviteId: string | null = null;
    if (data.inviteToken) {
      const hash = createHash("sha256").update(data.inviteToken).digest("hex");
      const invites = await sql<{
        id: string;
        email: string;
        internal_role: string;
        invited_by: string;
        expires_at: string;
        accepted_at: string | null;
      }>`
        select id, email, internal_role, invited_by, expires_at, accepted_at
        from bridge_invites where token_hash = ${hash} limit 1
      `;
      const inv = invites[0];
      if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) {
        throw new Error("Invite is invalid or expired");
      }
      if (inv.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error("Invite email does not match this account");
      }
      internalRole = inv.internal_role;
      invitedBy = inv.invited_by;
      inviteId = inv.id;
    }

    const bridgeUserId = context.userId;
    try {
      const invitedRole = await sql.transaction(async (tx) => {
        if (inviteId) {
          // Consume the invite and create the profile in one transaction. If any
          // part fails, PostgreSQL rolls the invite, profile, and identity link back.
          const inserted = await tx<{ user_id: string }>`
            with consumed_invite as (
              update bridge_invites
              set accepted_at = now()
              where id = ${inviteId} and accepted_at is null
              returning id
            )
            insert into bridge_profiles (
              user_id, email, display_name, account_type, organization_name, internal_role, email_verified, invited_by
            )
            select
              ${bridgeUserId}, ${email}, ${data.displayName}, ${data.accountType}, ${org},
              ${internalRole}, ${verified}, ${invitedBy}
            from consumed_invite
            on conflict (user_id) do update set
              display_name = excluded.display_name,
              account_type = excluded.account_type,
              organization_name = excluded.organization_name,
              email_verified = true,
              updated_at = now()
            returning user_id
          `;
          if (inserted.length === 0) {
            throw new Error("Invite is invalid or expired");
          }
        } else {
          await tx`
            insert into bridge_profiles (
              user_id, email, display_name, account_type, organization_name, internal_role, email_verified, invited_by
            ) values (
              ${bridgeUserId}, ${email}, ${data.displayName}, ${data.accountType}, ${org}, ${internalRole},
              ${verified}, ${invitedBy}
            )
            on conflict (user_id) do update set
              display_name = excluded.display_name,
              account_type = excluded.account_type,
              organization_name = excluded.organization_name,
              email_verified = true,
              updated_at = now()
          `;
        }

        await persistSupabaseIdentityLink(tx, bridgeUserId, context.userId);
        return invitedRole;
      });
      void invitedRole;
    } catch (error) {
      // Close the lookup→insert race without exposing PostgreSQL internals.
      // A same-user concurrent retry remains idempotent via ON CONFLICT(user_id).
      if (isBridgeProfileEmailConflict(error)) {
        throw new Error(ONBOARDING_EMAIL_CONFLICT_MESSAGE);
      }
      throw error;
    }

    await writeAudit({
      actorUserId: bridgeUserId!,
      action: "profile.onboard",
      entityType: "bridge_profile",
      entityId: bridgeUserId,
      metadata: { accountType: data.accountType, internalRole },
    });
    const actor = await loadActor(context.userId);
    if (!actor) throw new Error("Profile create failed");

    const welcomeClaim = await sql<{ user_id: string }>`
      update bridge_profiles
      set welcome_email_sent_at = now(), updated_at = now()
      where user_id = ${bridgeUserId} and welcome_email_sent_at is null
      returning user_id
    `;
    if (welcomeClaim.length > 0) {
      try {
        const { sendWelcomeEmail } = await import("./mail.server");
        await sendWelcomeEmail({ to: email, name: data.displayName });
        await writeAudit({
          actorUserId: bridgeUserId!,
          action: "email.welcome_sent",
          entityType: "bridge_profile",
          entityId: bridgeUserId,
        });
      } catch (error) {
        await sql`
          update bridge_profiles
          set welcome_email_sent_at = null, updated_at = now()
          where user_id = ${bridgeUserId}
        `;
        console.error("[bridge] Welcome email failed", error);
      }
    }

    return { home: workspaceHome(actor), profile: actor };
  });

export const requestEmailVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const bridgeUserId = verificationProfileId(actor);
    const email = actor!.email;
    if (!email) throw new Error("No email on account");
    const { token, hash } = tokenPair();
    const id = randomBytes(16).toString("hex");
    const sql = await getSql();
    await sql`
      insert into bridge_email_challenges (id, user_id, email, purpose, token_hash, expires_at)
      values (${id}, ${bridgeUserId}, ${email}, ${"verify"}, ${hash}, ${new Date(Date.now() + 24 * 3600 * 1000).toISOString()})
    `;
    const url = bridgeVerificationUrl(token, bridgeEnv.appUrl());
    await mail({
      to: email,
      subject: "Verify your Crayons Bridge email",
      text: `Confirm this email for Crayons Bridge (StreamVista OPC Pvt Ltd):\n\n${url}\n\nThis link expires in 24 hours.`,
    });
    await writeAudit({
      actorUserId: context.userId,
      action: "email.verification_requested",
      entityType: "bridge_profile",
      entityId: bridgeUserId,
    });
    return { sent: true };
  });

export const confirmEmailVerification = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(16) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const hash = createHash("sha256").update(data.token).digest("hex");
    const rows = await sql<{ id: string; user_id: string | null; expires_at: string; consumed_at: string | null }>`
      select id, user_id, expires_at, consumed_at from bridge_email_challenges
      where token_hash = ${hash} and purpose = 'verify' limit 1
    `;
    const row = rows[0];
    if (!row || row.consumed_at || !row.user_id || new Date(row.expires_at) < new Date()) {
      throw new Error("Verification link is invalid or expired");
    }
    await sql`update bridge_email_challenges set consumed_at = now() where id = ${row.id}`;
    await sql`update bridge_profiles set email_verified = true, updated_at = now() where user_id = ${row.user_id}`;
    await writeAudit({
      actorUserId: row.user_id,
      action: "email.verified",
      entityType: "bridge_profile",
      entityId: row.user_id,
    });
    return { ok: true };
  });

export const listAdminProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      throw new Error("Admin access required");
    }
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      email: string;
      display_name: string;
      account_type: string;
      organization_name: string | null;
      internal_role: string | null;
      email_verified: boolean;
      created_at: string | Date;
    }>`
      select user_id, email, display_name, account_type, organization_name,
             internal_role, email_verified, created_at
      from bridge_profiles
      order by created_at desc
      limit 200
    `;
    return {
      profiles: rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        accountType: row.account_type,
        organizationName: row.organization_name,
        internalRole: row.internal_role,
        emailVerified: Boolean(row.email_verified),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
    };
  });

export const inviteInternalRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ email: z.string().email(), role: z.enum(INTERNAL_ROLES) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "users.invite_internal");
    if (!canGrantInternalRole(actor, data.role)) {
      throw new Error("Role grant is not permitted");
    }
    const sql = await getSql();
    const { token, hash } = tokenPair();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_invites (id, email, internal_role, invited_by, token_hash, expires_at)
      values (${id}, ${data.email.toLowerCase()}, ${data.role}, ${context.userId}, ${hash}, ${new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()})
    `;
    const url = bridgeInvitationUrl(token, bridgeEnv.appUrl());
    await mail({
      to: data.email,
      subject: "Crayons Bridge internal invite",
      text: `You were invited as ${data.role}. Accept:\n\n${url}\n`,
    });
    await writeAudit({
      actorUserId: context.userId,
      action: "users.invite_internal",
      entityType: "bridge_invite",
      entityId: id,
      metadata: { role: data.role },
    });
    return { sent: true };
  });
