import type { Sql } from "../db";
import { assertDeliveryUnchanged, assertManualModelCanPublish, canonicalDeliveryJson, deliveryHash, type ManualDeliveryStatus, type ManualLoopModel } from "./loop-delivery-policy";

export type DeliveryRequest = {
  destination: "CRAYONS_LOOP";
  territories: string[];
  languages: string[];
  exploitationModels: string[];
  windowStart: string;
  windowEnd: string;
};
export type DeliveryManifest = {
  schemaVersion: 1;
  bridgeTitleId: string;
  buyer: "CRAYONS_LOOP";
  model: ManualLoopModel;
  request: DeliveryRequest;
  metadata: { slug: string; title: string; synopsis: string; language: string; year: number | null; runtimeMinutes: number | null; contentType: string | null };
  assetReferences: { master: string | null; poster: string | null };
};
export type LoopDeliveryRow = {
  id: string;
  title_id: string;
  version: number;
  rights_grant_id: string;
  model: ManualLoopModel;
  status: ManualDeliveryStatus;
  snapshot_hash: string;
  manifest: DeliveryManifest;
  prepared_by: string;
  delivered_by: string | null;
  reviewed_by: string | null;
  handoff_reference: string | null;
  approval_reference: string | null;
  review_note: string | null;
};

export async function latestLoopDelivery(sql: Sql, titleId: string) {
  const rows = await sql<LoopDeliveryRow>`select * from bridge_loop_deliveries
    where title_id=${titleId} order by version desc limit 1 for update`;
  return rows[0] ?? null;
}

export async function currentDeliverySnapshot(sql: Sql, titleId: string, grantId: string, model: ManualLoopModel) {
  const [row] = await sql<{
    title: { slug: string; name: string; synopsis: string; language: string; year: number | null; runtime_minutes: number | null; content_type: string | null; master_key: string | null; poster_key: string | null };
    grant: { territories: string[]; languages: string[]; window_start: string; window_end: string; media: string[]; status: string };
  }>`select jsonb_build_object('slug',b.slug,'name',b.name,'synopsis',b.synopsis,
    'language',b.language,'year',b.year,'runtime_minutes',b.runtime_minutes,
    'content_type',b.content_type,'master_key',b.master_key,'poster_key',b.poster_key) as title,
    to_jsonb(g) as grant
    from bridge_titles b join bridge_rights_grants g on g.title_id=b.id
    where b.id=${titleId} and g.id=${grantId}`;
  if (!row || row.grant.status !== "VALID" || !row.grant.media.includes("CRAYONS_LOOP") || !row.grant.media.includes(model))
    throw new Error("An approved, model-specific Crayons Loop license is required");
  const manifest: DeliveryManifest = {
    schemaVersion: 1,
    bridgeTitleId: titleId,
    buyer: "CRAYONS_LOOP",
    model,
    request: {
      destination: "CRAYONS_LOOP", territories: row.grant.territories, languages: row.grant.languages,
      exploitationModels: [model], windowStart: new Date(row.grant.window_start).toISOString(),
      windowEnd: new Date(row.grant.window_end).toISOString(),
    },
    metadata: { slug: row.title.slug, title: row.title.name, synopsis: row.title.synopsis,
      language: row.title.language, year: row.title.year, runtimeMinutes: row.title.runtime_minutes,
      contentType: row.title.content_type },
    // Private handoff references, not signed URLs or consumer playback URLs.
    assetReferences: { master: row.title.master_key, poster: row.title.poster_key },
  };
  // Legal evidence participates in invalidation, but is never included in the exported manifest.
  return { manifest, hash: deliveryHash({ title: row.title, grant: row.grant, model }) };
}

/** Called inside the publishing transaction after locking bridge_titles and passing preflight. */
export async function consumeApprovedLoopDelivery(sql: Sql, data: {
  bridgeTitleId: string; destination: string; territories: string[]; languages: string[];
  exploitationModels: string[]; windowStart?: string | null; windowEnd?: string | null;
}, rightsGrantId: string | null | undefined) {
  const delivery = await latestLoopDelivery(sql, data.bridgeTitleId);
  if (!delivery || delivery.status !== "APPROVED" || !delivery.reviewed_by)
    throw new Error("Manual Loop delivery and explicit independent acceptance are required before publishing");
  assertManualModelCanPublish(delivery.model);
  if (!rightsGrantId || rightsGrantId !== delivery.rights_grant_id)
    throw new Error("The approved delivery uses a different license. Prepare a new package");
  const snapshot = await currentDeliverySnapshot(sql, data.bridgeTitleId, rightsGrantId, delivery.model);
  assertDeliveryUnchanged(delivery.snapshot_hash, snapshot.hash);
  const request = { destination: data.destination, territories: data.territories,
    languages: data.languages, exploitationModels: data.exploitationModels,
    windowStart: data.windowStart ? new Date(data.windowStart).toISOString() : null,
    windowEnd: data.windowEnd ? new Date(data.windowEnd).toISOString() : null };
  if (canonicalDeliveryJson(request) !== canonicalDeliveryJson(snapshot.manifest.request))
    throw new Error("Publication dimensions must exactly match the approved delivery package");
  await sql`update bridge_loop_deliveries set status='PUBLISHED',published_at=now() where id=${delivery.id}`;
  return { deliveryId: delivery.id, deliveryVersion: delivery.version, approvedBy: delivery.reviewed_by };
}
