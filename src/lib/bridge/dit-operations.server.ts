import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { canOperateOnTitle, type Actor } from "./rbac";
import { writeAudit } from "./audit";
import { bridgeEnv } from "./env";
import {
  buildVaultObjectKey,
  createIngestManifest,
  evaluateDitSignoff,
  reconcileManifest,
  runClapAssistant,
  type ClipRecord,
  type ClipLedgerEntry,
  type CopyVerification,
  queueConversion,
  completeConversion,
  type ConversionProfile,
  type ConversionCopyVerification,
} from "./production-vault";
import {
  signUpload,
  verifyObject,
  readObjectSha256AtTarget,
  copyObjectToReplicaTarget,
  verifyObjectAtTarget,
  signDownload,
  signUploadAtTarget,
} from "./oci-object-storage.server";

const PROJECT_REF = "jbymleftneggcgutlcqu";
const clipSchema = z.object({
  clipNumber: z.string().trim().min(1).max(100),
  originalFilename: z.string().trim().min(1).max(255),
  originalRelativePath: z.string().min(1).max(1024),
  byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  durationMs: z.number().int().positive(),
  frameRate: z.number().positive().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  codec: z.string().max(100).nullable(),
});

function assertDitStagingDatabase() {
  const target = process.env.BRIDGE_DB_TARGET?.trim().toUpperCase();
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  if (target !== "STAGING" || !databaseUrl) {
    throw new Error("DIT_WRITE_BLOCKED: explicit STAGING database binding is required");
  }
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("DIT_WRITE_BLOCKED: database URL is invalid"); }
  const hostMatches = parsed.hostname.includes(PROJECT_REF);
  const userMatches = decodeURIComponent(parsed.username).includes(PROJECT_REF);
  if (!hostMatches && !userMatches) {
    throw new Error("DIT_WRITE_BLOCKED: database URL does not identify the approved Bridge Testing DB");
  }
  const supabaseUrl = bridgeEnv.supabaseUrl();
  if (!supabaseUrl || !supabaseUrl.includes(PROJECT_REF)) {
    throw new Error("DIT_WRITE_BLOCKED: Supabase API URL is not the approved Bridge Testing DB");
  }
}

function replicaTargets() {
  const master = { region: bridgeEnv.ociRegion(), bucket: bridgeEnv.ociBucket() };
  const backup1 = { region: bridgeEnv.ociBackup1Region(), bucket: bridgeEnv.ociBackup1Bucket() };
  const backup2 = { region: bridgeEnv.ociBackup2Region(), bucket: bridgeEnv.ociBackup2Bucket() };
  if (!master.region || !master.bucket || !backup1.region || !backup1.bucket || !backup2.region || !backup2.bucket) {
    throw new Error("DIT_REPLICATION_BLOCKED: MASTER, BACKUP_1 and BACKUP_2 OCI targets must all be configured");
  }
  const targets = [master, backup1, backup2];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (targets[i].region === targets[j].region || targets[i].bucket === targets[j].bucket) {
        throw new Error("DIT_REPLICATION_BLOCKED: every copy must use a distinct region and bucket");
      }
    }
  }
  return { master: master as { region: string; bucket: string }, backup1: backup1 as { region: string; bucket: string }, backup2: backup2 as { region: string; bucket: string } };
}


const listInput = z.object({ titleId: z.string().min(1).optional() });
export const listDitOperations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    if ((!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) && actor.accountType !== "studio") throw new Error("Forbidden");
    const rows = await sql`
      select p.id, p.title_id as "titleId", t.name as "titleName", p.production_name as "productionName",
        p.production_no as "productionNo", p.status, p.created_at as "createdAt",
        d.id as "shootingDayId", d.day_number as "dayNumber", d.shooting_date as "shootingDate",
        c.id as "cameraCardId", c.camera_id as "cameraId", c.card_no as "cardNo", c.state as "cardState",
        (select count(*)::int from bridge_production_ingest_manifests m where m.production_id=p.id) as "manifestCount",
        (select count(*)::int from bridge_production_clips cl join bridge_production_ingest_manifests m on m.id=cl.manifest_id where m.production_id=p.id) as "clipCount"
      from bridge_productions p
      join bridge_titles t on t.id=p.title_id
      left join bridge_production_shooting_days d on d.production_id=p.id
      left join bridge_production_camera_cards c on c.shooting_day_id=d.id
      where (${Boolean(actor.internalRole && ["admin", "super_admin"].includes(actor.internalRole))} or t.owner_user_id=${actor.userId}
        or (t.owner_account_type='studio' and t.owner_organization_id=${actor.organizationId ?? null}))
        and (${data.titleId ?? null}::text is null or p.title_id=${data.titleId ?? null})
      order by p.created_at desc, d.day_number, c.camera_id, c.card_no
      limit 250
    `;
    return JSON.parse(JSON.stringify(rows, (_, value) => typeof value === "bigint" ? value.toString() : value));
  });

const createProductionInput = z.object({
  titleId: z.string().min(1),
  productionName: z.string().trim().min(2).max(200),
  productionNo: z.string().trim().min(1).max(80),
  shootingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const createDitProduction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createProductionInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const id = randomUUID();
    const dayId = randomUUID();
    return sql.transaction(async (tx) => {
      const titles = await tx<{
        owner_user_id: string; owner_account_type: string; owner_organization_id: string | null;
      }>`select owner_user_id, owner_account_type, owner_organization_id from bridge_titles where id=${data.titleId} for update`;
      const title = titles[0];
      if (!title || !canOperateOnTitle(actor, {
        ownerUserId: title.owner_user_id,
        ownerAccountType: title.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
        ownerOrganizationId: title.owner_organization_id,
      }, "production.dit_operate", "production.dit_operate")) throw new Error("Forbidden");
      await tx`insert into bridge_productions(id,title_id,organization_id,production_name,production_no,created_by)
        values (${id},${data.titleId},${actor.organizationId ?? null},${data.productionName},${data.productionNo},${actor.userId})`;
      await tx`insert into bridge_production_shooting_days(id,production_id,day_number,shooting_date)
        values (${dayId},${id},1,${data.shootingDate})`;
      await writeAudit({ actorUserId: actor.userId, action: "dit.production.created", entityType: "bridge_production", entityId: id, metadata: { titleId: data.titleId, productionNo: data.productionNo } }, tx);
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${id},${actor.userId},'production.created','production',${id},${JSON.stringify({ titleId: data.titleId })}::jsonb)`;
      return { productionId: id, shootingDayId: dayId, status: "PREPARING" as const };
    });
  });

const createCardInput = z.object({
  productionId: z.string().uuid(),
  shootingDayId: z.string().uuid(),
  cameraId: z.enum(["A", "B", "C"]),
  cardNo: z.string().trim().min(1).max(100),
});
export const createDitCameraCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createCardInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const productionRows = await sql<{
      id: string; title_id: string; production_name: string; production_no: string;
      owner_user_id: string; owner_account_type: string; owner_organization_id: string | null;
    }>`
      select p.id,p.title_id,p.production_name,p.production_no,
        t.owner_user_id,t.owner_account_type,t.owner_organization_id
      from bridge_productions p
      join bridge_titles t on t.id=p.title_id
      where p.id=${data.productionId} limit 1
    `;
    const production = productionRows[0];
    if (!production || !canOperateOnTitle(actor, {
      ownerUserId: production.owner_user_id,
      ownerAccountType: production.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
      ownerOrganizationId: production.owner_organization_id,
    }, "production.dit_operate", "production.dit_operate")) throw new Error("Forbidden");
    const day = await sql`select id from bridge_production_shooting_days where id=${data.shootingDayId} and production_id=${data.productionId} limit 1`;
    if (!day.length) throw new Error("Shooting day does not belong to this production");
    const cardId = randomUUID();
    await sql.transaction(async (tx) => {
      await tx`insert into bridge_production_camera_cards(id,shooting_day_id,camera_id,card_no)
        values (${cardId},${data.shootingDayId},${data.cameraId},${data.cardNo})`;
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${data.productionId},${actor.userId},'camera_card.created','camera_card',${cardId},${JSON.stringify({ cameraId: data.cameraId, cardNo: data.cardNo })}::jsonb)`;
      await writeAudit({ actorUserId: actor.userId, action: "dit.camera_card.created", entityType: "bridge_production", entityId: data.productionId, metadata: { cardId, cameraId: data.cameraId } }, tx);
    });
    return { cameraCardId: cardId, status: "INGEST_PENDING" as const };
  });

const prepareInput = z.object({
  productionId: z.string().uuid(),
  shootingDayId: z.string().uuid(),
  cameraCardId: z.string().uuid(),
  clip: clipSchema,
});
export const prepareDitClipUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(prepareInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      title_id: string; production_name: string; production_no: string; shooting_date: string;
      camera_id: "A" | "B" | "C"; card_no: string; owner_user_id: string; owner_account_type: string;
      owner_organization_id: string | null;
    }>`
      select p.title_id,p.production_name,p.production_no,d.shooting_date::text,c.camera_id,c.card_no,
        t.owner_user_id,t.owner_account_type,t.owner_organization_id
      from bridge_productions p
      join bridge_titles t on t.id=p.title_id
      join bridge_production_shooting_days d on d.id=${data.shootingDayId} and d.production_id=p.id
      join bridge_production_camera_cards c on c.id=${data.cameraCardId} and c.shooting_day_id=d.id
      where p.id=${data.productionId} limit 1
    `;
    const row = rows[0];
    if (!row || !canOperateOnTitle(actor, {
      ownerUserId: row.owner_user_id,
      ownerAccountType: row.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
      ownerOrganizationId: row.owner_organization_id,
    }, "production.dit_operate", "production.dit_operate")) throw new Error("Forbidden");
    const manifestId = randomUUID();
    const clipId = randomUUID();
    const createdAt = new Date().toISOString();
    const manifest = createIngestManifest({
      manifestId, productionId: data.productionId, shootingDayId: data.shootingDayId,
      camera: row.camera_id, cardNo: row.card_no, createdAt, entries: [data.clip],
    });
    const reconciliation = reconcileManifest(manifest, [data.clip]);
    if (reconciliation.result !== "PASS") throw new Error("DIT manifest metadata failed validation");
    const objectKey = buildVaultObjectKey({
      filmName: row.production_name, productionNo: row.production_no, tier: "MASTER",
      date: row.shooting_date, camera: row.camera_id, cardNo: row.card_no,
      kind: "RAW", originalRelativePath: data.clip.originalRelativePath,
    });
    const upload = await signUpload({ key: objectKey, contentType: "application/octet-stream", expiresIn: 900 });
    await sql.transaction(async (tx) => {
      await tx`insert into bridge_production_ingest_manifests
        (id,production_id,shooting_day_id,camera_card_id,expected_clip_count,discovered_clip_count,reconciliation_result,created_by,manifest_payload)
        values (${manifestId},${data.productionId},${data.shootingDayId},${data.cameraCardId},1,0,'NOT_CHECKED',${actor.userId},${JSON.stringify({ sourceObjectKey: objectKey, clip: data.clip })}::jsonb)`;
      await tx`insert into bridge_production_clips
        (id,manifest_id,clip_number,original_filename,original_relative_path,byte_size,checksum_sha256,has_video,has_audio,duration_ms,frame_rate,width,height,codec)
        values (${clipId},${manifestId},${data.clip.clipNumber},${data.clip.originalFilename},${data.clip.originalRelativePath},
          ${data.clip.byteSize},${data.clip.checksumSha256},${data.clip.hasVideo},${data.clip.hasAudio},${data.clip.durationMs},
          ${data.clip.frameRate},${data.clip.width},${data.clip.height},${data.clip.codec})`;
      await tx`update bridge_production_camera_cards set state='INGESTING',updated_at=now() where id=${data.cameraCardId}`;
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${data.productionId},${actor.userId},'ingest.prepared','clip',${clipId},${JSON.stringify({ manifestId, expectedByteSize: data.clip.byteSize })}::jsonb)`;
    });
    return { manifestId, clipId, uploadUrl: upload.url, objectKey };
  });

const confirmInput = z.object({ productionId: z.string().uuid(), manifestId: z.string().uuid(), clipId: z.string().uuid() });
export const verifyAndReplicateDitClip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(confirmInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      title_id: string; owner_user_id: string; owner_account_type: string; owner_organization_id: string | null;
      source_object_key: string; shooting_day_id: string; camera_card_id: string; clip_id: string;
      clip_number: string; byte_size: number; checksum_sha256: string; original_filename: string;
      original_relative_path: string; has_video: boolean; has_audio: boolean; duration_ms: number;
      frame_rate: number | null; width: number | null; height: number | null; codec: string | null;
      camera_id: "A" | "B" | "C"; card_no: string; production_name: string; production_no: string; shooting_date: string;
    }>`
      select p.title_id,t.owner_user_id,t.owner_account_type,t.owner_organization_id,
        m.manifest_payload->>'sourceObjectKey' as source_object_key,m.shooting_day_id,m.camera_card_id,
        cl.id as clip_id,cl.clip_number,cl.byte_size,cl.checksum_sha256,cl.original_filename,cl.original_relative_path,
        cl.has_video,cl.has_audio,cl.duration_ms,cl.frame_rate,cl.width,cl.height,cl.codec,
        c.camera_id,c.card_no,p.production_name,p.production_no,d.shooting_date::text
      from bridge_production_ingest_manifests m
      join bridge_productions p on p.id=m.production_id
      join bridge_titles t on t.id=p.title_id
      join bridge_production_clips cl on cl.manifest_id=m.id
      join bridge_production_camera_cards c on c.id=m.camera_card_id
      join bridge_production_shooting_days d on d.id=m.shooting_day_id
      where p.id=${data.productionId} and m.id=${data.manifestId} and cl.id=${data.clipId}
      limit 1
    `;
    const row = rows[0];
    if (!row || !canOperateOnTitle(actor, {
      ownerUserId: row.owner_user_id,
      ownerAccountType: row.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
      ownerOrganizationId: row.owner_organization_id,
    }, "production.dit_operate", "production.dit_operate")) throw new Error("Forbidden");
    const targets = replicaTargets();
    const expectedHash = row.checksum_sha256.toLowerCase();
    const expectedBytes = Number(row.byte_size);
    const primaryHead = await verifyObject(row.source_object_key);
    const primaryReadback = await readObjectSha256AtTarget(row.source_object_key, targets.master);
    const primaryOk = primaryHead.byteSize === expectedBytes && primaryReadback.byteSize === expectedBytes &&
      primaryReadback.sha256.toLowerCase() === expectedHash;
    const evidence: Array<{ tier: "MASTER" | "BACKUP_1" | "BACKUP_2"; key: string; target: { region: string; bucket: string }; byteSize: number | null; sha256: string | null; verified: boolean; error?: string }> = [];
    evidence.push({ tier: "MASTER", key: row.source_object_key, target: targets.master, byteSize: primaryReadback.byteSize, sha256: primaryReadback.sha256, verified: primaryOk });
    if (primaryOk) {
      for (const [tier, target] of [["BACKUP_1", targets.backup1], ["BACKUP_2", targets.backup2]] as const) {
        const key = buildVaultObjectKey({
          filmName: row.production_name, productionNo: row.production_no, tier,
          date: row.shooting_date, camera: row.camera_id, cardNo: row.card_no,
          kind: "RAW", originalRelativePath: row.original_relative_path,
        });
        try {
          await copyObjectToReplicaTarget({ sourceKey: row.source_object_key, destinationKey: key, expectedEtag: primaryHead.etag ?? "", target });
          const head = await verifyObjectAtTarget(key, target);
          const readback = await readObjectSha256AtTarget(key, target);
          evidence.push({ tier, key, target, byteSize: readback.byteSize, sha256: readback.sha256,
            verified: head.byteSize === expectedBytes && readback.byteSize === expectedBytes && readback.sha256.toLowerCase() === expectedHash });
        } catch (error) {
          evidence.push({ tier, key, target, byteSize: null, sha256: null, verified: false,
            error: error instanceof Error ? error.message.slice(0, 300) : "Replica verification failed" });
        }
      }
    }
    const allVerified = primaryOk && evidence.length === 3 && evidence.every((item) => item.verified);
    const clipRecord: ClipRecord = {
      clipNumber: row.clip_number, originalFilename: row.original_filename, originalRelativePath: row.original_relative_path,
      byteSize: expectedBytes, checksumSha256: expectedHash, hasVideo: row.has_video, hasAudio: row.has_audio,
      durationMs: Number(row.duration_ms), frameRate: row.frame_rate === null ? null : Number(row.frame_rate),
      width: row.width, height: row.height, codec: row.codec,
    };
    const [ledger] = [runClapAssistant({
      clip: { ...clipRecord, camera: row.camera_id, cardNo: row.card_no, automatedResult: "NOT_CHECKED",
        automatedReasons: [], humanDisposition: null, humanReviewerId: null, humanReviewedAt: null },
      manifestResult: primaryOk ? "PASS" : "FAIL", sourceCopyResult: primaryOk ? "PASS" : "FAIL", audioRequired: true,
    })];
    await sql.transaction(async (tx) => {
      for (const item of evidence) {
        const failureDomain = `oci:${item.target.region}:${item.target.bucket}`;
        const id = `dit:${row.clip_id}:${item.tier}`;
        await tx`insert into bridge_production_copy_verifications
          (id,clip_id,media_kind,storage_tier,object_key,expected_byte_size,expected_sha256,observed_byte_size,observed_sha256,
            independently_verified,verified_at,storage_location_id,failure_domain_id,verification_result)
          values (${id},${row.clip_id},'RAW',${item.tier},${item.key},${expectedBytes},${expectedHash},
            ${item.byteSize},${item.sha256},${item.verified},case when ${item.verified} then now() else null end,
            ${`oci:${item.target.region}:${item.target.bucket}`},${failureDomain},${item.verified ? "PASS" : "FAIL"})
          on conflict (clip_id,media_kind,storage_tier) do update set
            object_key=excluded.object_key,observed_byte_size=excluded.observed_byte_size,
            observed_sha256=excluded.observed_sha256,independently_verified=excluded.independently_verified,
            verified_at=excluded.verified_at,storage_location_id=excluded.storage_location_id,
            failure_domain_id=excluded.failure_domain_id,verification_result=excluded.verification_result
          where bridge_production_copy_verifications.verification_result <> 'PASS'`;
      }
      await tx`update bridge_production_ingest_manifests set discovered_clip_count=1,
        reconciliation_result=${allVerified ? "PASS" : "FAIL"},reconciled_at=now()
        where id=${data.manifestId}`;
      await tx`update bridge_production_clips set automated_result=${ledger.automatedResult},
        automated_reasons=${JSON.stringify(ledger.automatedReasons)}::jsonb,updated_at=now() where id=${row.clip_id}`;
      await tx`update bridge_production_camera_cards set state=${allVerified ? "VERIFICATION_PENDING" : "QUARANTINED"},updated_at=now()
        where id=${row.camera_card_id}`;
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${data.productionId},${actor.userId},${allVerified ? "replicas.verified" : "replicas.failed"},'clip',${row.clip_id},
          ${JSON.stringify({ evidence: evidence.map(({ tier, target, byteSize, sha256, verified, error }) => ({ tier, region: target.region, bucket: target.bucket, byteSize, sha256, verified, error })) })}::jsonb)`;
      await writeAudit({ actorUserId: actor.userId, action: allVerified ? "dit.replica.verified" : "dit.replica.failed", entityType: "bridge_production", entityId: data.productionId, metadata: { clipId: row.clip_id, allVerified } }, tx);
    });
    return { verified: allVerified, cardState: allVerified ? "VERIFICATION_PENDING" : "QUARANTINED",
      copies: evidence.map(({ tier, byteSize, sha256, verified, error }) => ({ tier, byteSize, sha256, verified, error })) };
  });

const reviewInput = z.object({ clipId: z.string().uuid(), decision: z.enum(["ACCEPTED", "REJECTED"]), note: z.string().trim().min(5).max(1000) });
export const reviewDitClip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reviewInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    if (!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) throw new Error("Independent DIT reviewer role required");
    const rows = await sql<{ production_id: string; title_id: string; owner_user_id: string; owner_account_type: string; owner_organization_id: string | null }>`
      select m.production_id,p.title_id,t.owner_user_id,t.owner_account_type,t.owner_organization_id
      from bridge_production_clips c join bridge_production_ingest_manifests m on m.id=c.manifest_id
      join bridge_productions p on p.id=m.production_id join bridge_titles t on t.id=p.title_id
      where c.id=${data.clipId} limit 1
    `;
    const row = rows[0];
    if (!row || !actor.internalRole) throw new Error("Clip not found");
    await sql.transaction(async (tx) => {
      await tx`update bridge_production_clips set human_disposition=${data.decision},
        human_reviewer_id=${actor.userId},human_reviewed_at=now(),updated_at=now() where id=${data.clipId}`;
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${row.production_id},${actor.userId},'clip.human_reviewed','clip',${data.clipId},${JSON.stringify({ decision: data.decision, note: data.note })}::jsonb)`;
      await writeAudit({ actorUserId: actor.userId, action: "dit.clip.reviewed", entityType: "bridge_production", entityId: row.production_id, metadata: { clipId: data.clipId, decision: data.decision, note: data.note } }, tx);
    });
    return { ok: true, decision: data.decision };
  });

const signoffInput = z.object({ productionId: z.string().uuid(), shootingDayId: z.string().uuid(), cameraCardId: z.string().uuid() });
export const signoffDitCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(signoffInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    if (!actor.internalRole || !["admin", "super_admin"].includes(actor.internalRole)) throw new Error("Independent DIT reviewer role required");
    const rows = await sql<{
      clip_id: string; clip_number: string; original_filename: string; original_relative_path: string; byte_size: number;
      checksum_sha256: string; has_video: boolean; has_audio: boolean; duration_ms: number; frame_rate: number | null;
      width: number | null; height: number | null; codec: string | null; camera_id: "A" | "B" | "C"; card_no: string;
      automated_result: "PASS" | "WARNING" | "FAIL" | "NOT_CHECKED"; automated_reasons: string[];
      human_disposition: "ACCEPTED" | "REJECTED" | null; human_reviewer_id: string | null; human_reviewed_at: string | null;
      manifest_result: "PASS" | "WARNING" | "FAIL" | "NOT_CHECKED";
    }>`
      select c.id as clip_id,c.clip_number,c.original_filename,c.original_relative_path,c.byte_size,c.checksum_sha256,
        c.has_video,c.has_audio,c.duration_ms,c.frame_rate,c.width,c.height,c.codec,card.camera_id,card.card_no,
        c.automated_result,c.automated_reasons,c.human_disposition,c.human_reviewer_id,c.human_reviewed_at,m.reconciliation_result as manifest_result
      from bridge_production_clips c join bridge_production_ingest_manifests m on m.id=c.manifest_id
      join bridge_production_camera_cards card on card.id=m.camera_card_id
      where m.production_id=${data.productionId} and m.shooting_day_id=${data.shootingDayId} and m.camera_card_id=${data.cameraCardId}
      order by c.clip_number
    `;
    const copies = await sql<{
      id: string; clip_number: string; media_kind: string; storage_tier: string; expected_byte_size: number;
      expected_sha256: string; observed_byte_size: number | null; observed_sha256: string | null;
      independently_verified: boolean; verified_at: string | null; storage_location_id: string; failure_domain_id: string;
    }>`
      select v.id,c.clip_number,v.media_kind,v.storage_tier,v.expected_byte_size,v.expected_sha256,
        v.observed_byte_size,v.observed_sha256,v.independently_verified,v.verified_at,v.storage_location_id,v.failure_domain_id
      from bridge_production_copy_verifications v join bridge_production_clips c on c.id=v.clip_id
      join bridge_production_ingest_manifests m on m.id=c.manifest_id
      where m.production_id=${data.productionId} and m.shooting_day_id=${data.shootingDayId} and m.camera_card_id=${data.cameraCardId}
    `;
    const ledger: ClipLedgerEntry[] = rows.map((r) => ({
      clipNumber: r.clip_number, originalFilename: r.original_filename, originalRelativePath: r.original_relative_path,
      byteSize: Number(r.byte_size), checksumSha256: r.checksum_sha256, hasVideo: r.has_video, hasAudio: r.has_audio,
      durationMs: Number(r.duration_ms), frameRate: r.frame_rate === null ? null : Number(r.frame_rate),
      width: r.width, height: r.height, codec: r.codec, camera: "A", cardNo: "",
      automatedResult: r.automated_result, automatedReasons: r.automated_reasons ?? [],
      humanDisposition: r.human_disposition, humanReviewerId: r.human_reviewer_id, humanReviewedAt: r.human_reviewed_at,
    }));
    const copyEvidence: CopyVerification[] = copies.map((r) => ({
      copyId: r.id, clipNumber: r.clip_number, kind: r.media_kind as "RAW" | "AUDIO" | "STILLS" | "CONVERTED",
      tier: r.storage_tier as "MASTER" | "BACKUP_1" | "BACKUP_2", expectedByteSize: Number(r.expected_byte_size),
      expectedSha256: r.expected_sha256, observedByteSize: r.observed_byte_size === null ? null : Number(r.observed_byte_size),
      observedSha256: r.observed_sha256, independentlyVerified: r.independently_verified, verifiedAt: r.verified_at,
      storageLocationId: r.storage_location_id, failureDomainId: r.failure_domain_id,
    }));
    const result = evaluateDitSignoff({
      reviewerId: actor.userId, reviewedAt: new Date().toISOString(), clipLedger: ledger,
      manifestResult: rows.length && rows.every((r) => r.manifest_result === "PASS") ? "PASS" : "FAIL",
      requiredCopies: copyEvidence, audioCount: 0, stillsCount: 0,
    });
    await sql.transaction(async (tx) => {
      await tx`insert into bridge_production_dit_signoffs(production_id,shooting_day_id,reviewer_id,eligible,card_safe_to_reuse,blockers,evidence_snapshot)
        values (${data.productionId},${data.shootingDayId},${actor.userId},${result.eligible},${result.cardSafeToReuse},
          ${JSON.stringify(result.blockers)}::jsonb,${JSON.stringify({ clipCount: rows.length, copyCount: copies.length, manifestResults: rows.map((r) => r.manifest_result) })}::jsonb)`;
      await tx`update bridge_production_camera_cards set state=${result.cardSafeToReuse ? "SAFE_TO_REUSE" : "VERIFICATION_PENDING"},updated_at=now()
        where id=${data.cameraCardId} and shooting_day_id=${data.shootingDayId}`;
      await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
        values (${data.productionId},${actor.userId},${result.eligible ? "dit.signoff.passed" : "dit.signoff.blocked"},'camera_card',${data.cameraCardId},
          ${JSON.stringify({ eligible: result.eligible, blockers: result.blockers })}::jsonb)`;
      await writeAudit({ actorUserId: actor.userId, action: result.eligible ? "dit.signoff.passed" : "dit.signoff.blocked", entityType: "bridge_production", entityId: data.productionId, metadata: { cameraCardId: data.cameraCardId, blockers: result.blockers } }, tx);
    });
    return result;
  });

const approvedDitProfiles: ConversionProfile[] = [
  { resolution: "720p", outputType: "Proxy", codec: "H.264 High", container: "MP4", width: 1280, height: 720 },
  { resolution: "1080p", outputType: "Proxy", codec: "H.264 High", container: "MP4", width: 1920, height: 1080 },
  { resolution: "720p", outputType: "ProRes", codec: "Apple ProRes 422 LT", container: "MOV", width: 1280, height: 720 },
  { resolution: "1080p", outputType: "ProRes", codec: "Apple ProRes 422 HQ", container: "MOV", width: 1920, height: 1080 },
];

const queueConversionInput = z.object({
  clipId: z.string().uuid(),
  resolution: z.enum(["720p", "1080p"]),
  outputType: z.enum(["Proxy", "ProRes"]),
});
export const queueDitConversion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(queueConversionInput)
  .handler(async ({ context, data }) => {
    assertDitStagingDatabase();
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string; production_id: string; title_id: string; owner_user_id: string; owner_account_type: string;
      owner_organization_id: string | null; clip_number: string; original_filename: string; original_relative_path: string;
      byte_size: number; checksum_sha256: string; has_video: boolean; has_audio: boolean; duration_ms: number;
      frame_rate: number | null; width: number | null; height: number | null; codec: string | null;
      automated_result: "PASS" | "WARNING" | "FAIL" | "NOT_CHECKED"; automated_reasons: string[];
      human_disposition: "ACCEPTED" | "REJECTED" | null; human_reviewer_id: string | null; human_reviewed_at: string | null;
      source_object_key: string | null; source_copy_result: string | null;
    }>`
      select c.id,m.production_id,p.title_id,t.owner_user_id,t.owner_account_type,t.owner_organization_id,
        c.clip_number,c.original_filename,c.original_relative_path,c.byte_size,c.checksum_sha256,c.has_video,c.has_audio,
        c.duration_ms,c.frame_rate,c.width,c.height,c.codec,c.automated_result,c.automated_reasons,
        c.human_disposition,c.human_reviewer_id,c.human_reviewed_at,
        (select v.object_key from bridge_production_copy_verifications v where v.clip_id=c.id and v.media_kind='RAW' and v.storage_tier='MASTER' and v.verification_result='PASS' limit 1) as source_object_key,
        (select v.verification_result from bridge_production_copy_verifications v where v.clip_id=c.id and v.media_kind='RAW' and v.storage_tier='MASTER' limit 1) as source_copy_result
      from bridge_production_clips c join bridge_production_ingest_manifests m on m.id=c.manifest_id
      join bridge_productions p on p.id=m.production_id join bridge_titles t on t.id=p.title_id
      where c.id=${data.clipId} limit 1
    `;
    const row = rows[0];
    if (!row || !canOperateOnTitle(actor, { ownerUserId: row.owner_user_id,
      ownerAccountType: row.owner_account_type as "independent_creator" | "studio" | "buyer" | "investor",
      ownerOrganizationId: row.owner_organization_id }, "production.dit_operate", "production.dit_operate")) throw new Error("Forbidden");
    if (!row.source_object_key || row.source_copy_result !== "PASS") throw new Error("Verified MASTER RAW source copy is required");
    const clip: ClipLedgerEntry = {
      clipNumber: row.clip_number, originalFilename: row.original_filename, originalRelativePath: row.original_relative_path,
      byteSize: Number(row.byte_size), checksumSha256: row.checksum_sha256, hasVideo: row.has_video, hasAudio: row.has_audio,
      durationMs: Number(row.duration_ms), frameRate: row.frame_rate === null ? null : Number(row.frame_rate),
      width: row.width, height: row.height, codec: row.codec, camera: "A", cardNo: "",
      automatedResult: row.automated_result, automatedReasons: row.automated_reasons ?? [],
      humanDisposition: row.human_disposition, humanReviewerId: row.human_reviewer_id, humanReviewedAt: row.human_reviewed_at,
    };
    const jobId = randomUUID();
    const job = queueConversion({ jobId, clip, sourceVerified: true, resolution: data.resolution,
      outputType: data.outputType, approvedProfiles: approvedDitProfiles, at: new Date().toISOString() });
    await sql`insert into bridge_production_conversion_jobs(id,clip_id,source_sha256,profile,state,attempt,history)
      values (${jobId},${data.clipId},${job.sourceSha256},${JSON.stringify(job.profile)}::jsonb,'QUEUED',0,${JSON.stringify(job.history)}::jsonb)`;
    await sql`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
      values (${row.production_id},${actor.userId},'conversion.queued','conversion_job',${jobId},${JSON.stringify({ clipId: data.clipId, profile: job.profile })}::jsonb)`;
    return { jobId, state: "QUEUED" as const, profile: job.profile };
  });

type DitWorkerJob = {
  id: string; clip_id: string; source_sha256: string; profile: ConversionProfile;
  source_object_key: string; production_name: string; production_no: string; shooting_date: string;
  camera_id: "A" | "B" | "C"; card_no: string; original_relative_path: string; clip_number: string;
};

export async function claimNextDitConversionJob(workerId: string) {
  assertDitStagingDatabase();
  if (!workerId.trim() || workerId.length > 120) throw new Error("Worker identity required");
  const targets = replicaTargets();
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const jobs = await tx<DitWorkerJob>`
      select j.id,j.clip_id,j.source_sha256,j.profile,
        v.object_key as source_object_key,p.production_name,p.production_no,d.shooting_date::text,
        c.camera_id,c.card_no,cl.original_relative_path,cl.clip_number
      from bridge_production_conversion_jobs j
      join bridge_production_clips cl on cl.id=j.clip_id
      join bridge_production_ingest_manifests m on m.id=cl.manifest_id
      join bridge_productions p on p.id=m.production_id
      join bridge_production_shooting_days d on d.id=m.shooting_day_id
      join bridge_production_camera_cards c on c.id=m.camera_card_id
      join bridge_production_copy_verifications v on v.clip_id=cl.id and v.media_kind='RAW' and v.storage_tier='MASTER' and v.verification_result='PASS'
      where j.state in ('QUEUED','RETRY_REQUIRED')
      order by j.created_at
      for update of j skip locked limit 1
    `;
    const job = jobs[0];
    if (!job) return { job: null };
    const source = await signDownload({ key: job.source_object_key, expiresIn: 900 });
    const extension = job.profile.container.toLowerCase();
    const filename = `${job.clip_number.replace(/[^a-zA-Z0-9_-]/g, "_")}-${job.profile.outputType.toLowerCase()}.${extension}`;
    const masterKey = buildVaultObjectKey({ filmName: job.production_name, productionNo: job.production_no,
      tier: "MASTER", date: job.shooting_date, camera: job.camera_id, cardNo: job.card_no, kind: "CONVERTED" }) + filename;
    const backupKey = buildVaultObjectKey({ filmName: job.production_name, productionNo: job.production_no,
      tier: "BACKUP_1", date: job.shooting_date, camera: job.camera_id, cardNo: job.card_no, kind: "CONVERTED" }) + filename;
    const masterUpload = await signUpload({ key: masterKey, contentType: job.profile.container === "MP4" ? "video/mp4" : "video/quicktime", expiresIn: 900 });
    const backupUpload = await signUploadAtTarget({ key: backupKey, contentType: job.profile.container === "MP4" ? "video/mp4" : "video/quicktime", target: targets.backup1, expiresIn: 900 });
    const history = [{ state: "PROCESSING", at: new Date().toISOString(), detail: `Worker ${workerId} claimed job` }];
    await tx`update bridge_production_conversion_jobs set state='PROCESSING',attempt=attempt+1,
      history=history || ${JSON.stringify(history)}::jsonb,updated_at=now() where id=${job.id}`;
    return { job: { jobId: job.id, sourceUrl: source.url, sourceSha256: job.source_sha256,
      masterUploadUrl: masterUpload.url, backupUploadUrl: backupUpload.url,
      masterKey, backupKey, profile: job.profile, workerId } };
  });
}

const conversionCompleteInput = z.object({
  jobId: z.string().uuid(),
  master: z.object({ byteSize: z.number().int().positive(), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(), codec: z.string().min(1).max(100) }),
  backup1: z.object({ byteSize: z.number().int().positive(), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), width: z.number().int().positive(), height: z.number().int().positive(), codec: z.string().min(1).max(100) }),
});
export async function completeDitConversionJob(input: z.infer<typeof conversionCompleteInput>) {
  assertDitStagingDatabase();
  const data = conversionCompleteInput.parse(input);
  const sql = await getSql();
  const rows = await sql<DitWorkerJob>`
    select j.id,j.clip_id,j.source_sha256,j.profile,
      v.object_key as source_object_key,p.production_name,p.production_no,d.shooting_date::text,
      c.camera_id,c.card_no,cl.original_relative_path,cl.clip_number
    from bridge_production_conversion_jobs j
    join bridge_production_clips cl on cl.id=j.clip_id
    join bridge_production_ingest_manifests m on m.id=cl.manifest_id
    join bridge_productions p on p.id=m.production_id
    join bridge_production_shooting_days d on d.id=m.shooting_day_id
    join bridge_production_camera_cards c on c.id=m.camera_card_id
    join bridge_production_copy_verifications v on v.clip_id=cl.id and v.media_kind='RAW' and v.storage_tier='MASTER' and v.verification_result='PASS'
    where j.id=${data.jobId} and j.state='PROCESSING' limit 1
  `;
  const job = rows[0];
  if (!job) throw new Error("Conversion job is not processing");
  const targets = replicaTargets();
  const extension = job.profile.container.toLowerCase();
  const filename = `${job.clip_number.replace(/[^a-zA-Z0-9_-]/g, "_")}-${job.profile.outputType.toLowerCase()}.${extension}`;
  const masterKey = buildVaultObjectKey({ filmName: job.production_name, productionNo: job.production_no, tier: "MASTER",
    date: job.shooting_date, camera: job.camera_id, cardNo: job.card_no, kind: "CONVERTED" }) + filename;
  const backupKey = buildVaultObjectKey({ filmName: job.production_name, productionNo: job.production_no, tier: "BACKUP_1",
    date: job.shooting_date, camera: job.camera_id, cardNo: job.card_no, kind: "CONVERTED" }) + filename;
  const [masterHead, backupHead] = await Promise.all([
    verifyObjectAtTarget(masterKey, targets.master), verifyObjectAtTarget(backupKey, targets.backup1),
  ]);
  const [masterReadback, backupReadback] = await Promise.all([
    readObjectSha256AtTarget(masterKey, targets.master), readObjectSha256AtTarget(backupKey, targets.backup1),
  ]);
  const profileMatches = (item: typeof data.master) =>
    item.width === job.profile.width && item.height === job.profile.height &&
    item.codec.toLowerCase().includes(job.profile.codec === "H.264 High" ? "h264" : "prores");
  const masterOk = masterHead.byteSize === data.master.byteSize && masterReadback.byteSize === data.master.byteSize &&
    masterReadback.sha256.toLowerCase() === data.master.sha256.toLowerCase() && profileMatches(data.master);
  const backupOk = backupHead.byteSize === data.backup1.byteSize && backupReadback.byteSize === data.backup1.byteSize &&
    backupReadback.sha256.toLowerCase() === data.backup1.sha256.toLowerCase() && profileMatches(data.backup1);
  if (!masterOk || !backupOk) {
    await sql`update bridge_production_conversion_jobs set state='RETRY_REQUIRED',
      history=history || ${JSON.stringify([{ state: "RETRY_REQUIRED", at: new Date().toISOString(), detail: "Output read-back or profile verification failed" }])}::jsonb,
      updated_at=now() where id=${data.jobId}`;
    throw new Error("Conversion output read-back or profile verification failed");
  }
  const makeOutput = (id: string, tier: "MASTER" | "BACKUP_1", key: string, target: { region: string; bucket: string }, evidence: typeof data.master, readback: { byteSize: number; sha256: string }): ConversionCopyVerification => ({
    copyId: id, clipNumber: job.clip_number, kind: "CONVERTED", tier,
    expectedByteSize: evidence.byteSize, expectedSha256: evidence.sha256,
    observedByteSize: readback.byteSize, observedSha256: readback.sha256, independentlyVerified: true,
    verifiedAt: new Date().toISOString(), storageLocationId: `oci:${target.region}:${target.bucket}`,
    failureDomainId: `oci:${target.region}:${target.bucket}`,
    sourceSha256: job.source_sha256, probePassed: true, metadataMatchesProfile: true, qcResult: "PASS",
  });
  const master = makeOutput(`ditconv:${job.id}:MASTER`, "MASTER", masterKey, targets.master, data.master, masterReadback);
  const backup = makeOutput(`ditconv:${job.id}:BACKUP_1`, "BACKUP_1", backupKey, targets.backup1, data.backup1, backupReadback);
  const processing = { jobId: job.id, clipNumber: job.clip_number, sourceSha256: job.source_sha256,
    profile: job.profile, state: "PROCESSING" as const, attempt: 1, history: [], masterOutput: null, backup1Output: null };
  const completed = completeConversion(processing, master, backup, new Date().toISOString());
  await sql.transaction(async (tx) => {
    for (const item of [master, backup]) {
      await tx`insert into bridge_production_copy_verifications
        (id,clip_id,media_kind,storage_tier,object_key,expected_byte_size,expected_sha256,observed_byte_size,observed_sha256,
          independently_verified,verified_at,storage_location_id,failure_domain_id,verification_result)
        values (${item.copyId},${job.clip_id},'CONVERTED',${item.tier},${item.tier === "MASTER" ? masterKey : backupKey},
          ${item.expectedByteSize},${item.expectedSha256},${item.observedByteSize},${item.observedSha256},true,${item.verifiedAt},
          ${item.storageLocationId},${item.failureDomainId},'PASS')
        on conflict (clip_id,media_kind,storage_tier) do update set
          object_key=excluded.object_key,expected_byte_size=excluded.expected_byte_size,expected_sha256=excluded.expected_sha256,
          observed_byte_size=excluded.observed_byte_size,observed_sha256=excluded.observed_sha256,
          independently_verified=true,verified_at=excluded.verified_at,storage_location_id=excluded.storage_location_id,
          failure_domain_id=excluded.failure_domain_id,verification_result='PASS'
        where bridge_production_copy_verifications.verification_result <> 'PASS'`;
    }
    await tx`update bridge_production_conversion_jobs set state='COMPLETE',master_output_copy_id=${master.copyId},
      backup1_output_copy_id=${backup.copyId},completed_at=now(),history=history || ${JSON.stringify(completed.history)}::jsonb,
      updated_at=now() where id=${job.id}`;
    await tx`insert into bridge_production_audit_events(production_id,actor_user_id,action,entity_type,entity_id,metadata)
      select m.production_id,'dit-worker','conversion.completed','conversion_job',${job.id},
        ${JSON.stringify({ masterKey, backupKey, profile: job.profile })}::jsonb
      from bridge_production_ingest_manifests m where m.id=(select manifest_id from bridge_production_clips where id=${job.clip_id})`;
  });
  return { ok: true, state: "COMPLETE" as const, jobId: job.id };
}

export async function failDitConversionJob(jobId: string, reason: string) {
  assertDitStagingDatabase();
  const sql = await getSql();
  const safeReason = reason.trim().slice(0, 500) || "Worker failed";
  const rows = await sql<{ attempt: number; state: string }>`select attempt,state from bridge_production_conversion_jobs where id=${jobId} for update`;
  const job = rows[0];
  if (!job || job.state !== "PROCESSING") throw new Error("Conversion job is not processing");
  const next = job.attempt < 3 ? "RETRY_REQUIRED" : "FAILED";
  await sql`update bridge_production_conversion_jobs set state=${next},
    history=history || ${JSON.stringify([{ state: next, at: new Date().toISOString(), detail: safeReason }])}::jsonb,
    updated_at=now() where id=${jobId}`;
  return { state: next };
}
