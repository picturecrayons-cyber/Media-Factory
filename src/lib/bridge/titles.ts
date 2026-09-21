import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { AccountType, TitleStatus } from "./types";
import { TITLE_STATUSES, type BridgeTitle } from "./types";
import { assertTransition, nextStatus } from "./lifecycle";
import { assertPermission, canReadTitle, permissionForTransition } from "./rbac";
import { requireActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { computeBlockers, rightsAreEvidenced, type RightsSnapshot } from "./blockers";

type TitleRow = {
  id: string;
  slug: string;
  name: string;
  name_ml: string | null;
  owner_user_id: string;
  organization_id: string | null;
  owner_account_type: string;
  status: string;
  synopsis: string;
  language: string;
  year: number | null;
  runtime_minutes: number | null;
  licensing_fee_paise: number;
  poster_key: string | null;
  master_key: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function asIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

export function mapTitle(r: TitleRow): BridgeTitle {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameMl: r.name_ml,
    ownerUserId: r.owner_user_id,
    organizationId: r.organization_id,
    ownerAccountType: r.owner_account_type as AccountType,
    status: r.status as TitleStatus,
    synopsis: r.synopsis,
    language: r.language,
    year: r.year,
    runtimeMinutes: r.runtime_minutes,
    licensingFeePaise: Number(r.licensing_fee_paise ?? 0),
    posterKey: r.poster_key,
    masterKey: r.master_key,
    createdAt: asIso(r.created_at),
    updatedAt: asIso(r.updated_at),
  };
}

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "title"}-${id.slice(0, 6)}`;
}

export async function loadTitle(id: string): Promise<BridgeTitle | null> {
  const sql = await getSql();
  const rows = await sql<TitleRow>`select * from bridge_titles where id = ${id} limit 1`;
  return rows[0] ? mapTitle(rows[0]) : null;
}

export async function recordTransition(opts: {
  titleId: string;
  from: TitleStatus | null;
  to: TitleStatus;
  actorUserId: string;
  note?: string;
}) {
  const sql = await getSql();
  await sql`
    update bridge_titles set status = ${opts.to}, updated_at = now() where id = ${opts.titleId}
  `;
  await sql`
    insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
    values (${opts.titleId}, ${opts.from}, ${opts.to}, ${opts.actorUserId}, ${opts.note ?? null})
  `;
}

export const createTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1).max(160),
      nameMl: z.string().max(160).optional(),
      synopsis: z.string().max(4000).optional(),
      language: z.string().min(2).max(40).optional(),
      year: z.number().int().min(1895).max(2100).optional(),
      runtimeMinutes: z.number().int().min(1).max(600).optional(),
      licensingFeePaise: z.number().int().min(0).max(50_000_000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.create");
    const id = randomBytes(16).toString("hex");
    const slug = slugify(data.name, id);
    const sql = await getSql();
    await sql`
      insert into bridge_titles (
        id, slug, name, name_ml, owner_user_id, organization_id, owner_account_type, status,
        synopsis, language, year, runtime_minutes, licensing_fee_paise
      ) values (
        ${id}, ${slug}, ${data.name}, ${data.nameMl ?? null}, ${actor.userId}, ${actor.organizationId ?? null}, ${actor.accountType},
        ${"DRAFT"}, ${data.synopsis ?? ""}, ${data.language ?? "Malayalam"},
        ${data.year ?? null}, ${data.runtimeMinutes ?? null}, ${data.licensingFeePaise ?? 0}
      )
    `;
    await recordTransition({
      titleId: id,
      from: null,
      to: "DRAFT",
      actorUserId: actor.userId,
      note: "created",
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.create",
      entityType: "bridge_title",
      entityId: id,
    });
    const title = await loadTitle(id);
    if (!title) throw new Error("Title create failed");
    return { title };
  });

export const listTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    let rows: TitleRow[];
    if (actor.internalRole) {
      assertPermission(actor, "title.read_catalog");
      rows = await sql<TitleRow>`select * from bridge_titles order by updated_at desc limit 200`;
    } else if (actor.accountType === "buyer") {
      assertPermission(actor, "title.read_catalog");
      rows = await sql<TitleRow>`
        select * from bridge_titles
        where status = 'LIVE_FOR_BUYERS'
        order by updated_at desc limit 200
      `;
    } else {
      assertPermission(actor, "title.read_own");
      if (actor.organizationId) {
        rows = await sql<TitleRow>`
          select * from bridge_titles
          where owner_user_id = ${actor.userId} or organization_id = ${actor.organizationId}
          order by updated_at desc limit 200
        `;
      } else {
        rows = await sql<TitleRow>`
          select * from bridge_titles where owner_user_id = ${actor.userId}
          order by updated_at desc limit 200
        `;
      }
    }
    return { titles: rows.map(mapTitle) };
  });

export const getTitle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const events = await sql<{
      from_status: string | null;
      to_status: string;
      actor_user_id: string;
      note: string | null;
      created_at: string | Date;
    }>`
      select from_status, to_status, actor_user_id, note, created_at
      from bridge_title_events where title_id = ${title.id} order by created_at asc
    `;
    const qcRows = await sql<{ decision: string; notes: string; created_at: string | Date; actor_user_id: string; checklist: string }>`
      select decision, notes, created_at, actor_user_id, checklist
      from bridge_qc_reviews where title_id = ${title.id} order by created_at desc limit 8
    `;
    const rightsRows = await sql<{
      territories: string;
      rights_type: string;
      media_type: string;
      start_date: string | null;
      end_date: string | null;
      exclusive: boolean;
      exclusions: string;
      chain_of_title_status: string;
      evidence_note: string;
      approved_by: string | null;
      approved_at: string | Date | null;
    }>`
      select territories, rights_type, media_type, start_date, end_date, exclusive, exclusions,
             chain_of_title_status, evidence_note, approved_by, approved_at
      from bridge_title_rights where title_id = ${title.id} limit 1
    `;
    const rightsRow = rightsRows[0];
    const rights: RightsSnapshot | null = rightsRow
      ? {
          approvedAt: rightsRow.approved_at
            ? rightsRow.approved_at instanceof Date
              ? rightsRow.approved_at.toISOString()
              : String(rightsRow.approved_at)
            : null,
          chainOfTitleStatus: rightsRow.chain_of_title_status,
          endDate: rightsRow.end_date,
          territories: rightsRow.territories,
          rightsType: rightsRow.rights_type,
          mediaType: rightsRow.media_type,
          evidenceNote: rightsRow.evidence_note,
        }
      : null;
    const captured = await sql<{ n: number }>`
      select count(*)::int as n from bridge_payments
      where title_id = ${title.id} and status = 'captured'
    `;
    const deliveries = await sql<{ n: number }>`
      select count(*)::int as n from bridge_deliveries where title_id = ${title.id}
    `;
    const blockers = computeBlockers({
      status: title.status,
      masterKey: title.masterKey,
      latestQc: (qcRows[0]?.decision as "pass" | "fail" | "request_changes") ?? null,
      rights,
      capturedLicense: Number(captured[0]?.n ?? 0) > 0,
      hasDelivery: Number(deliveries[0]?.n ?? 0) > 0,
    });
    return {
      title,
      liveForBuyers: title.status === "LIVE_FOR_BUYERS",
      blockers,
      events: events.map((e) => ({
        from: e.from_status,
        to: e.to_status,
        actorUserId: e.actor_user_id,
        note: e.note,
        createdAt: asIso(e.created_at),
      })),
      qc: qcRows.map((r) => ({
        decision: r.decision,
        notes: r.notes,
        actorUserId: r.actor_user_id,
        createdAt: asIso(r.created_at),
      })),
      rights: rightsRow
        ? {
            territories: rightsRow.territories,
            rightsType: rightsRow.rights_type,
            mediaType: rightsRow.media_type,
            startDate: rightsRow.start_date,
            endDate: rightsRow.end_date,
            exclusive: !!rightsRow.exclusive,
            exclusions: rightsRow.exclusions,
            chainOfTitleStatus: rightsRow.chain_of_title_status,
            evidenceNote: rightsRow.evidence_note,
            approvedBy: rightsRow.approved_by,
            approvedAt: rightsRow.approved_at ? asIso(rightsRow.approved_at) : null,
          }
        : null,
    };
  });

export const updateTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(8),
      name: z.string().min(1).max(160).optional(),
      nameMl: z.string().max(160).optional(),
      synopsis: z.string().max(4000).optional(),
      language: z.string().min(2).max(40).optional(),
      year: z.number().int().min(1895).max(2100).nullable().optional(),
      runtimeMinutes: z.number().int().min(1).max(600).nullable().optional(),
      licensingFeePaise: z.number().int().min(0).max(50_000_000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title) throw new Error("Not found");
    const owns = title.ownerUserId === actor.userId;
    if (owns) assertPermission(actor, "title.update_own");
    else assertPermission(actor, "title.license");
    if (owns && title.status !== "DRAFT" && title.status !== "UPLOADING" && title.status !== "PREPARING") {
      throw new Error("Title is locked after prepare");
    }
    const sql = await getSql();
    await sql`
      update bridge_titles set
        name = ${data.name ?? title.name},
        name_ml = ${data.nameMl ?? title.nameMl},
        synopsis = ${data.synopsis ?? title.synopsis},
        language = ${data.language ?? title.language},
        year = ${data.year === undefined ? title.year : data.year},
        runtime_minutes = ${data.runtimeMinutes === undefined ? title.runtimeMinutes : data.runtimeMinutes},
        licensing_fee_paise = ${data.licensingFeePaise ?? title.licensingFeePaise},
        updated_at = now()
      where id = ${title.id}
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "title.update",
      entityType: "bridge_title",
      entityId: title.id,
    });
    const next = await loadTitle(title.id);
    return { title: next };
  });

export const advanceTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(8),
      to: z.enum(TITLE_STATUSES),
      note: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    if (data.to === "LICENSED") {
      throw new Error("LICENSED is granted only after a captured Razorpay payment");
    }
    if (data.to === "QC_REVIEW" && !title.masterKey) {
      throw new Error("Required asset missing");
    }
    if (data.to === "LIVE_FOR_BUYERS") {
      const sql = await getSql();
      const rightsRows = await sql<{
        territories: string;
        rights_type: string;
        media_type: string;
        chain_of_title_status: string;
        evidence_note: string;
        approved_at: string | Date | null;
        end_date: string | null;
      }>`
        select territories, rights_type, media_type, chain_of_title_status, evidence_note, approved_at, end_date
        from bridge_title_rights where title_id = ${title.id} limit 1
      `;
      const r = rightsRows[0];
      if (!r?.approved_at || !rightsAreEvidenced({
        approvedAt: r.approved_at ? String(r.approved_at) : null,
        chainOfTitleStatus: r.chain_of_title_status,
        endDate: r.end_date,
        territories: r.territories,
        rightsType: r.rights_type,
        mediaType: r.media_type,
        evidenceNote: r.evidence_note,
      })) {
        throw new Error("Rights review pending");
      }
    }
    assertTransition(title.status, data.to);
    const perm = permissionForTransition(title.status, data.to);
    if (!perm) throw new Error("Transition is not available");
    assertPermission(actor, perm);
    if (perm === "title.advance_upload" && title.ownerUserId !== actor.userId && !actor.internalRole) {
      throw new Error("Forbidden");
    }
    const expected = nextStatus(title.status);
    if (expected !== data.to) throw new Error("Illegal title transition");
    await recordTransition({
      titleId: title.id,
      from: title.status,
      to: data.to,
      actorUserId: actor.userId,
      note: data.note,
    });
    await writeAudit({
      actorUserId: actor.userId,
      actorRole: actor.internalRole,
      action: "title.advance",
      entityType: "bridge_title",
      entityId: title.id,
      previousState: title.status,
      newState: data.to,
      reason: data.note ?? null,
      metadata: { from: title.status, to: data.to },
    });
    return { title: await loadTitle(title.id) };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireActor(context.userId);
    assertPermission(actor, "audit.read");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      actor_user_id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      metadata: string;
      previous_state: string | null;
      new_state: string | null;
      reason: string | null;
      created_at: string | Date;
    }>`
      select id, actor_user_id, action, entity_type, entity_id, metadata,
             previous_state, new_state, reason, created_at
      from bridge_audit_logs order by created_at desc limit 100
    `;
    return {
      logs: rows.map((r) => ({
        id: Number(r.id),
        actorUserId: r.actor_user_id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata,
        previousState: r.previous_state,
        newState: r.new_state,
        reason: r.reason,
        createdAt: asIso(r.created_at),
      })),
    };
  });

export const reverseTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().min(8),
      to: z.enum(TITLE_STATUSES),
      reason: z.string().min(12).max(500),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "title.reverse");
    const title = await loadTitle(data.id);
    if (!title) throw new Error("Not found");
    if (data.to === title.status) throw new Error("Title is already in that state");
    if (data.to === "LICENSED") {
      throw new Error("LICENSED is granted only after a captured Razorpay payment");
    }
    await recordTransition({
      titleId: title.id,
      from: title.status,
      to: data.to,
      actorUserId: actor.userId,
      note: data.reason,
    });
    await writeAudit({
      actorUserId: actor.userId,
      actorRole: actor.internalRole,
      action: "title.reverse",
      entityType: "bridge_title",
      entityId: title.id,
      previousState: title.status,
      newState: data.to,
      reason: data.reason,
    });
    return { title: await loadTitle(title.id) };
  });
