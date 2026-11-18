import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

/** Read-only view of the canonical organization and membership records. No invitations are sent. */
export const listSuperAdminOrganizationGovernance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [organizations, memberships] = await Promise.all([
      sql<{
        id: string;
        legal_name: string;
        status: string;
        created_at: string | Date;
        member_count: number | string;
      }>`
        select o.id, o.legal_name, o.status, o.created_at,
               count(m.user_id)::int as member_count
        from bridge_organizations o
        left join bridge_organization_memberships m on m.organization_id = o.id
        group by o.id
        order by o.created_at desc
        limit 200
      `,
      sql<{
        organization_id: string;
        legal_name: string;
        user_id: string;
        display_name: string;
        account_type: string;
        membership_role: string;
        status: string;
        created_at: string | Date;
      }>`
        select m.organization_id, o.legal_name, bp.user_id, bp.display_name,
               bp.account_type, m.membership_role, m.status, m.created_at
        from bridge_organization_memberships m
        join bridge_organizations o on o.id = m.organization_id
        join bridge_profiles bp on bp.user_id = m.user_id
        order by m.created_at desc
        limit 300
      `,
    ]);

    return {
      organizations: organizations.map((row) => ({
        id: row.id,
        legalName: row.legal_name,
        status: row.status,
        memberCount: Number(row.member_count),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      memberships: memberships.map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.legal_name,
        userReference: row.user_id,
        displayName: row.display_name,
        accountType: row.account_type,
        role: row.membership_role,
        status: row.status,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      invitationWorkflow: process.env.BRIDGE_SUPER_ADMIN_ORG_WRITES === "true" ? "PREVIEW_ENABLED" : "DISABLED",
      mutationsEnabled: process.env.BRIDGE_SUPER_ADMIN_ORG_WRITES === "true",
    };
  });

import { createHash, randomBytes } from "node:crypto";
const membershipRole = z.enum(["admin","member","producer","dit"]);
function assertOrganizationWritesEnabled() {
  if (process.env.BRIDGE_SUPER_ADMIN_ORG_WRITES !== "true") {
    throw new Error("Organization invitations and membership changes are disabled until the Preview-only feature flag is explicitly enabled");
  }
}

export const createSuperAdminOrganizationInvite = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({organizationId:z.string().uuid(),email:z.string().email(),role:membershipRole}))
  .handler(async({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
    assertOrganizationWritesEnabled();
    const sql=await getSql();
    const orgs=await sql<{id:string;status:string}>`select id,status from bridge_organizations where id=${data.organizationId}::uuid limit 1`;
    if(!orgs[0]||orgs[0].status!=="active") throw new Error("Active organization not found");
    const token=randomBytes(32).toString("hex");
    const tokenHash=createHash("sha256").update(token).digest("hex");
    const created=await sql.transaction(async tx=>{
      const rows=await tx<{id:string;expires_at:string|Date}>`
        insert into private.bridge_organization_invites
          (organization_id,invitee_email,membership_role,token_hash,invited_by,expires_at)
        values (${data.organizationId}::uuid,${data.email.trim().toLowerCase()},${data.role},${tokenHash},${context.userId},now()+interval '7 days')
        returning id,expires_at
      `;
      await writeAudit({actorUserId:context.userId,action:"organization.invite_created",entityType:"bridge_organization_invite",entityId:rows[0].id,metadata:{organizationId:data.organizationId,role:data.role,inviteeEmail:data.email.trim().toLowerCase(),emailSent:false}},tx);
      return rows[0];
    });
    return {inviteId:created.id,inviteToken:token,expiresAt:created.expires_at instanceof Date?created.expires_at.toISOString():String(created.expires_at),emailSent:false};
  });

export const acceptSuperAdminOrganizationInvite = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({token:z.string().regex(/^[a-f0-9]{64}$/i)}))
  .handler(async({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if(!actor.emailVerified||!actor.email) throw new Error("Verified email is required");
    if(actor.accountType!=="studio"||actor.internalRole) throw new Error("A verified Studio account is required");
    assertOrganizationWritesEnabled();
    const hash=createHash("sha256").update(data.token).digest("hex");
    const sql=await getSql();
    return sql.transaction(async tx=>{
      const rows=await tx<{id:string;organization_id:string;invitee_email:string;membership_role:string;expires_at:string|Date;accepted_at:string|Date|null;revoked_at:string|Date|null}>`
        select id,organization_id,invitee_email,membership_role,expires_at,accepted_at,revoked_at
        from private.bridge_organization_invites where token_hash=${hash} for update
      `;
      const invite=rows[0];
      if(!invite||invite.accepted_at||invite.revoked_at||new Date(invite.expires_at).getTime()<Date.now()) throw new Error("Organization invitation is invalid, expired or already used");
      if(invite.invitee_email.trim().toLowerCase()!==actor.email.trim().toLowerCase()) throw new Error("Invitation email does not match the verified account");
      const profiles=await tx<{organization_id:string|null}>`select organization_id from bridge_profiles where user_id=${actor.userId} for update`;
      if(!profiles[0]) throw new Error("Bridge profile not found");
      if(profiles[0].organization_id&&profiles[0].organization_id!==invite.organization_id) throw new Error("Account is already linked to another organization");
      const orgs=await tx<{id:string}>`select id from bridge_organizations where id=${invite.organization_id}::uuid and status='active' limit 1`;
      if(!orgs[0]) throw new Error("Organization is not active");
      const membership = await tx<{ user_id: string }>`insert into bridge_organization_memberships(organization_id,user_id,membership_role,status,created_by)
        values(${invite.organization_id}::uuid,${actor.userId},${invite.membership_role},'active',${context.userId})
        on conflict(organization_id,user_id) do nothing returning user_id`;
      if (!membership[0]) throw new Error("A membership already exists for this account; ask an administrator to review it");
      await tx`update bridge_profiles set organization_id=${invite.organization_id}::uuid,updated_at=now() where user_id=${actor.userId}`;
      await tx`update private.bridge_organization_invites set accepted_by=${actor.userId},accepted_at=now() where id=${invite.id}::uuid`;
      await writeAudit({actorUserId:actor.userId,action:"organization.invite_accepted",entityType:"bridge_organization_invite",entityId:invite.id,metadata:{organizationId:invite.organization_id,role:invite.membership_role}},tx);
      return {accepted:true,organizationId:invite.organization_id,role:invite.membership_role};
    });
  });

export const updateSuperAdminOrganizationMembership = createServerFn({method:"POST"})
  .middleware([authMiddleware])
  .validator(z.object({organizationId:z.string().uuid(),userId:z.string().min(1),role:membershipRole,status:z.enum(["active","suspended","removed"]),evidenceReference:z.string().trim().min(8).max(256)}))
  .handler(async({context,data})=>{
    assertNotDevUser(context.userId);
    const actor=await requireVerifiedActor(context.userId);
    if(actor.internalRole!=="super_admin") throw new Error("Super Admin access required");
    assertOrganizationWritesEnabled();
    const sql=await getSql();
    await sql.transaction(async tx=>{
      const rows=await tx<{membership_role:string;status:string;internal_role:string|null;email_verified:boolean}>`
        select m.membership_role,m.status,p.internal_role,p.email_verified
        from bridge_organization_memberships m join bridge_profiles p on p.user_id=m.user_id
        where m.organization_id=${data.organizationId}::uuid and m.user_id=${data.userId} for update
      `;
      const current=rows[0];
      if(!current) throw new Error("Organization membership not found");
      if(current.membership_role==="owner") throw new Error("Organization owner membership is protected");
      if(current.internal_role==="super_admin") throw new Error("Super Admin profile membership cannot be changed here");
      if(!current.email_verified) throw new Error("Member email must be verified");
      await tx`update bridge_organization_memberships set membership_role=${data.role},status=${data.status},updated_at=now()
        where organization_id=${data.organizationId}::uuid and user_id=${data.userId}`;
      if (data.status === "removed") {
        await tx`update bridge_profiles set organization_id=null,updated_at=now()
          where user_id=${data.userId} and organization_id=${data.organizationId}::uuid`;
      }
      await writeAudit({actorUserId:context.userId,action:"organization.membership_changed",entityType:"bridge_organization_membership",entityId:data.userId,metadata:{organizationId:data.organizationId,fromRole:current.membership_role,toRole:data.role,fromStatus:current.status,toStatus:data.status,evidenceReference:data.evidenceReference,evidenceVerified:false}},tx);
    });
    return {updated:true,evidenceVerified:false};
  });
