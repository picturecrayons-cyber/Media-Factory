import { getSql } from "@/lib/db";
import { persistVerifiedAsset } from "./asset-confirmation";

/**
 * Claim and process one durable verification job. Invoke from a protected worker/cron
 * runtime; never expose this function through a public client route.
 */
const MAX_VERIFICATION_ATTEMPTS = 8;
const STALE_LOCK_MINUTES = 15;

/**
 * Claim one durable verification job. Expired worker leases are reclaimed,
 * while jobs that exhausted the bounded retry budget remain terminally failed.
 */
export async function processNextAssetVerificationJob(): Promise<{ processed: boolean; assetId?: string }> {
  const sql = await getSql();
  await sql.query(`
    update bridge_private.asset_verification_jobs
    set status='failed', locked_at=null,
        last_error=coalesce(last_error, 'Worker lease expired after retry budget exhausted'),
        updated_at=now()
    where status='running'
      and locked_at < now() - make_interval(mins => $1)
      and attempts >= $2
  `, [STALE_LOCK_MINUTES, MAX_VERIFICATION_ATTEMPTS]);
  const claimed = await sql.query<{ id: number; asset_id: string; session_id: string; attempts: number }>(`
    update bridge_private.asset_verification_jobs j
    set status='running', locked_at=now(), attempts=attempts+1, updated_at=now()
    where j.id = (
      select id from bridge_private.asset_verification_jobs
      where attempts < $1
        and available_at <= now()
        and (
          status in ('queued','failed')
          or (status='running' and locked_at < now() - make_interval(mins => $2))
        )
      order by available_at, created_at
      for update skip locked limit 1
    )
    returning j.id, j.asset_id, j.session_id, j.attempts
  `, [MAX_VERIFICATION_ATTEMPTS, STALE_LOCK_MINUTES]);
  const job = claimed[0];
  if (!job) return { processed: false };

  try {
    const rows = await sql.query<{
      asset_id: string; title_id: string; kind: string; source_key: string;
      content_type: string | null; byte_size: number | null; created_by: string;
      expected_size: number; actor_user_id: string; actor_is_internal: boolean; provider_upload_id: string;
    }>(`
      select a.id as asset_id, a.title_id, a.kind, a.s3_key as source_key,
        a.content_type, a.byte_size, a.created_by, s.expected_size, s.actor_user_id, s.actor_is_internal,
        s.provider_upload_id
      from public.bridge_assets a
      join bridge_private.upload_sessions s on s.asset_id=a.id
      where a.id=$1 and s.id=$2 and s.state='verification_pending'
      limit 1
    `, [job.asset_id, job.session_id]);
    const asset = rows[0];
    if (!asset) throw new Error("Verification job no longer matches an active asset session");
    if (asset.byte_size != null) {
      await sql.query(`
        update bridge_private.asset_verification_jobs set status='succeeded', updated_at=now()
        where id=$1
      `, [job.id]);
      await sql.query(`
        update bridge_private.upload_sessions set state='verified', updated_at=now() where id=$1
      `, [job.session_id]);
      return { processed: true, assetId: job.asset_id };
    }

    const { verifyObject, sealVerifiedObject, computeObjectSha256, storageTarget } =
      await import("./oci-object-storage.server");
    const source = await verifyObject(asset.source_key, asset.content_type);
    if (source.byteSize !== Number(asset.expected_size) || !source.etag) {
      throw new Error("Uploaded object size or ETag does not match the durable upload session");
    }
    const verifiedKey = `${asset.source_key}.verified/${asset.asset_id}`;
    const sealed = await sealVerifiedObject(asset.source_key, verifiedKey, source.etag);
    if (sealed.byteSize !== source.byteSize || !sealed.etag) {
      throw new Error("Immutable verified copy does not match the uploaded object");
    }
    const checksumSha256 = await computeObjectSha256(verifiedKey);
    if (!/^[a-f0-9]{64}$/.test(checksumSha256)) throw new Error("Storage SHA-256 digest is invalid");
    const storage = await storageTarget();
    const persisted = await persistVerifiedAsset(sql, {
      assetId: asset.asset_id,
      actorUserId: asset.actor_user_id,
      internalActor: asset.actor_is_internal,
      titleId: asset.title_id,
      kind: asset.kind,
      byteSize: sealed.byteSize,
      contentType: sealed.contentType,
      checksum: sealed.etag,
      checksumSha256,
      storage,
      objectVersionId: sealed.versionId ?? null,
      sourceKey: asset.source_key,
      sealedKey: verifiedKey,
    });
    if (!persisted) throw new Error("Verified asset state could not be atomically persisted");
    await sql.query(`
      update bridge_private.upload_sessions set state='verified', updated_at=now() where id=$1
    `, [job.session_id]);
    await sql.query(`
      update bridge_private.asset_verification_jobs set status='succeeded', locked_at=null,
        last_error=null, updated_at=now() where id=$1
    `, [job.id]);
    return { processed: true, assetId: job.asset_id };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Unknown verification failure").slice(0, 1000);
    await sql.query(`
      update bridge_private.asset_verification_jobs
      set status='failed', locked_at=null, last_error=$2,
          available_at=now() + make_interval(secs => least(3600, 15 * power(2, least(attempts, 7))::int)),
          updated_at=now()
      where id=$1
    `, [job.id, message]);
    throw error;
  }
}
