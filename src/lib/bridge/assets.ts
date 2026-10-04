import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission, canReadTitle } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { downloadDecision } from "./delivery-policy";

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
  .validator(z.object({
    titleId: z.string().min(8),
    kind: z.string().min(1),
    filename: z.string().min(1).max(120),
    contentType: z.string().min(3).max(120),
  }))
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    await requireVerifiedActor(context.userId);
    throw new Error("Forbidden: Bridge title asset uploads are disabled");
  });

export const confirmAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8), expectedByteSize: z.number().int().positive().optional() }))
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    await requireVerifiedActor(context.userId);
    throw new Error("Forbidden: Bridge title asset upload confirmation is disabled");
  });

export const requestAssetDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "asset.sign_download");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
      byte_size: number | null;
    }>`
      select id, title_id, kind, s3_key, byte_size from bridge_assets where id = ${data.assetId} and byte_size > 0 limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const entitled = await hasLicenseEntitlement(actor.userId, title.id);
    const decision = downloadDecision({
      kind: asset.kind,
      actorIsOwner: title.ownerUserId === actor.userId,
      actorIsInternal: Boolean(actor.internalRole),
      accountType: actor.accountType,
      hasLicenseEntitlement: entitled,
    });
    if (!decision.allow) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "asset.download_denied",
        entityType: "bridge_asset",
        entityId: asset.id,
        metadata: { reason: decision.reason, kind: asset.kind },
      });
      throw new Error(decision.reason);
    }
    const { signDownload } = await import("./aws-object-storage.server");
    const signed = await signDownload({ key: asset.s3_key });
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.download_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
    });
    return signed;
  });

export const listTitleAssets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const sql = await getSql();
    const buyer = actor.accountType === "buyer" && !actor.internalRole;
    const rows = await sql<{
      id: string;
      kind: string;
      s3_key: string;
      content_type: string | null;
      byte_size: number | null;
      created_at: string | Date;
    }>`
      select id, kind, s3_key, content_type, byte_size, created_at
      from bridge_assets where title_id = ${title.id} and byte_size > 0 order by created_at desc
    `;
    return {
      assets: rows
        .filter((r) => !buyer || !["master", "technical"].includes(r.kind))
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          key: buyer ? null : r.s3_key,
          contentType: r.content_type,
          byteSize: r.byte_size,
          verified: Number(r.byte_size) > 0,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
    };
  });
