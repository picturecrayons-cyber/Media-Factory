import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { canMutateTitle } from "@/lib/bridge/rbac";
import { writeAudit } from "@/lib/bridge/audit";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { deleteObject } from "@/lib/bridge/oci-object-storage.server";

type DeletionTitle = {
  id: string;
  name: string;
  status: string;
  owner_user_id: string;
  owner_account_type: string;
  owner_organization_id: string | null;
  poster_key: string | null;
  master_key: string | null;
};

type StorageKey = { key: string; bucket: string | null };

export const deleteTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8), confirmation: z.string().min(1).max(160) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();

    return sql.transaction(async (tx) => {
      const [title] = await tx<DeletionTitle>`
        select id, name, status, owner_user_id, owner_account_type, owner_organization_id,
               poster_key, master_key
        from bridge_titles
        where id = ${data.id}
        for update
      `;
      if (!title) throw new Error("Title not found");

      const authorized = actor.internalRole === "super_admin" || canMutateTitle(
        actor,
        {
          ownerUserId: title.owner_user_id,
          ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
          ownerOrganizationId: title.owner_organization_id,
        },
        "title.update_own",
        "title.update_own",
      );
      if (!authorized) throw new Error("You do not have permission to delete this title.");
      if (data.confirmation.trim() !== title.name) {
        throw new Error("Confirmation text does not match the title name.");
      }
      if (!["DRAFT", "UPLOADING", "PREPARING"].includes(title.status)) {
        throw new Error("This title has entered review or commercial workflow and cannot be permanently deleted.");
      }

      const [blocked] = await tx<{ reason: string | null }>`
        select case
          when exists (select 1 from bridge_assets a where a.title_id = ${title.id}
            and (a.legal_hold or a.commercial_hold or (a.retention_until is not null and a.retention_until > now())))
            then 'Storage is under legal, commercial, or retention hold.'
          when exists (select 1 from bridge_deals d where d.title_id = ${title.id})
            then 'A licensing deal is linked to this title.'
          when exists (select 1 from bridge_package_entitlements e where e.title_id = ${title.id})
            then 'A buyer entitlement is linked to this title.'
          when exists (select 1 from bridge_production_assets p where p.title_id = ${title.id})
            then 'Production assets are linked to this title.'
          when exists (select 1 from bridge_financial_ledger f where f.title_id = ${title.id})
            then 'Financial ledger records must be retained.'
          when exists (select 1 from bridge_loop_publications p where p.bridge_title_id = ${title.id})
            then 'A Loop publication record is linked to this title.'
          when exists (select 1 from bridge_service_orders o where o.title_id = ${title.id})
            then 'A service order is linked to this title.'
          when exists (select 1 from bridge_service_quotes q where q.title_id = ${title.id})
            then 'A service quote is linked to this title.'
          when exists (select 1 from loop_titles l where l.bridge_title_id = ${title.id})
            then 'A Loop title record is linked to this title.'
          when exists (select 1 from streamvista_legacy_links l where l.bridge_title_id = ${title.id})
            then 'A legacy distribution link is linked to this title.'
          when exists (select 1 from streamvista_orders o where o.bridge_title_id = ${title.id})
            then 'A distribution order is linked to this title.'
          when exists (select 1 from bridge_title_merge_aliases a where a.canonical_title_id = ${title.id})
            then 'This title is a canonical merge target.'
          when exists (select 1 from bridge_title_merge_audits a where a.canonical_title_id = ${title.id})
            then 'A title merge audit references this title.'
          else null
        end as reason
      `;
      if (blocked?.reason) throw new Error(`Deletion blocked: ${blocked.reason}`);

      const assetRows = await tx<{ s3_key: string }>`
        select s3_key from bridge_assets where title_id = ${title.id}
      `;
      const versionRows = await tx<{ s3_key: string }>`
        select s3_key from bridge_asset_versions where title_id = ${title.id}
      `;
      const ditRows = await tx<{ object_key: string; bucket_name: string }>`
        select o.object_key, o.bucket_name
        from bridge_dit_storage_objects o
        join bridge_dit_ingest_sessions s on s.id = o.session_id
        where s.title_id = ${title.id}
      `;

      const objects = new Map<string, StorageKey>();
      const addObject = (key: string | null | undefined, bucket: string | null = null) => {
        if (!key?.trim()) return;
        objects.set(`${bucket ?? "default"}::${key}`, { key, bucket });
      };
      addObject(title.poster_key);
      addObject(title.master_key);
      for (const row of assetRows) addObject(row.s3_key);
      for (const row of versionRows) addObject(row.s3_key);
      for (const row of ditRows) addObject(row.object_key, row.bucket_name);

      // Object deletion is idempotent (404 is treated as already deleted).
      // If any object delete fails, the database transaction rolls back and the
      // title remains available for a safe retry; already-deleted objects are 404 on retry.
      for (const object of objects.values()) {
        await deleteObject(object.key, object.bucket ?? undefined);
      }

      // DIT storage-object rows do not declare a foreign key to the ingest session
      // in Production, so remove their metadata explicitly before the session cascade.
      await tx`
        delete from bridge_dit_storage_objects
        where session_id in (
          select id from bridge_dit_ingest_sessions where title_id = ${title.id}
        )
      `;

      await writeAudit({
        actorUserId: actor.userId,
        action: "title.permanently_deleted",
        entityType: "bridge_title",
        entityId: title.id,
        metadata: { titleName: title.name, storageObjectsDeletedOrAbsent: objects.size },
      }, tx);

      await tx`delete from bridge_titles where id = ${title.id}`;
      return { deleted: true as const, titleId: title.id, storageObjects: objects.size };
    });
  });
