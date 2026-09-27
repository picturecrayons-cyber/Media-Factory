import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ASSET_KINDS } from "./types";
import { assertPermission } from "./rbac";
import { requireActor } from "./session";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { assertTitleRead } from "./buyer-access";
import { persistVerifiedAsset } from "./asset-confirmation";

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
      contentType: z.string().min(3).max(120),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    if (title.ownerUserId !== actor.userId && !actor.internalRole) throw new Error("Forbidden");
    if (!UPLOADABLE.has(title.status)) throw new Error("Uploads are closed for this status");
    const { signUpload, titleAssetKey } = await import("./s3.server");
    const key = titleAssetKey({
      ownerUserId: title.ownerUserId,
      titleId: title.id,
      kind: data.kind,
      filename: data.filename,
    });
    const signed = await signUpload({ key, contentType: data.contentType });
    const id = randomBytes(16).toString("hex");
    const sql = await getSql();
    await sql`
      insert into bridge_assets (id, title_id, kind, s3_key, content_type, created_by)
      values (${id}, ${title.id}, ${data.kind}, ${key}, ${data.contentType}, ${actor.userId})
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "asset.upload_authorized",
      entityType: "bridge_asset",
      entityId: id,
      metadata: { titleId: title.id, kind: data.kind },
    });
    return { assetId: id, ...signed };
  });

export const confirmAssetUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_upload");
    const sql = await getSql();
    const rows = await sql<{ id: string; title_id: string; kind: string; s3_key: string; created_by: string; byte_size: number | null }>`
      select id, title_id, kind, s3_key, created_by, byte_size
      from bridge_assets where id = ${data.assetId} limit 1
    `;
    const asset = rows[0];
    if (!asset || asset.created_by !== actor.userId) throw new Error("Asset not found");
    const title = await loadTitle(asset.title_id);
    if (!title || (title.ownerUserId !== actor.userId && !actor.internalRole) || !UPLOADABLE.has(title.status)) {
      throw new Error("Upload confirmation is closed for this title");
    }
    if (asset.byte_size != null) return { assetId: asset.id, byteSize: Number(asset.byte_size), verified: true };

    // HeadObject must succeed before any asset is exposed or the title receives
    // a master/poster reference. A signed PUT alone is only authorization.
    const { verifyObject } = await import("./s3.server");
    const object = await verifyObject(asset.s3_key);
    const confirmed = await persistVerifiedAsset(sql, {
      assetId: asset.id, actorUserId: actor.userId, internalActor: Boolean(actor.internalRole),
      titleId: title.id, kind: asset.kind, byteSize: object.byteSize, contentType: object.contentType,
    });
    if (!confirmed) {
      const current = await sql<{ byte_size: number | null }>`select byte_size from bridge_assets where id = ${asset.id}`;
      if (current[0]?.byte_size != null) return { assetId: asset.id, byteSize: Number(current[0].byte_size), verified: true };
      throw new Error("Asset confirmation changed; retry after refreshing the title");
    }
    return { assetId: asset.id, byteSize: object.byteSize, verified: true };
  });

export const requestAssetDownload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ assetId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "asset.sign_download");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      kind: string;
      s3_key: string;
    }>`
      select id, title_id, kind, s3_key from bridge_assets
      where id = ${data.assetId} and byte_size > 0 limit 1
    `;
    const asset = rows[0];
    if (!asset) throw new Error("Not found");
    const title = await loadTitle(asset.title_id);
    if (!title) throw new Error("Not found");
    await assertTitleRead(actor, title);
    const isOwner = title.ownerUserId === actor.userId;
    const isInternal = Boolean(actor.internalRole);
    if (!isOwner && !isInternal) {
      if (asset.kind === "master") throw new Error("Source master access requires separate authorization");
      if (asset.kind !== "poster") {
        const entitled = await hasLicenseEntitlement(actor.userId, title.id);
        if (!entitled) throw new Error("License entitlement required");
      }
    }
    const { signDownload } = await import("./s3.server");
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
    const actor = await requireActor(context.userId);
    const title = await loadTitle(data.titleId);
    if (!title) throw new Error("Not found");
    await assertTitleRead(actor, title);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      s3_key: string;
      content_type: string | null;
      created_at: string | Date;
    }>`
      select id, kind, s3_key, content_type, created_at
      from bridge_assets where title_id = ${title.id} and byte_size > 0
        and (${Boolean(actor.internalRole || actor.userId === title.ownerUserId)} or kind in ('poster', 'screener'))
      order by created_at desc
    `;
    return {
      assets: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        key: actor.accountType === "buyer" && !actor.internalRole ? null : r.s3_key,
        contentType: r.content_type,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    };
  });
