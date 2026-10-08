import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import type { AccountType, TitleStatus } from "./types";
import { TITLE_STATUSES, type BridgeTitle } from "./types";
import { assertTransition, nextStatus } from "./lifecycle";
import { assertPermission, canMutateTitle, canReadTitle, hasPermission, hasStaffPermission, permissionForTransition } from "./rbac";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { loopStageType } from "./loop-lanes";
import { assertBuyerPublishable, getBuyerGateStatus } from "./buyer-visibility";

type TitleRow = {
  id: string;
  slug: string;
  name: string;
  name_ml: string | null;
  owner_user_id: string;
  owner_account_type: string;
  status: string;
  synopsis: string;
  language: string;
  year: number | null;
  runtime_minutes: number | null;
  licensing_fee_paise: number;
  poster_key: string | null;
  master_key: string | null;
  content_type: string;
  country_of_origin: string | null;
  release_date: string | Date | null;
  credits: Array<{ role: string; name: string }>;
  created_at: string | Date;
  updated_at: string | Date;
};

function asIso(v: string | Date | null | undefined): string {
  if (v == null) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

export function mapTitle(r: TitleRow): BridgeTitle {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameMl: r.name_ml,
    ownerUserId: r.owner_user_id,
    ownerAccountType: r.owner_account_type as AccountType,
    status: r.status as TitleStatus,
    synopsis: r.synopsis,
    language: r.language,
    year: r.year,
    runtimeMinutes: r.runtime_minutes,
    licensingFeePaise: Number(r.licensing_fee_paise ?? 0),
    posterKey: r.poster_key,
    masterKey: r.master_key,
    contentType: r.content_type,
    countryOfOrigin: r.country_of_origin,
    releaseDate: r.release_date ? asIso(r.release_date) : null,
    credits: r.credits,
    createdAt: asIso(r.created_at),
    updatedAt: asIso(r.updated_at),
  };
}

async function hasTitleMergeColumn(sql: Sql): Promise<boolean> {
  const rows = await sql<{ exists: boolean }>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bridge_titles'
        and column_name = 'merged_into_title_id'
    ) as exists
  `;
  return Boolean(rows[0]?.exists);
}

async function listCatalog(sql: Sql): Promise<TitleRow[]> {
  if (!(await hasTitleMergeColumn(sql))) {
    return sql<TitleRow>`select * from bridge_titles order by updated_at desc limit 200`;
  }
  return sql<TitleRow>`select * from bridge_titles where merged_into_title_id is null order by updated_at desc limit 200`;
}

async function listOwned(sql: Sql, userId: string, organizationName: string | null): Promise<TitleRow[]> {
  const org = organizationName?.trim() || null;
  const mergeColumnAvailable = await hasTitleMergeColumn(sql);
  if (!org) {
    return mergeColumnAvailable
      ? sql<TitleRow>`
          select * from bridge_titles
          where owner_user_id = ${userId} and merged_into_title_id is null
          order by updated_at desc limit 200
        `
      : sql<TitleRow>`select * from bridge_titles where owner_user_id = ${userId} order by updated_at desc limit 200`;
  }
  return mergeColumnAvailable
    ? sql<TitleRow>`
        select t.* from bridge_titles t
        where t.merged_into_title_id is null
          and (
            t.owner_user_id = ${userId}
            or t.owner_user_id in (
              select user_id from bridge_profiles
              where organization_name is not null and lower(organization_name) = lower(${org})
            )
          )
        order by t.updated_at desc limit 200
      `
    : sql<TitleRow>`
        select t.* from bridge_titles t
        where t.owner_user_id = ${userId}
          or t.owner_user_id in (
            select user_id from bridge_profiles
            where organization_name is not null and lower(organization_name) = lower(${org})
          )
        order by t.updated_at desc limit 200
      `;
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

export async function recordTransition(
  opts: {
    titleId: string;
    from: TitleStatus | null;
    to: TitleStatus;
    actorUserId: string;
    note?: string;
  },
  transaction?: Sql,
) {
  const sql = transaction ?? (await getSql());
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
      originalTitle: z.string().max(160).optional(),
      synopsis: z.string().min(20).max(4000).optional(),
      language: z.string().min(2).max(40).optional(),
      additionalLanguages: z.array(z.string().min(2).max(40)).max(20).optional(),
      year: z.number().int().min(1895).max(2100).optional(),
      runtimeMinutes: z.number().int().min(1).max(600).optional(),
      licensingFeePaise: z.number().int().min(0).max(2_000_000_000).optional(),
      contentType: z.string().min(1).max(80).optional(),
      countryOfOrigin: z.string().max(80).optional(),
      releaseDate: z.string().max(40).optional(),
      director: z.string().max(160).optional(),
      producer: z.string().max(200).optional(),
      cast: z.array(z.string().min(1).max(160)).max(100).optional(),
      territories: z.array(z.string().min(2).max(80)).min(1).max(250).optional(),
      rightsLanguages: z.array(z.string().min(2).max(40)).min(1).max(20).optional(),
      media: z.array(z.string().min(2).max(40)).min(1).max(20).optional(),
      windowStart: z.string().max(40).optional(),
      windowEnd: z.string().max(40).optional(),
      exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]).optional(),
      holdbacks: z.array(z.string().min(1).max(120)).max(50).optional(),
      sublicensingAllowed: z.boolean().optional(),
      promotionalRights: z.boolean().optional(),
      rightsBasis: z.enum(["OWNER", "EXCLUSIVE_LICENSEE", "AUTHORIZED_DISTRIBUTOR", "PRODUCER_AUTHORITY"]).optional(),
      authorizationAttested: z.boolean().optional(),
      screenerAccess: z.enum(["BRIDGE_PRIVATE_SCREENER", "SCREENER_PENDING"]).optional(),
      intendedDestinations: z.array(z.string().min(2).max(80)).min(1).max(20).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "title.create");
    const id = randomBytes(16).toString("hex");
    const slug = slugify(data.name, id);
    const sql = await getSql();
    await sql`
      insert into bridge_titles (
        id, slug, name, name_ml, owner_user_id, owner_account_type, status,
        synopsis, language, year, runtime_minutes, licensing_fee_paise,
        content_type, country_of_origin, release_date, credits
      ) values (
        ${id}, ${slug}, ${data.name}, ${data.nameMl ?? null}, ${actor.userId}, ${actor.accountType},
        ${"DRAFT"}, ${data.synopsis ?? ""}, ${data.language ?? "Malayalam"},
        ${data.year ?? null}, ${data.runtimeMinutes ?? null}, ${data.licensingFeePaise ?? 0},
        ${loopStageType(data.contentType)}, ${data.countryOfOrigin ?? null},
        ${data.releaseDate ?? null}, ${JSON.stringify([
          ...(data.director ? [{ role: "Director", name: data.director }] : []),
          ...(data.producer ? [{ role: "Producer", name: data.producer }] : []),
          ...(data.cast ?? []).map((name) => ({ role: "Cast", name })),
        ])}::jsonb
      )
    `;
    const isPublicSubmission = Boolean((data as { publicSubmission?: boolean }).publicSubmission);
    await recordTransition({
      titleId: id,
      from: null,
      to: "DRAFT",
      actorUserId: actor.userId,
      note: isPublicSubmission ? "public rights-ready submission received" : "created",
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: isPublicSubmission ? "title.public_submission" : "title.create",
      entityType: "bridge_title",
      entityId: id,
      metadata: { publicSubmission: isPublicSubmission },
    });
    const title = await loadTitle(id);
    if (!title) throw new Error("Title create failed");
    return { title, submission: isPublicSubmission };
  });

export const listTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    let rows: TitleRow[] = [];
    if (actor.internalRole && hasPermission(actor, "title.read_catalog")) {
      rows = await listCatalog(sql);
    } else if (actor.accountType === "buyer") {
      assertPermission(actor, "title.read_catalog");
      if (await hasTitleMergeColumn(sql)) {
        rows = await sql<TitleRow>`
          select t.* from bridge_titles t
          where t.merged_into_title_id is null
            and t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
            and public.bridge_title_buyer_visibility(t.id)
          order by t.updated_at desc limit 200
        `;
      } else {
        rows = await sql<TitleRow>`
          select t.* from bridge_titles t
          where t.status in ('LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED')
            and public.bridge_title_buyer_visibility(t.id)
          order by t.updated_at desc limit 200
        `;
      }
    } else {
      assertPermission(actor, "title.read_own");
      rows = await listOwned(sql, actor.userId, actor.accountType === "studio" ? actor.organizationName : null);
    }
    return { titles: rows.flatMap((row) => {
      try {
        return [mapTitle(row)];
      } catch (error) {
        console.error("[bridge] skipped unreadable title", row?.id, error);
        return [];
      }
    }) };
  });

export const getTitle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title) throw new Error("Not found");
    const sql = await getSql();
    if (actor.accountType === "investor" && !actor.internalRole) {
      const assigned = await sql<{ id: string }>
        `select id from bridge_title_investors where title_id = ${title.id} and investor_user_id = ${actor.userId} limit 1`;
      if (!assigned[0]) throw new Error("Not found");
    } else if (!canReadTitle(actor, title)) {
      if (actor.accountType !== "buyer") throw new Error("Not found");
      await assertBuyerPublishable(title.id);
    }
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
    return {
      title,
      events: events.map((e) => ({
        from: e.from_status,
        to: e.to_status,
        actorUserId: e.actor_user_id,
        note: e.note,
        createdAt: asIso(e.created_at),
      })),
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
      licensingFeePaise: z.number().int().min(0).max(2_000_000_000).optional(),
      contentType: z.string().min(1).max(80).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title) throw new Error("Not found");
    const owns = title.ownerUserId === actor.userId && !actor.internalRole;
    if (!canMutateTitle(actor, title, "title.update_own", "title.license"))
      throw new Error("Forbidden");
    if (
      owns &&
      title.status !== "DRAFT" &&
      title.status !== "UPLOADING" &&
      title.status !== "PREPARING"
    ) {
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
        content_type = ${data.contentType ? loopStageType(data.contentType) : title.contentType},
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

async function assertLicensingReady(titleId: string) {
  const sql = await getSql();
  const rows = await sql<{
    metadata_ok: boolean;
    rights_ok: boolean;
    rights_evidence_ok: boolean;
    legal_ok: boolean;
    legal_evidence_ok: boolean;
    qc_ok: boolean;
    screener_ok: boolean;
    master_ok: boolean;
    poster_ok: boolean;
    package_ok: boolean;
  }>`
    select
      (
        nullif(trim(t.name), '') is not null
        and nullif(trim(t.synopsis), '') is not null
        and nullif(trim(t.language), '') is not null
        and t.content_type is not null
      ) as metadata_ok,
      exists (
        select 1 from bridge_rights_grants r
        where r.title_id = t.id
          and r.status = 'VALID'
          and jsonb_array_length(r.territories) > 0
          and jsonb_array_length(r.languages) > 0
          and jsonb_array_length(r.media) > 0
          and r.window_start is not null
          and r.window_end is not null
          and r.window_end > now()
      ) as rights_ok,
      exists (
        select 1 from bridge_rights_grants r
        where r.title_id = t.id
          and r.status = 'VALID'
          and exists (
            select 1 from jsonb_array_elements(r.evidence) e
            where coalesce(e->>'type', '') not in ('RIGHTS_BASIS', 'AUTHORIZATION_ATTESTATION')
          )
      ) as rights_evidence_ok,
      exists (
        select 1 from bridge_legal_cases l
        where l.title_id = t.id and l.status = 'APPROVED'
      ) as legal_ok,
      exists (
        select 1 from bridge_legal_cases l
        where l.title_id = t.id
          and l.status = 'APPROVED'
          and exists (
            select 1 from jsonb_array_elements(l.evidence) e
            where coalesce(e->>'type', '') not in ('AUTHORIZATION_ATTESTATION', 'RIGHTS_BASIS')
          )
      ) as legal_evidence_ok,
      exists (
        select 1 from bridge_qc_cases q
        where q.title_id = t.id and q.status = 'PASSED'
      ) as qc_ok,
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id and a.kind = 'screener' and coalesce(a.byte_size, 0) > 0
      ) as screener_ok,
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id and a.kind = 'master' and coalesce(a.byte_size, 0) > 0
      ) as master_ok,
      exists (
        select 1 from bridge_assets a
        where a.title_id = t.id and a.kind = 'poster' and coalesce(a.byte_size, 0) > 0
      ) as poster_ok,
      exists (
        select 1 from bridge_destination_packages p
        where p.title_id = t.id and p.readiness_state in ('HOLD', 'READY')
      ) as package_ok
    from bridge_titles t
    where t.id = ${titleId}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Title not found");
  const missing = [
    ["metadata", row.metadata_ok],
    ["rights grant", row.rights_ok],
    ["rights evidence", row.rights_evidence_ok],
    ["legal approval", row.legal_ok],
    ["legal evidence", row.legal_evidence_ok],
    ["QC pass", row.qc_ok],
    ["private screener", row.screener_ok],
    ["verified master", row.master_ok],
    ["required artwork", row.poster_ok],
    ["destination package", row.package_ok],
  ].filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length) {
    throw new Error(`LICENSING_READY blocked: ${missing.join(", ")}`);
  }
  await sql`
    update bridge_titles
    set rights_submission_status = 'READY', updated_at = now()
    where id = ${titleId}
  `;
}

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
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    if (data.to === "LICENSED") {
      throw new Error("LICENSED is granted only after a captured Razorpay payment");
    }
    if (["RIGHTS_REVIEW", "LICENSING_READY"].includes(data.to))
      throw new Error("Use the recorded QC or legal review action");
    if (data.to === "QC_REVIEW") {
      const verified = await (await getSql())<{
        kind: string;
        s3_key: string;
      }>`select kind,s3_key from bridge_assets where title_id=${title.id} and byte_size>0`;
      if (
        !verified.some((a) => a.kind === "master" && a.s3_key === title.masterKey) ||
        !verified.some((a) => a.kind === "poster" && a.s3_key === title.posterKey)
      )
        throw new Error("Verified master and artwork required before QC");
    }
    assertTransition(title.status, data.to);
    const perm = permissionForTransition(title.status, data.to);
    if (!perm) throw new Error("Transition is not available");
    assertPermission(actor, perm);
    if (perm === "title.advance_upload" && title.ownerUserId !== actor.userId && !hasStaffPermission(actor, perm)) {
      throw new Error("Forbidden");
    }
    const expected = nextStatus(title.status);
    if (expected !== data.to) throw new Error("Illegal title transition");
    return (await getSql()).transaction(async (tx) => {
      const [locked] = await tx<{
        status: string;
      }>`select status from bridge_titles where id=${title.id} for update`;
      if (!locked || locked.status !== title.status)
        throw new Error("Title changed; refresh before retrying");
      await recordTransition(
        {
          titleId: title.id,
          from: title.status,
          to: data.to,
          actorUserId: actor.userId,
          note: data.note,
        },
        tx,
      );
      await writeAudit(
        {
          actorUserId: actor.userId,
          action: "title.advance",
          entityType: "bridge_title",
          entityId: title.id,
          metadata: { from: title.status, to: data.to },
        },
        tx,
      );
      return { title: { ...title, status: data.to } };
    });
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "audit.read");
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      actor_user_id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      metadata: string;
      created_at: string | Date;
    }>`
      select id, actor_user_id, action, entity_type, entity_id, metadata, created_at
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
        createdAt: asIso(r.created_at),
      })),
    };
  });
