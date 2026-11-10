import type { Sql } from "@/lib/db";
import type { BridgeTitle, TitleStatus } from "./types";
import { hasVerifiedMasterAndArtwork } from "./asset-roles.ts";

/**
 * Executes the real Submit-for-QC database path. Authentication and permission
 * checks stay in the server handler; asset validation and all lifecycle writes
 * remain here so the same transaction can be exercised by PostgreSQL tests.
 */
export async function submitTitleForQc(
  sql: Sql,
  title: Pick<BridgeTitle, "id" | "status" | "masterKey" | "posterKey">,
  actorUserId: string,
  note?: string,
): Promise<{ title: Pick<BridgeTitle, "id" | "status"> & { status: TitleStatus } }> {
  if (title.status !== "PREPARING") throw new Error("Title is not ready for QC submission");
  const assets = await sql<{ kind: string; s3_key: string }>`
    select kind, s3_key
    from bridge_assets
    where title_id = ${title.id} and coalesce(byte_size, 0) > 0
  `;
  if (!hasVerifiedMasterAndArtwork(assets, title.masterKey, title.posterKey)) {
    throw new Error("Verified master and artwork required before QC");
  }

  await sql.transaction(async (tx) => {
    const [locked] = await tx<{ status: string }>`
      select status from bridge_titles where id = ${title.id} for update
    `;
    if (!locked || locked.status !== title.status) {
      throw new Error("Title changed; refresh before retrying");
    }
    await tx`
      update bridge_titles set status = 'QC_REVIEW', updated_at = now()
      where id = ${title.id}
    `;
    await tx`
      insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
      values (${title.id}, ${title.status}, 'QC_REVIEW', ${actorUserId}, ${note ?? null})
    `;
    await tx`
      insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values (
        ${actorUserId}, 'title.advance', 'bridge_title', ${title.id},
        ${JSON.stringify({ from: title.status, to: "QC_REVIEW" })}
      )
    `;
  });
  return { title: { id: title.id, status: "QC_REVIEW" } };
}
