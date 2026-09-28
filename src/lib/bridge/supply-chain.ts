import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { canReadTitle } from "./rbac";
import { requireActor } from "./session";
import { deriveSupplyGates, type RightsWindow } from "./supply-readiness";
import { loadTitle } from "./titles";

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export const getTitleSupplyChain = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "title.read_denied",
        entityType: "bridge_title",
        entityId: data.titleId,
        metadata: { found: Boolean(title) },
      });
      throw new Error("Not found");
    }

    const sql = await getSql();
    const counted = await sql<{ n: number }>`
      select count(*)::int as n from bridge_assets
      where title_id = ${title.id} and byte_size > 0
    `;
    const verifiedAssetCount = Number(counted[0]?.n ?? 0);
    let recordsAvailable = true;
    let qcStatus: string | null = null;
    let legalStatus: string | null = null;
    let packageState: string | null = null;
    let rights: RightsWindow[] = [];
    try {
      const qcRows = await sql<{ status: string }>`
        select status from bridge_qc_cases where title_id = ${title.id}
        order by created_at desc limit 1
      `;
      qcStatus = qcRows[0]?.status ?? null;
      const legalRows = await sql<{ status: string }>`
        select status from bridge_legal_cases where title_id = ${title.id}
        order by created_at desc limit 1
      `;
      legalStatus = legalRows[0]?.status ?? null;
      const rightRows = await sql<{
        status: string;
        exclusivity: string;
        territories: unknown;
        languages: unknown;
        media: unknown;
        window_start: string | Date | null;
        window_end: string | Date | null;
      }>`
        select status, exclusivity, territories, languages, media, window_start, window_end
        from bridge_rights_grants where title_id = ${title.id}
      `;
      rights = rightRows.map((row) => ({
        status: row.status,
        exclusivity: row.exclusivity,
        territories: asStringArray(row.territories),
        languages: asStringArray(row.languages),
        media: asStringArray(row.media),
        windowStart: asIso(row.window_start),
        windowEnd: asIso(row.window_end),
      }));
      const packages = await sql<{ readiness_state: string }>`
        select readiness_state from bridge_destination_packages
        where title_id = ${title.id}
        order by package_version desc limit 1
      `;
      packageState = packages[0]?.readiness_state ?? null;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "42P01") throw error;
      recordsAvailable = false;
      qcStatus = null;
      legalStatus = null;
      rights = [];
      packageState = null;
    }

    return {
      recordsAvailable,
      verifiedAssetCount,
      qcStatus,
      legalStatus,
      rightsCount: rights.length,
      packageState,
      gates: deriveSupplyGates({
        recordsAvailable,
        verifiedAssetCount,
        qcStatus,
        legalStatus,
        rights,
        packageState,
      }),
    };
  });
