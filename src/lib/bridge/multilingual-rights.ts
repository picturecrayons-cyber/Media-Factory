import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertBuyerPublishable } from "./buyer-visibility";

const languageRightInput = z.object({
  titleId: z.string().min(8),
  language: z.string().trim().min(2).max(40),
  rightType: z.enum(["ORIGINAL", "DUBBING", "SUBTITLING"]),
  territories: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  media: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  windowStart: z.string().datetime().nullable().optional(),
  windowEnd: z.string().datetime().nullable().optional(),
  exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
  askingPricePaise: z.number().int().min(0).max(2_000_000_000),
  evidence: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

type LanguageRightRow = {
  id: string;
  title_id: string;
  language: string;
  right_type: string;
  territories: unknown;
  media: unknown;
  window_start: string | Date | null;
  window_end: string | Date | null;
  exclusivity: string;
  asking_price_paise: number;
  evidence: unknown;
  status: string;
};

function mapRight(r: LanguageRightRow) {
  return {
    id: r.id,
    titleId: r.title_id,
    language: r.language,
    rightType: r.right_type,
    territories: Array.isArray(r.territories) ? r.territories : [],
    media: Array.isArray(r.media) ? r.media : [],
    windowStart: r.window_start ? String(r.window_start) : null,
    windowEnd: r.window_end ? String(r.window_end) : null,
    exclusivity: r.exclusivity,
    askingPricePaise: Number(r.asking_price_paise ?? 0),
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    status: r.status,
  };
}

function overlaps(aStart: Date | null, aEnd: Date | null, bStart: Date | null, bEnd: Date | null) {
  const a0 = aStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const a1 = aEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const b0 = bStart?.getTime() ?? Number.NEGATIVE_INFINITY;
  const b1 = bEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return a0 < b1 && b0 < a1;
}

function setIncludes(granted: unknown, requested: string[]) {
  if (!Array.isArray(granted)) return false;
  const set = new Set(granted.map((v) => String(v).trim().toUpperCase()));
  return requested.every((v) => set.has(v.toUpperCase()) || set.has("ALL") || set.has("*") || set.has("WORLDWIDE"));
}

export const listLanguageRights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const rows = await sql<LanguageRightRow>`
      select id, title_id, language, right_type, territories, media, window_start, window_end,
             exclusivity, asking_price_paise, evidence, status
      from bridge_language_rights
      where title_id = ${data.titleId}
      order by language, right_type
    `;
    return { rights: rows.map(mapRight) };
  });

export const createLanguageRight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(languageRightInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.rights_review");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");

    const start = data.windowStart ? new Date(data.windowStart) : null;
    const end = data.windowEnd ? new Date(data.windowEnd) : null;
    if (start && end && end <= start) throw new Error("Rights window end must be after start");

    const sql = await getSql();
    const existing = await sql<LanguageRightRow>`
      select id, title_id, language, right_type, territories, media, window_start, window_end,
             exclusivity, asking_price_paise, evidence, status
      from bridge_language_rights
      where title_id = ${data.titleId} and status = 'VALID'
    `;

    const conflict = existing.find((r) => {
      if (r.language.trim().toUpperCase() !== data.language.trim().toUpperCase()) return false;
      if (r.right_type !== data.rightType) return false;
      if (r.exclusivity !== "EXCLUSIVE" && data.exclusivity !== "EXCLUSIVE") return false;
      const territoryOverlap = data.territories.some((t) => setIncludes(r.territories, [t]));
      const mediaOverlap = data.media.some((m) => setIncludes(r.media, [m]));
      return territoryOverlap && mediaOverlap && overlaps(
        r.window_start ? new Date(r.window_start) : null,
        r.window_end ? new Date(r.window_end) : null,
        start,
        end,
      );
    });
    if (conflict) throw new Error("RIGHTS_CONFLICT: an overlapping exclusive language right already exists");

    const id = crypto.randomUUID();
    await sql`
      insert into bridge_language_rights (
        id, title_id, language, right_type, territories, media, window_start, window_end,
        exclusivity, asking_price_paise, evidence, status, created_by
      ) values (
        ${id}, ${data.titleId}, ${data.language.trim()}, ${data.rightType},
        ${JSON.stringify(data.territories)}, ${JSON.stringify(data.media)},
        ${start}, ${end}, ${data.exclusivity}, ${data.askingPricePaise},
        ${JSON.stringify(data.evidence)}, ${"VALID"}, ${actor.userId}
      )
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "rights.language_created",
      entityType: "bridge_language_right",
      entityId: id,
      metadata: { titleId: data.titleId, language: data.language, rightType: data.rightType },
    });
    return { right: { id } };
  });

export const createLicensePackage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    name: z.string().trim().min(3).max(160),
    languageRightIds: z.array(z.string().uuid()).min(1).max(20),
    territories: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
    media: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    windowStart: z.string().datetime().nullable().optional(),
    windowEnd: z.string().datetime().nullable().optional(),
    exclusivity: z.enum(["EXCLUSIVE", "NON_EXCLUSIVE"]),
    pricePaise: z.number().int().min(0).max(2_000_000_000),
    assetVersionIds: z.array(z.string().uuid()).max(100).default([]),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.license");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");

    const start = data.windowStart ? new Date(data.windowStart) : null;
    const end = data.windowEnd ? new Date(data.windowEnd) : null;
    if (start && end && end <= start) throw new Error("Package window end must be after start");

    const sql = await getSql();
    const rights = await sql<LanguageRightRow>`
      select id, title_id, language, right_type, territories, media, window_start, window_end,
             exclusivity, asking_price_paise, evidence, status
      from bridge_language_rights
      where id = any(${data.languageRightIds}::uuid[]) and title_id = ${data.titleId}
    `;
    if (rights.length !== data.languageRightIds.length) throw new Error("Every selected language right must belong to this title");
    for (const r of rights) {
      if (r.status !== "VALID") throw new Error("Only VALID language rights can be packaged");
      if (!setIncludes(r.territories, data.territories)) throw new Error(`Rights do not cover territory for ${r.language}`);
      if (!setIncludes(r.media, data.media)) throw new Error(`Rights do not cover media for ${r.language}`);
      if (!overlaps(r.window_start ? new Date(r.window_start) : null, r.window_end ? new Date(r.window_end) : null, start, end)) {
        throw new Error(`Rights window does not cover package window for ${r.language}`);
      }
      if (r.exclusivity === "EXCLUSIVE" && data.exclusivity === "NON_EXCLUSIVE") continue;
      if (r.exclusivity !== data.exclusivity && data.exclusivity === "EXCLUSIVE") {
        throw new Error(`Package exclusivity exceeds the licensed right for ${r.language}`);
      }
    }

    const id = crypto.randomUUID();
    await sql`
      insert into bridge_license_packages (
        id, title_id, name, language_right_ids, territories, media, window_start, window_end,
        exclusivity, price_paise, status, delivery_status, asset_version_ids, created_by
      ) values (
        ${id}, ${data.titleId}, ${data.name}, ${JSON.stringify(data.languageRightIds)},
        ${JSON.stringify(data.territories)}, ${JSON.stringify(data.media)}, ${start}, ${end},
        ${data.exclusivity}, ${data.pricePaise}, ${"READY"}, ${"HOLD"},
        ${JSON.stringify(data.assetVersionIds)}, ${actor.userId}
      )
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "licensing.language_package_created",
      entityType: "bridge_license_package",
      entityId: id,
      metadata: { titleId: data.titleId, languageRightIds: data.languageRightIds, pricePaise: data.pricePaise },
    });
    return { packageId: id };
  });

export const listLicensePackages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (!canReadTitle(actor, title)) {
      if (actor.accountType !== "buyer") throw new Error("Not found");
      await assertBuyerPublishable(title.id);
    }
    const sql = await getSql();
    const rows = await sql<{
      id: string; title_id: string; name: string; language_right_ids: unknown; territories: unknown;
      media: unknown; window_start: string | Date | null; window_end: string | Date | null;
      exclusivity: string; price_paise: number; status: string; delivery_status: string;
    }>`
      select id, title_id, name, language_right_ids, territories, media, window_start, window_end,
             exclusivity, price_paise, status, delivery_status
      from bridge_license_packages
      where title_id = ${data.titleId}
      order by created_at desc
    `;
    return { packages: rows.map((r) => ({
      id: r.id, titleId: r.title_id, name: r.name,
      languageRightIds: Array.isArray(r.language_right_ids) ? r.language_right_ids : [],
      territories: Array.isArray(r.territories) ? r.territories : [],
      media: Array.isArray(r.media) ? r.media : [],
      windowStart: r.window_start ? String(r.window_start) : null,
      windowEnd: r.window_end ? String(r.window_end) : null,
      exclusivity: r.exclusivity, pricePaise: Number(r.price_paise ?? 0),
      status: r.status, deliveryStatus: r.delivery_status,
    })) };
  });
