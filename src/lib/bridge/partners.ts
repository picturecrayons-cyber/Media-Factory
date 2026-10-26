import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

async function ensurePartners() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists bridge_publishing_partners (
      id text primary key,
      name text not null,
      kind text not null,
      share_pct integer not null,
      contract_ref text,
      contact text,
      created_at timestamptz not null default now()
    )
  `);
  return sql;
}

export const listPublishingPartners = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await ensurePartners();
    const rows = await sql<{
      id: string;
      name: string;
      kind: string;
      share_pct: number;
      contract_ref: string | null;
      contact: string | null;
    }>`
      select id, name, kind, share_pct, contract_ref, contact
      from bridge_publishing_partners
      order by created_at desc
      limit 50
    `;
    return {
      partners: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind === "in_house" ? "in_house" : "external",
        sharePct: Number(row.share_pct),
        contractRef: row.contract_ref || "",
        contact: row.contact || "",
      })),
    };
  });

export const savePublishingPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    name: z.string().trim().min(2).max(120),
    kind: z.enum(["external", "in_house"]),
    sharePct: z.number().int().min(0).max(100),
    contractRef: z.string().trim().max(80).optional(),
    contact: z.string().trim().max(120).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await ensurePartners();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_publishing_partners (id, name, kind, share_pct, contract_ref, contact)
      values (${id}, ${data.name}, ${data.kind}, ${data.sharePct}, ${data.contractRef || null}, ${data.contact || null})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "partner.created",
      entityType: "bridge_publishing_partner",
      entityId: id,
      metadata: { name: data.name, kind: data.kind, sharePct: data.sharePct },
    });
    return { id };
  });
