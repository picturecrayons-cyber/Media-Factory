import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ACCOUNT_TYPES, INTERNAL_ROLES } from "./types";
import { writeAudit } from "./audit";
import { loadActor } from "./session";
import { assertPermission, workspaceHome } from "./rbac";
import { createHash, randomBytes } from "node:crypto";
import { bridgeEnv } from "./env";
import { assertNotDevUser } from "./guards";
import { TRANSACTIONAL_FROM } from "./canonical";
import {
  VERIFY_TTL_MS,
  assertVerifyResendAllowed,
  canonicalVerifyUrl,
  verificationEmailCopy,
} from "./verify-mail";

function tokenPair() {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

async function mail(opts: { to: string; subject: string; text: string; html?: string }) {
  const { sendBridgeMail } = await import("./mail.server");
  return sendBridgeMail(opts);
}

async function sendVerificationNow(opts: {
  userId: string;
  email: string;
  displayName?: string | null;
  throttle?: boolean;
}) {
  const sql = await getSql();
  if (opts.throttle !== false) {
    const recent = await sql<{ created_at: string | Date }>`
      select created_at from bridge_email_challenges
      where user_id = ${opts.userId} and purpose = ${"verify"}
      order by created_at desc limit 1
    `;
    assertVerifyResendAllowed(recent[0]?.created_at ?? null);
  }
  await sql`
    update bridge_email_challenges
    set consumed_at = now()
    where user_id = ${opts.userId} and purpose = ${"verify"} and consumed_at is null
  `;
  const { token, hash } = tokenPair();
  const id = randomBytes(16).toString("hex");
  const url = canonicalVerifyUrl(bridgeEnv.appUrl(), token);
  const copy = verificationEmailCopy({
    displayName: opts.displayName,
    url,
    to: opts.email,
  });
  await sql`
    insert into bridge_email_challenges (id, user_id, email, purpose, token_hash, expires_at)
    values (${id}, ${opts.userId}, ${opts.email}, ${"verify"}, ${hash}, ${new Date(Date.now() + VERIFY_TTL_MS).toISOString()})
  `;
  try {
    await mail({ to: opts.email, subject: copy.subject, text: copy.text, html: copy.html });
  } catch (err) {
    await sql`update bridge_email_challenges set consumed_at = now() where id = ${id}`;
    throw err instanceof Error ? err : new Error("SMTP send failed");
  }
  await writeAudit({
    actorUserId: opts.userId,
    action: "email.verification_requested",
    entityType: "bridge_profile",
    entityId: opts.userId,
    metadata: { from: TRANSACTIONAL_FROM },
  });
}

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
    if (existing) return { home: workspaceHome(existing), profile: existing };

    const emailRows = await sql<{ email: string; emailVerified: boolean; name: string }>`
      select email, "emailVerified", name from "user" where id = ${context.userId} limit 1
    `;
    const email = emailRows[0]?.email;
    if (!email) throw new Error("Account email is required");
    const verified = !!emailRows[0]?.emailVerified;

    let internalRole: string | null = null;
    let invitedBy: string | null = null;
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
      await sql`update bridge_invites set accepted_at = now() where id = ${inv.id}`;
    }

    const org =
      data.accountType === "independent_creator" ? null : (data.organizationName ?? "").trim() || null;
    if (data.accountType !== "independent_creator" && !org) {
      throw new Error("Organization name is required");
    }

    let organizationId: string | null = null;
    if (org) {
      organizationId = randomBytes(16).toString("hex");
      const kind = data.accountType === "buyer" ? "buyer" : data.accountType === "studio" ? "studio" : "internal";
      await sql`
        insert into bridge_organizations (id, name, kind, created_by)
        values (${organizationId}, ${org}, ${kind}, ${context.userId})
      `;
      await sql`
        insert into bridge_organization_members (organization_id, user_id, member_role)
        values (${organizationId}, ${context.userId}, ${"owner"})
      `;
    }

    await sql`
      insert into bridge_profiles (
        user_id, email, display_name, account_type, organization_name, organization_id, internal_role, email_verified, invited_by
      ) values (
        ${context.userId}, ${email}, ${data.displayName}, ${data.accountType}, ${org}, ${organizationId},
        ${internalRole}, ${verified}, ${invitedBy}
      )
    `;
    await writeAudit({
      actorUserId: context.userId,
      action: "profile.onboard",
      entityType: "bridge_profile",
      entityId: context.userId,
      metadata: { accountType: data.accountType, internalRole: internalRole ?? null },
    });
    const actor = await loadActor(context.userId);
    if (!actor) throw new Error("Profile create failed");
    if (!verified) {
      try {
        await sendVerificationNow({
          userId: context.userId,
          email,
          displayName: actor.displayName,
          throttle: false,
        });
      } catch {
        /* SMTP unset fails closed for mail only — account still exists unverified */
      }
    }
    return { home: workspaceHome(actor), profile: actor };
  });

export const requestEmailVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await loadActor(context.userId);
    const sql = await getSql();
    const emailRows = await sql<{ email: string }>`select email from "user" where id = ${context.userId} limit 1`;
    const email = actor?.email || emailRows[0]?.email;
    if (!email) throw new Error("No email on account");
    await sendVerificationNow({
      userId: context.userId,
      email,
      displayName: actor?.displayName,
      throttle: true,
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
    await sql`update "user" set "emailVerified" = true, "updatedAt" = now() where id = ${row.user_id}`;
    await writeAudit({
      actorUserId: row.user_id,
      action: "email.verified",
      entityType: "bridge_profile",
      entityId: row.user_id,
    });
    return { ok: true };
  });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const users = await sql<{ id: string; email: string }>`
      select id, email from "user" where lower(email) = ${data.email.toLowerCase()} limit 1
    `;
    if (users[0]) {
      const { token, hash } = tokenPair();
      const id = randomBytes(16).toString("hex");
      await sql`
        insert into bridge_email_challenges (id, user_id, email, purpose, token_hash, expires_at)
        values (${id}, ${users[0].id}, ${users[0].email}, ${"reset"}, ${hash}, ${new Date(Date.now() + 2 * 3600 * 1000).toISOString()})
      `;
      const url = `${bridgeEnv.appUrl()}/reset-password?token=${token}`;
      await mail({
        to: users[0].email,
        subject: "Reset your Crayons Bridge password",
        text: `Reset your password:\n\n${url}\n\nThis link expires in 2 hours. If you did not request it, ignore this email.`,
      });
    }
    return { sent: true };
  });

export const confirmPasswordReset = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(16), password: z.string().min(10).max(72) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const hash = createHash("sha256").update(data.token).digest("hex");
    const rows = await sql<{ id: string; user_id: string | null; expires_at: string; consumed_at: string | null }>`
      select id, user_id, expires_at, consumed_at from bridge_email_challenges
      where token_hash = ${hash} and purpose = 'reset' limit 1
    `;
    const row = rows[0];
    if (!row || row.consumed_at || !row.user_id || new Date(row.expires_at) < new Date()) {
      throw new Error("Reset link is invalid or expired");
    }
    const { hashPassword } = await import("better-auth/crypto");
    const passwordHash = await hashPassword(data.password);
    await sql`
      update account set password = ${passwordHash}, "updatedAt" = now()
      where "userId" = ${row.user_id} and "providerId" = 'credential'
    `;
    await sql`update bridge_email_challenges set consumed_at = now() where id = ${row.id}`;
    await writeAudit({
      actorUserId: row.user_id,
      action: "password.reset",
      entityType: "bridge_profile",
      entityId: row.user_id,
    });
    return { ok: true };
  });

export const inviteInternalRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ email: z.string().email(), role: z.enum(INTERNAL_ROLES) }))
  .handler(async ({ context, data }) => {
    const actor = await loadActor(context.userId);
    if (!actor) throw new Error("Profile required");
    assertPermission(actor, "users.invite_internal");
    const sql = await getSql();
    const { token, hash } = tokenPair();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_invites (id, email, internal_role, invited_by, token_hash, expires_at)
      values (${id}, ${data.email.toLowerCase()}, ${data.role}, ${context.userId}, ${hash}, ${new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()})
    `;
    const url = `${bridgeEnv.appUrl()}/signup?invite=${token}`;
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
