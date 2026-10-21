import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("BLOCKED: DATABASE_URL is required. No database was contacted.");
  process.exit(2);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(`
      select
        t.id, t.name, t.original_title, t.language, t.original_language,
        t.year, t.runtime_minutes, t.country_of_origin, t.release_date,
        t.status, t.legacy_id, t.poster_key, t.master_key,
        t.merged_into_title_id,
        (select count(*)::int from public.bridge_assets a where a.title_id = t.id) as asset_rows,
        (select count(*)::int from public.bridge_qc_cases q where q.title_id = t.id) as qc_cases,
        (select count(*)::int from public.bridge_rights_grants r where r.title_id = t.id and r.status in ('VALID','ACTIVE')) as valid_rights_grants
      from public.bridge_titles t
      order by lower(t.name), t.id
    `);

    const findings = [];
    const byOriginalTitle = new Map();
    for (const title of rows) {
      const add = (severity, code, detail) => findings.push({
        severity, code, titleId: title.id, title: title.name, detail,
      });

      if (title.merged_into_title_id) {
        add("INFO", "MERGED_RECORD", `Record points to canonical title ${title.merged_into_title_id}; do not count it as an independent title.`);
      }
      if (!String(title.name ?? "").trim()) add("BLOCK", "MISSING_TITLE", "Title name is empty.");
      if (!String(title.language ?? "").trim()) add("REVIEW", "MISSING_LANGUAGE", "Language is missing.");
      if (title.year == null) add("REVIEW", "MISSING_YEAR", "Release year is missing.");
      if (!title.poster_key) add("REVIEW", "MISSING_POSTER", "No canonical poster key is set.");
      if (!title.master_key) add(["PREPARING", "UPLOADING", "LIVE_FOR_BUYERS"].includes(title.status) ? "BLOCK" : "REVIEW", "MISSING_MASTER", "No canonical master key is set.");
      if (Number(title.qc_cases) === 0 && ["PREPARING", "UPLOADING", "LIVE_FOR_BUYERS"].includes(title.status)) {
        add("BLOCK", "NO_QC_CASE", "Non-draft workflow state has no QC case.");
      }
      if (Number(title.valid_rights_grants) === 0 && ["PREPARING", "UPLOADING", "LIVE_FOR_BUYERS"].includes(title.status)) {
        add("BLOCK", "NO_VALID_RIGHTS", "Non-draft workflow state has no valid/active rights grant.");
      }
      if (/internal test only|oci storage e2e|test only/i.test(title.name ?? "")) {
        add("BLOCK", "TEST_TITLE_IN_CATALOG", "Title is explicitly marked as test data; keep out of buyer-facing catalogue.");
      }
      const original = String(title.original_title ?? "").trim().toLocaleLowerCase("en");
      if (original) {
        const bucket = byOriginalTitle.get(original) ?? [];
        bucket.push(title);
        byOriginalTitle.set(original, bucket);
      }
    }

    for (const [originalTitle, matches] of byOriginalTitle) {
      const canonicalNames = new Set(matches.map((t) => String(t.name ?? "").trim().toLocaleLowerCase("en")));
      if (matches.length > 1 || [...canonicalNames].some((name) => name && name !== originalTitle)) {
        for (const title of matches) {
          findings.push({
            severity: "REVIEW",
            code: "ORIGINAL_TITLE_COLLISION",
            titleId: title.id,
            title: title.name,
            detail: `Original title “${title.original_title}” is shared or differs from the catalogue name; manually confirm identity before merge or publication.`,
          });
        }
      }
    }

    await client.query("ROLLBACK");
    const summary = {
      mode: "READ_ONLY",
      generatedAt: new Date().toISOString(),
      titlesScanned: rows.length,
      findings: findings.length,
      blockers: findings.filter((f) => f.severity === "BLOCK").length,
      reviewItems: findings.filter((f) => f.severity === "REVIEW").length,
      infoItems: findings.filter((f) => f.severity === "INFO").length,
      publicationCertified: false,
      note: "This is a metadata gate audit, not proof of film identity, file integrity, chain of title, or legal rights.",
      items: findings,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.blockers > 0) process.exitCode = 1;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("BLOCKED: catalogue audit failed; no data was changed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  await pool.end();
}
