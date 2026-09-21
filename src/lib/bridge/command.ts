import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { integrationStatus, bridgeEnv } from "./env";
import { integrationLabel } from "./integration-health";
import { writeAudit } from "./audit";
import { TRANSACTIONAL_FROM } from "./canonical";

async function countOrZero(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch {
    return 0;
  }
}

export const getCommandSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    if (!actor.internalRole) throw new Error("Internal desk only");
    assertPermission(actor, "directory.read");
    const sql = await getSql();
    const titles = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_titles`;
      return Number(r[0]?.n ?? 0);
    });
    const qc = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_titles where status = ${"QC_REVIEW"}`;
      return Number(r[0]?.n ?? 0);
    });
    const legal = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_titles where status = ${"RIGHTS_REVIEW"}`;
      return Number(r[0]?.n ?? 0);
    });
    const licensed = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_titles where status = ${"LICENSED"}`;
      return Number(r[0]?.n ?? 0);
    });
    const submissions = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_submissions`;
      return Number(r[0]?.n ?? 0);
    });
    const orgs = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_organizations`;
      return Number(r[0]?.n ?? 0);
    });
    const people = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_profiles`;
      return Number(r[0]?.n ?? 0);
    });
    const captured = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_payments where status = ${"captured"}`;
      return Number(r[0]?.n ?? 0);
    });
    const deals = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_deals where status <> ${"closed"}`;
      return Number(r[0]?.n ?? 0);
    });
    const partners = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_partners`;
      return Number(r[0]?.n ?? 0);
    });
    const assets = await countOrZero(async () => {
      const r = await sql<{ n: number }>`select count(*)::int as n from bridge_assets`;
      return Number(r[0]?.n ?? 0);
    });
    return {
      titles,
      qc,
      legal,
      licensed,
      submissions,
      orgs,
      people,
      captured,
      deals,
      partners,
      assets,
    };
  });

export const listDirectory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "directory.read");
    const sql = await getSql();
    const people = await sql<{
      email: string;
      display_name: string;
      account_type: string;
      organization_name: string | null;
      internal_role: string | null;
      email_verified: boolean;
    }>`
      select email, display_name, account_type, organization_name, internal_role, email_verified
      from bridge_profiles order by display_name limit 200
    `;
    const orgs = await sql<{ id: string; name: string; kind: string }>`
      select id, name, kind from bridge_organizations order by name limit 200
    `;
    let partners: { id: string; invited_email: string; kind: string; status: string }[] = [];
    try {
      partners = await sql<{ id: string; invited_email: string; kind: string; status: string }>`
        select id, invited_email, kind, status from bridge_partners order by created_at desc limit 200
      `;
    } catch {
      partners = [];
    }
    return {
      people: people.map((p) => ({
        email: p.email,
        displayName: p.display_name,
        accountType: p.account_type,
        organizationName: p.organization_name,
        internalRole: p.internal_role,
        emailVerified: !!p.email_verified,
      })),
      organizations: orgs,
      partners,
    };
  });

export const listAllSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    try {
      const rows = await sql<{
        id: string;
        title_id: string;
        title_name: string;
        status: string;
        screener_status: string;
      }>`
        select s.id, s.title_id, t.name as title_name, s.status, s.screener_status
        from bridge_submissions s
        join bridge_titles t on t.id = s.title_id
        order by s.created_at desc limit 200
      `;
      return {
        submissions: rows.map((r) => ({
          id: r.id,
          titleId: r.title_id,
          titleName: r.title_name,
          status: r.status,
          screenerStatus: r.screener_status,
        })),
      };
    } catch {
      return { submissions: [] as const, schemaPending: true };
    }
  });

export const probeIntegrations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "integrations.read");
    const bound = integrationStatus();
    let postgresOk: boolean | null = null;
    try {
      const sql = await getSql();
      const r = await sql<{ ok: number }>`select 1 as ok`;
      postgresOk = Number(r[0]?.ok) === 1;
    } catch {
      postgresOk = false;
    }
    let s3Ok: boolean | null = null;
    if (bound.s3) {
      try {
        const { probePrivateBucket } = await import("./s3.server");
        s3Ok = await probePrivateBucket();
      } catch {
        s3Ok = false;
      }
    }
    return {
      postgres: integrationLabel({ bound: bound.postgres, probedOk: postgresOk }),
      supabase: integrationLabel({ bound: bound.supabase }),
      razorpay: integrationLabel({ bound: bound.razorpay }),
      razorpayWebhook: integrationLabel({ bound: bound.razorpayWebhook }),
      s3: integrationLabel({ bound: bound.s3, probedOk: s3Ok }),
      mail: integrationLabel({ bound: bound.mail }),
      loop: integrationLabel({ bound: bound.loop }),
      whatsapp: "not_configured" as const,
      youtube: "not_configured" as const,
      cloudfront: "not_configured" as const,
    };
  });

export const invitePartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().email(),
      kind: z.enum([
        "creator",
        "studio",
        "buyer",
        "distributor",
        "platform",
        "brand",
        "agency",
        "broadcaster",
        "other",
      ]),
      displayName: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "partner.invite");
    const sql = await getSql();
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_partners (
        id, kind, status, invited_email, display_name, invited_by, token_hash, expires_at
      ) values (
        ${id}, ${data.kind}, ${"pending"}, ${data.email.toLowerCase()}, ${data.displayName ?? ""},
        ${actor.userId}, ${hash}, ${new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()}
      )
    `;
    const url = `${bridgeEnv.appUrl()}/signup?partner=${token}`;
    const { sendBridgeMail } = await import("./mail.server");
    await sendBridgeMail({
      to: data.email,
      subject: "Crayons Bridge partner invitation",
      text: `You were invited as a ${data.kind} partner on Crayons Bridge (StreamVista OPC Pvt Ltd).\n\n${url}\n\nThis is not Loop consumer access. From ${TRANSACTIONAL_FROM}.`,
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "partner.invite",
      entityType: "bridge_partner",
      entityId: id,
      metadata: { kind: data.kind },
    });
    return { sent: true, channel: "email" as const, whatsapp: "not_configured" as const };
  });
