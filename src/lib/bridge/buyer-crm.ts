import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { sendBridgeMail } from "./mail.server";

const crmInput = z.object({
  companyName: z.string().trim().min(1).max(180),
  contactName: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  channelType: z.enum(["buyer", "channel_partner", "distributor", "aggregator", "other"]).default("buyer"),
  notes: z.string().trim().max(4000).optional(),
});
const uuid = z.string().uuid();

async function authorizedOrganization(userId: string) {
  const actor = await requireVerifiedActor(userId);
  if (actor.accountType !== "studio" || !actor.organizationId) {
    throw new Error("Buyer CRM is available only to verified Studio organization members.");
  }
  const sql = await getSql();
  const membership = await sql<{ membership_role: string }>`
    select m.membership_role
    from bridge_organization_memberships m
    join bridge_organizations o on o.id = m.organization_id and o.status = 'active'
    where m.organization_id = ${actor.organizationId}
      and m.user_id = ${actor.userId}
      and m.status = 'active'
    limit 1
  `;
  if (!membership.length || !["owner", "admin", "member"].includes(membership[0].membership_role)) {
    throw new Error("Active organization membership is required.");
  }
  return { actor, sql, organizationId: actor.organizationId };
}

export const listBuyerCrm = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const { actor, sql, organizationId } = await authorizedOrganization(context.userId);
    const rows = await sql<{
      id: string; company_name: string; contact_name: string | null; contact_email: string | null;
      contact_phone: string | null; channel_type: string; pipeline_status: string; notes: string | null;
      created_at: string; updated_at: string; title_count: number;
    }>`
      select c.id, c.company_name, c.contact_name, c.contact_email, c.contact_phone,
        c.channel_type, c.pipeline_status, c.notes, c.created_at, c.updated_at,
        count(ct.title_id)::int as title_count
      from bridge_buyer_crm c
      left join bridge_buyer_crm_titles ct on ct.crm_id = c.id
      where c.organization_id = ${organizationId}
      group by c.id
      order by c.updated_at desc
      limit 500
    `;
    return { actor: { organizationId, userId: actor.userId }, buyers: rows };
  });

export const createBuyerCrm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(crmInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { actor, sql, organizationId } = await authorizedOrganization(context.userId);
    const rows = await sql<{ id: string }>`
      insert into bridge_buyer_crm
        (organization_id, created_by, company_name, contact_name, contact_email, contact_phone, channel_type, notes)
      values
        (${organizationId}, ${actor.userId}, ${data.companyName}, ${data.contactName ?? null},
         ${data.contactEmail?.toLowerCase() ?? null}, ${data.contactPhone ?? null}, ${data.channelType}, ${data.notes ?? null})
      returning id
    `;
    await sql`
      insert into bridge_crm_audit_logs (organization_id, actor_user_id, crm_id, action, details)
      values (${organizationId}, ${actor.userId}, ${rows[0].id}::uuid, 'buyer.created',
        ${JSON.stringify({ channelType: data.channelType })}::jsonb)
    `;
    return { id: rows[0].id };
  });

export const updateBuyerCrmStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: uuid, status: z.enum(["target", "contacted", "qualified", "invited", "active", "negotiating", "won", "lost", "paused"]) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { actor, sql, organizationId } = await authorizedOrganization(context.userId);
    const rows = await sql<{ id: string }>`
      update bridge_buyer_crm set pipeline_status = ${data.status}, updated_at = now()
      where id = ${data.id}::uuid and organization_id = ${organizationId}
      returning id
    `;
    if (!rows.length) throw new Error("Buyer record not found in your organization.");
    await sql`
      insert into bridge_crm_audit_logs (organization_id, actor_user_id, crm_id, action, details)
      values (${organizationId}, ${actor.userId}, ${data.id}::uuid, 'buyer.status_changed',
        ${JSON.stringify({ status: data.status })}::jsonb)
    `;
    return { ok: true };
  });

export const inviteBuyerCrmContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ crmId: uuid, email: z.string().trim().email().max(320), idempotencyKey: z.string().min(8).max(120) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const { actor, sql, organizationId } = await authorizedOrganization(context.userId);
    const email = data.email.toLowerCase();
    const buyer = await sql<{ id: string; company_name: string }>`
      select id, company_name from bridge_buyer_crm
      where id = ${data.crmId}::uuid and organization_id = ${organizationId}
      limit 1
    `;
    if (!buyer.length) throw new Error("Buyer record not found in your organization.");
    const existing = await sql<{ id: string; status: string }>`
      select id, status from bridge_buyer_crm_invitations
      where organization_id = ${organizationId} and idempotency_key = ${data.idempotencyKey}
      limit 1
    `;
    if (existing.length) return { id: existing[0].id, status: existing[0].status, duplicate: true };

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const inviteRows = await sql<{ id: string }>`
      insert into bridge_buyer_crm_invitations
        (crm_id, organization_id, email, token_hash, idempotency_key, status, expires_at, created_by)
      values (${data.crmId}::uuid, ${organizationId}, ${email}, ${tokenHash},
        ${data.idempotencyKey}, 'pending', now() + interval '7 days', ${actor.userId})
      returning id
    `;
    const inviteId = inviteRows[0].id;
    try {
      // Never grant a Bridge role from this CRM invite. It is a contact invitation,
      // not an internal-role invitation. Acceptance is recorded separately.
      const { bridgeEnv } = await import("./env");
      const base = bridgeEnv.appUrl().replace(/\/$/, "");
      const url = `${base}/signup?buyer_invite=${encodeURIComponent(token)}`;
      await sendBridgeMail({
        to: email,
        subject: "Crayons Bridge — buyer workspace invitation",
        text: `You have been invited to connect with ${buyer[0].company_name} on Crayons Bridge.\n\nOpen: ${url}\n\nThis link expires in 7 days. This invitation does not grant internal or administrative access.\n`,
      });
      await sql`
        update bridge_buyer_crm_invitations set status = 'sent', sent_at = now(), updated_at = now()
        where id = ${inviteId}::uuid and organization_id = ${organizationId}
      `;
      await sql`
        update bridge_buyer_crm set pipeline_status = 'invited', updated_at = now()
        where id = ${data.crmId}::uuid and organization_id = ${organizationId}
      `;
      await sql`
        insert into bridge_crm_audit_logs (organization_id, actor_user_id, crm_id, invitation_id, action, details)
        values (${organizationId}, ${actor.userId}, ${data.crmId}::uuid, ${inviteId}::uuid,
          'buyer.invitation_sent', ${JSON.stringify({ email })}::jsonb)
      `;
      return { id: inviteId, status: "sent", duplicate: false };
    } catch (error) {
      await sql`
        update bridge_buyer_crm_invitations set status = 'failed', updated_at = now()
        where id = ${inviteId}::uuid and organization_id = ${organizationId}
      `;
      throw error;
    }
  });
