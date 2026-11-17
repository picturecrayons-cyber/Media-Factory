import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ASSET_KINDS } from "./types";
import { assertPermission, canOperateOnTitle, canReadTitle, hasStaffPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { persistVerifiedAsset } from "./asset-confirmation";
import { downloadDecision } from "./delivery-policy";
import { uploadUrlLifetimeSeconds } from "./upload-url-lifetime";
import { validateOttIngestFile, type OttIngestKind } from "./ott-ingest-spec";

const UPLOADABLE: ReadonlySet<string> = new Set(["DRAFT", "UPLOADING", "PREPARING"]);

async function hasLicenseEntitlement(userId: string, titleId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from bridge_entitlements
    where user_id = ${userId} and title_id = ${titleId} and access_type = 'license'
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export const requestAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      kind: z.enum(ASSET_KINDS),
      filename: z.string().min(1).max(120),
      contentType: z.string().min(3).max(120ֻǱ˞