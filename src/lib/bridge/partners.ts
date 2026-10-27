import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

let partnersReady = false;

async function ensurePartners() {
  const sql = await getSql();
  if (partnersReady) return sql;
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
  await sql.query(`alter table bridge_publishing_partners add column if not exists public_url text`);
  await sql`
    insert into bridge_publishing_partners (id, name, kind, share_pct, contract_ref, contact, public_url)
    values ('crayons-loop', 'Crayons Loop', 'in_house', 50, 'in-house', 'Sarin Chandrashekharan', 'https://crayonsloop.in/')
    on conflict (id) do update set
      public_url = excluded.public_url,
      contact = excluded.contact,
      share_pct = excluded.share_pct
  `;
  partnersReady = true;
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
      public_url: string | null;
    }>`
      select id, name, kind, share_pct, contract_ref, contact, public_url
      from bridge_publishing_partners
      order by created_at desc
      limit 50
    `;
    return {
      partners: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind === "in_house" ? "in_house" as const : "external" as const,
        sharePct: Number(row.share_pct),
        contractRef: row.contract_ref || "",
        contact: row.contact || "",
        publicUrl: row.public_url || "",
      })),
    };
  });

export const listPublicPartners = createServerFn({ method: "GET" })
  .handler(async () => {
    const sql = await ensurePartners();
    const rows = await sql<{ name: string; public_url: string | null }>`
      select name, public_url
      from bridge_publishing_partners
      where public_url is not null
      order by created_at asc
      limit 12
    `;
    return {
      partners: rows.map((row) => ({
        name: row.name,
        line: "Official consumer streaming partner",
        publicUrl: row.public_url || "",
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

export const updatePublishingPartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().min(8),
    sharePct: z.number().int().min(0).max(100),
    contractRef: z.string().trim().max(80).optional(),
    contact: z.string().trim().max(120).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await ensurePartners();
    await sql`
      update bridge_publishing_partners
      set share_pct = ${data.sharePct}, contract_ref = ${data.contractRef || null}, contact = ${data.contact || null}
      where id = ${data.id}
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "partner.updated",
      entityType: "bridge_publishing_partner",
      entityId: data.id,
      metadata: { sharePct: data.sharePct },
    });
    return { id: data.id };
  });

async function ensureDeals() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists bridge_outlet_deals (
      id text primary key,
      title_id text not null,
      outlet text not null,
      model text not null,
      territory text not null,
      window_start date,
      window_end date,
      share_pct integer not null,
      actor_user_id text not null,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists bridge_screener_requests (
      id text primary key,
      title_id text not null,
      buyer_user_id text not null,
      days integer not null,
      status text not null default 'requested',
      created_at timestamptz not null default now()
    )
  `);
  return sql;
}

export const recordOutletDeal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    outlet: z.enum(["buyer", "platform"]),
    model: z.enum(["TVOD", "SVOD", "AVOD"]),
    territory: z.string().trim().min(2).max(32),
    windowStart: z.string().min(8),
    windowEnd: z.string().min(8),
    sharePct: z.number().int().min(0).max(100),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    if (new Date(data.windowEnd) <= new Date(data.windowStart)) throw new Error("The license must end after it starts");
    const sql = await ensureDeals();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_outlet_deals (id, title_id, outlet, model, territory, window_start, window_end, share_pct, actor_user_id)
      values (${id}, ${data.titleId}, ${data.outlet}, ${data.model}, ${data.territory}, ${data.windowStart}, ${data.windowEnd}, ${data.sharePct}, ${actor.userId})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "deal.authorized",
      entityType: "bridge_outlet_deal",
      entityId: id,
      metadata: { titleId: data.titleId, outlet: data.outlet, model: data.model, territory: data.territory, sharePct: data.sharePct, sublicense: false },
    });
    return { id };
  });

export const listOutletActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "loop.publish");
    const sql = await ensureDeals();
    const deals = await sql<{ id: string; title_id: string; outlet: string; model: string; territory: string }>`
      select id, title_id, outlet, model, territory from bridge_outlet_deals order by created_at desc limit 12
    `;
    const screeners = await sql<{ id: string; title_id: string; days: number; status: string }>`
      select id, title_id, days, status from bridge_screener_requests order by created_at desc limit 12
    `;
    return {
      deals: deals.map((row) => ({ id: row.id, titleId: row.title_id, outlet: row.outlet, model: row.model, territory: row.territory })),
      screeners: screeners.map((row) => ({ id: row.id, titleId: row.title_id, days: row.days, status: row.status })),
    };
  });

export const requestScreener = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8), days: z.number().int().min(1).max(14).default(3) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "buyer" && !actor.internalRole) throw new Error("Only a buyer can request a screener");
    const sql = await ensureDeals();
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_screener_requests (id, title_id, buyer_user_id, days)
      values (${id}, ${data.titleId}, ${actor.userId}, ${data.days})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "screener.requested",
      entityType: "bridge_screener_request",
      entityId: id,
      metadata: { titleId: data.titleId, days: data.days },
    });
    return { id };
  });

