import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { canReadTitle } from "./rbac";
import { canPreviewAsset } from "./asset-access-policy";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";

async function hasLicenseEntitlement(userId: string, titleId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from bridge_entitlements
    where user_id = ${userId} and title_id = ${titleId} and access_type = 'license'
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

export const requestAssetPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
      content_type: string | null;
    }>`
      select id, title_id, kind, s3_key, content_type
      from bridge_assets where id = ${data.assetId} and byte_size > 0 limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    const title = await loadTitle(asset.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    const entitled = actor.accountType === "buyer" && !actor.internalRole
      ? await hasLicenseEntitlement(actor.userId, title.id)
      : false;
    if (!canPreviewAsset(actor, title, asset.kind, entitled)) {
      await writeAudit({
        actorUserId: actor.userId,
        action: "asset.preview_denied",
        entityType: "bridge_asset",
        entityId: asset.id,
        metadata: { kind: asset.kind },
      });
      throw new Error("Not found");
    }
    const { signDownload } = await import("./oci-object-storage.server");
    const signed = await signDownload({ key: asset.s3_key, expiresIn: 60 });
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.preview_signed",
      entityType: "bridge_asset",
      entityId: asset.id,
      metadata: { kind: asset.kind, expiresIn: 60 },
    });
    return { url: signed.url, kind: asset.kind, contentType: asset.content_type, expiresIn: 60 };
  });
