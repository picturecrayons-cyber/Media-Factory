import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { verifyObject } from "../src/lib/bridge/oci-object-storage.server.ts";

const EXPECTED_PROJECT_REF = "mlmgugivsyoxzdgwkbpu";
const EXPECTED_BUCKET = "bucket-20260526-1544";
const EXPECTED_REGION = "ap-mumbai-1";
const TITLES = [
  { id: "f15e0a5385aaf8365f6ad730de747da0", name: "Pranayam 1947" },
  { id: "cb8c141dc72d727a53a4f35d8851e100", name: "Jananam 1947 Pranayam Thudarunnu" },
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = new URL(required("SUPABASE_URL"));
assert.equal(supabaseUrl.hostname.split(".")[0], EXPECTED_PROJECT_REF,
  "Refusing to query a Supabase project other than canonical Crayons Bridge Production");
assert.equal(process.env.OCI_BUCKET_NAME, EXPECTED_BUCKET, "Unexpected OCI bucket; refusing to continue");
assert.equal(process.env.OCI_REGION, EXPECTED_REGION, "Unexpected OCI region; refusing to continue");

const { Pool } = pg;
const pool = new Pool({
  connectionString: required("DATABASE_URL"),
  max: 1,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 5000,
  application_name: "bridge-production-readonly-oci-master-verification",
});

const report = {
  generatedAt: new Date().toISOString(),
  mode: "READ_ONLY",
  projectRef: EXPECTED_PROJECT_REF,
  region: EXPECTED_REGION,
  bucket: EXPECTED_BUCKET,
  titles: [],
  totals: { candidates: 0, exists: 0, missing: 0, errors: 0 },
  note: "OCI ETag is recorded as returned by Object Storage; it is not represented as a SHA-256 checksum.",
};

try {
  const client = await pool.connect();
  let candidates;
  try {
    await client.query("BEGIN READ ONLY");
    const titleRows = await client.query(
      `SELECT id::text AS id, name, status, owner_user_id::text AS owner_user_id, master_key
         FROM public.bridge_titles
        WHERE id::text = ANY($1::text[])
        ORDER BY id::text`,
      [TITLES.map((title) => title.id)],
    );
    for (const expected of TITLES) {
      const actual = titleRows.rows.find((row) => row.id === expected.id);
      assert.ok(actual, `Expected Production title not found: ${expected.name}`);
      assert.equal(actual.name, expected.name, `Title identity mismatch for ${expected.id}`);
    }
    const assetRows = await client.query(
      `SELECT a.id::text AS asset_id, a.title_id::text AS title_id, a.kind,
              a.s3_key, a.content_type, a.byte_size, a.created_at,
              t.name AS title_name, t.owner_user_id::text AS owner_user_id
         FROM public.bridge_assets a
         JOIN public.bridge_titles t ON t.id = a.title_id
        WHERE a.title_id::text = ANY($1::text[])
          AND a.kind = 'master'
        ORDER BY a.title_id, a.created_at DESC`,
      [TITLES.map((title) => title.id)],
    );
    candidates = assetRows.rows;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  assert.ok(candidates.length > 0, "No existing master candidates found; refusing an empty verification");
  report.totals.candidates = candidates.length;
  for (const title of TITLES) {
    const titleCandidates = candidates.filter((row) => row.title_id === title.id);
    const titleReport = {
      titleId: title.id,
      titleName: title.name,
      candidateCount: titleCandidates.length,
      canonicalMasterLinked: Boolean(titleRows.rows.find((row) => row.id === title.id)?.master_key),
      objects: [],
    };
    for (const candidate of titleCandidates) {
      const expectedPrefix = `bridge/${candidate.owner_user_id}/${candidate.title_id}/master/`;
      if (!candidate.s3_key?.startsWith(expectedPrefix)) {
        titleReport.objects.push({
          assetId: candidate.asset_id,
          objectKey: candidate.s3_key,
          result: "REJECTED_PATH_MISMATCH",
        });
        report.totals.errors++;
        continue;
      }
      try {
        const actual = await verifyObject(candidate.s3_key);
        const contentTypeMatches = !candidate.content_type || candidate.content_type === actual.contentType;
        titleReport.objects.push({
          assetId: candidate.asset_id,
          objectKey: candidate.s3_key,
          result: "EXISTS",
          databaseByteSize: candidate.byte_size === null ? null : Number(candidate.byte_size),
          actualByteSize: actual.byteSize,
          contentType: actual.contentType,
          expectedContentType: candidate.content_type,
          contentTypeMatches,
          etag: actual.etag,
          createdAt: candidate.created_at,
        });
        report.totals.exists++;
        if (!contentTypeMatches) report.totals.errors++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const missing = /\(404\)/.test(message);
        titleReport.objects.push({
          assetId: candidate.asset_id,
          objectKey: candidate.s3_key,
          result: missing ? "NOT_FOUND" : "ERROR",
          error: message,
        });
        report.totals[missing ? "missing" : "errors"]++;
      }
    }
    report.titles.push(titleReport);
  }
} finally {
  await pool.end();
}

report.status = report.totals.missing === 0 && report.totals.errors === 0 &&
  report.totals.exists === report.totals.candidates ? "PASS" : "REVIEW_REQUIRED";
await writeFile("oci-production-master-verification-report.json", JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
