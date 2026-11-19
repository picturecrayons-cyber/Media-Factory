#!/usr/bin/env node
/**
 * One-way, manual Production -> Testing catalog sync.
 *
 * Default mode is dry-run. Writes require --apply plus explicit environment guards.
 * Production DB is forced read-only. Only catalog metadata and verified poster
 * objects are copied. Masters, screeners, subtitles, rights, QC, legal, payments,
 * accounts, owner identities, and publication approvals are never copied.
 */
import pg from "pg";
import { basename, extname } from "node:path";

const PRODUCTION_REF = "mlmgugivsyoxzdgwkbpu";
const TESTING_REF = "jbymleftneggcgutlcqu";
const MIRROR_OWNER_ID = required("BRIDGE_SYNC_TESTING_OWNER_USER_ID");

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function assertDatabaseRef(name, expectedRef) {
  const raw = required(name);
  const parsed = new URL(raw);
  const identity = `${parsed.hostname} ${decodeURIComponent(parsed.username)}`;
  if (!identity.includes(expectedRef)) {
    throw new Error(`${name} must point to approved project ${expectedRef}`);
  }
  return raw;
}

const sourceUrl = assertDatabaseRef("BRIDGE_SYNC_PRODUCTION_DATABASE_URL", PRODUCTION_REF);
const targetUrl = assertDatabaseRef("BRIDGE_SYNC_TESTING_DATABASE_URL", TESTING_REF);
if (sourceUrl === targetUrl) throw new Error("Source and target database URLs must be different");

const sourceBucket = required("OCI_BUCKET_NAME");
const testingBucket = required("OCI_TESTING_BUCKET_NAME");
if (sourceBucket === testingBucket) throw new Error("Testing OCI bucket must be separate from Production bucket");

const apply = process.argv.includes("--apply");
if (apply && process.env.BRIDGE_SYNC_TARGET !== "testing") {
  throw new Error("Writes are blocked unless BRIDGE_SYNC_TARGET=testing");
}
if (apply && process.env.BRIDGE_SYNC_ALLOW_PRODUCTION_READ !== "true") {
  throw new Error("Writes are blocked unless BRIDGE_SYNC_ALLOW_PRODUCTION_READ=true");
}

const source = new pg.Pool({ connectionString: sourceUrl, max: 1, ssl: { rejectUnauthorized: false } });
const target = new pg.Pool({ connectionString: targetUrl, max: 1, ssl: { rejectUnauthorized: false } });

try {
  // Enforce read-only at the Production connection session.
  await source.query("SET default_transaction_read_only = on");

  const [titlesResult, postersResult, loopResult] = await Promise.all([
    source.query(`
      select id, slug, name, name_ml, synopsis, language, year, runtime_minutes,
             submission_type, content_type, original_title, original_language,
             country_of_origin, release_date, long_synopsis, genres, credits,
             keywords, external_ids, created_at, updated_at
        from public.bridge_titles
       where id <> 'bridge-oci-e2e-7be3ab166df28709'
       order by id
    `),
    source.query(`
      select a.id, a.title_id, a.kind, a.s3_key, a.content_type, a.byte_size,
             t.name as title_name
        from public.bridge_assets a
        join public.bridge_titles t on t.id = a.title_id
       where a.kind in ('poster','poster_vertical')
         and a.s3_key = t.poster_key
         and coalesce(a.byte_size,0) > 0
         and a.content_type like 'image/%'
         and t.id <> 'bridge-oci-e2e-7be3ab166df28709'
       order by a.title_id
    `),
    source.query(`
      select id::text as id, bridge_title_id, slug, title, synopsis, language,
             year, duration_minutes, maturity_rating, metadata, created_at, updated_at
        from public.loop_titles
       order by id
    `),
  ]);

  const titles = titlesResult.rows;
  const posters = postersResult.rows;
  const loopTitles = loopResult.rows;
  const posterByTitle = new Map(posters.map((poster) => [poster.title_id, poster]));
  const destinationKeys = new Map();

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    sourceProject: PRODUCTION_REF,
    targetProject: TESTING_REF,
    bridgeTitles: titles.length,
    verifiedPosterAssets: posters.length,
    loopTitles: loopTitles.length,
    sourceBucket,
    testingBucket,
    excluded: ["master videos", "screeners", "subtitles", "rights/legal/QC records", "payments", "accounts", "owner identities", "publication approvals"],
  }, null, 2));

  if (!apply) {
    console.log("DRY_RUN_ONLY: no database or object storage writes performed. Re-run with --apply after Testing bucket and credentials are verified.");
    process.exitCode = 0;
  } else {
    const { verifyObject, sealVerifiedObject } = await import("../src/lib/bridge/oci-object-storage.server.ts");

    // Copy only the exact poster currently referenced by each Bridge title.
    for (const poster of posters) {
      const verifiedSource = await verifyObject(poster.s3_key, poster.content_type, sourceBucket);
      if (!verifiedSource.etag || verifiedSource.byteSize !== Number(poster.byte_size)) {
        throw new Error(`Source poster verification failed for title ${poster.title_id}`);
      }
      const extension = extname(basename(poster.s3_key)).slice(0, 12) || ".img";
      const targetKey = `testing/catalog-posters/${poster.title_id}/${poster.id}${extension}`;
      const copied = await sealVerifiedObject(
        poster.s3_key,
        targetKey,
        verifiedSource.etag,
        undefined,
        testingBucket,
      );
      if (copied.byteSize !== verifiedSource.byteSize) {
        throw new Error(`Copied poster size mismatch for title ${poster.title_id}`);
      }
      destinationKeys.set(poster.title_id, targetKey);
    }

    await target.query("BEGIN");
    try {
      for (const title of titles) {
        const posterKey = destinationKeys.get(title.id) ?? null;
        await target.query(`
          insert into public.bridge_titles (
            id, slug, name, name_ml, owner_user_id, owner_account_type, status,
            synopsis, language, year, runtime_minutes, licensing_fee_paise,
            poster_key, master_key, legacy_id, created_at, updated_at,
            submission_type, content_type, original_title, original_language,
            country_of_origin, release_date, long_synopsis, genres, credits,
            keywords, external_ids, owner_organization_id
          ) values (
            $1,$2,$3,$4,$5,'studio','DRAFT',
            $6,$7,$8,$9,0,
            $10,null,null,$11,$12,
            $13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,
            $22::jsonb,$23::jsonb,null
          )
          on conflict (id) do update set
            slug=excluded.slug, name=excluded.name, name_ml=excluded.name_ml,
            synopsis=excluded.synopsis, language=excluded.language, year=excluded.year,
            runtime_minutes=excluded.runtime_minutes, poster_key=excluded.poster_key,
            status='DRAFT', master_key=null, licensing_fee_paise=0,
            submission_type=excluded.submission_type, content_type=excluded.content_type,
            original_title=excluded.original_title, original_language=excluded.original_language,
            country_of_origin=excluded.country_of_origin, release_date=excluded.release_date,
            long_synopsis=excluded.long_synopsis, genres=excluded.genres,
            credits=excluded.credits, keywords=excluded.keywords,
            external_ids=excluded.external_ids, updated_at=now()
        `, [
          title.id, title.slug, title.name, title.name_ml, MIRROR_OWNER_ID,
          title.synopsis ?? "", title.language ?? "Malayalam", title.year,
          title.runtime_minutes, posterKey, title.created_at, title.updated_at,
          title.submission_type ?? "finished_film", title.content_type ?? "FEATURE",
          title.original_title, title.original_language, title.country_of_origin,
          title.release_date, title.long_synopsis,
          JSON.stringify(title.genres ?? []), JSON.stringify(title.credits ?? []),
          JSON.stringify(title.keywords ?? []), JSON.stringify(title.external_ids ?? {}),
        ]);

        const poster = posterByTitle.get(title.id);
        if (poster && posterKey) {
          const mirrorAssetId = `testing-poster-${poster.id}`;
          await target.query(`
            insert into public.bridge_assets (
              id, title_id, kind, s3_key, content_type, byte_size, created_by,
              created_at, original_filename, storage_provider, storage_bucket,
              storage_namespace, storage_region
            ) values ($1,$2,$3,$4,$5,$6,$7,now(),$8,'oci',$9,$10,$11)
            on conflict (id) do update set
              s3_key=excluded.s3_key, content_type=excluded.content_type,
              byte_size=excluded.byte_size, storage_provider='oci',
              storage_bucket=excluded.storage_bucket, storage_namespace=excluded.storage_namespace,
              storage_region=excluded.storage_region
          `, [
            mirrorAssetId, title.id, poster.kind, posterKey, poster.content_type,
            Number(poster.byte_size), MIRROR_OWNER_ID, basename(poster.s3_key),
            testingBucket, process.env.OCI_NAMESPACE || null, process.env.OCI_REGION || null,
          ]);
        }
      }

      for (const loopTitle of loopTitles) {
        const posterKey = loopTitle.bridge_title_id
          ? destinationKeys.get(loopTitle.bridge_title_id) ?? null
          : null;
        const metadata = loopTitle.metadata && typeof loopTitle.metadata === "object"
          ? loopTitle.metadata
          : {};
        const genres = Array.isArray(metadata.genres) ? metadata.genres.map(String) : [];
        await target.query(`
          insert into public.loop_titles (
            id, bridge_title_id, slug, title, synopsis, language, genres,
            runtime_minutes, release_year, age_rating, access_tier, price_paise,
            poster_url, backdrop_url, trailer_url, status, is_listed, is_published,
            created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'FREE',0,$11,null,null,'DRAFT',false,false,$12,$13)
          on conflict (id) do update set
            bridge_title_id=excluded.bridge_title_id, slug=excluded.slug,
            title=excluded.title, synopsis=excluded.synopsis, language=excluded.language,
            genres=excluded.genres, runtime_minutes=excluded.runtime_minutes,
            release_year=excluded.release_year, age_rating=excluded.age_rating,
            access_tier='FREE', price_paise=0, poster_url=excluded.poster_url,
            backdrop_url=null, trailer_url=null, status='DRAFT',
            is_listed=false, is_published=false, updated_at=now()
        `, [
          loopTitle.id, loopTitle.bridge_title_id, loopTitle.slug, loopTitle.title,
          loopTitle.synopsis, loopTitle.language, genres, loopTitle.duration_minutes,
          loopTitle.year, loopTitle.maturity_rating, posterKey,
          loopTitle.created_at, loopTitle.updated_at,
        ]);
      }
      await target.query("COMMIT");
    } catch (error) {
      await target.query("ROLLBACK");
      throw error;
    }

    const verification = await target.query(`
      select
        (select count(*)::int from public.bridge_titles where owner_user_id=$1) as bridge_titles,
        (select count(*)::int from public.bridge_assets where created_by=$1 and kind in ('poster','poster_vertical')) as poster_assets,
        (select count(*)::int from public.loop_titles where status='DRAFT' and is_listed=false and is_published=false) as loop_titles
    `, [MIRROR_OWNER_ID]);
    console.log(JSON.stringify({
      status: "SYNCED",
      destinationProject: TESTING_REF,
      destinationBucket: testingBucket,
      expected: { bridgeTitles: titles.length, posterAssets: posters.length, loopTitles: loopTitles.length },
      verified: verification.rows[0],
      productionWrites: 0,
    }, null, 2));
  }
} finally {
  await Promise.all([source.end(), target.end()]);
}
