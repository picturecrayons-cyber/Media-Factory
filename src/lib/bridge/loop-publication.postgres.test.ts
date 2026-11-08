import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ModuleKind, transpileModule } from "typescript";
import { z } from "zod";

type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

function adapter(db: Db) {
  const sql = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    let text = strings[0];
    params.forEach((_, index) => { text += `$${index + 1}${strings[index + 1]}`; });
    return (await db.query(text, params)).rows;
  }) as Db & ((strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown[]>);
  sql.query = async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params)).rows as never;
  sql.transaction = (fn) => db.transaction((tx) => fn(adapter(tx) as unknown as Db));
  sql.close = async () => {};
  return sql;
}

async function publicationFixture() {
  const db = new PGlite() as unknown as Db & { exec(text: string): Promise<unknown> };
  await db.query(`
    create table bridge_titles (
      id text primary key, slug text, name text, status text, language text,
      master_key text, poster_key text, synopsis text, year integer,
      runtime_minutes integer, content_type text
    );
    create table bridge_rights_grants (
      id text primary key, title_id text, status text, territories jsonb, languages jsonb,
      media jsonb, window_start timestamptz, window_end timestamptz, exclusivity text,
      evidence jsonb, created_at timestamptz default now()
    );
    create table bridge_qc_cases (title_id text, status text, reviewer_findings jsonb);
    create table bridge_legal_cases (title_id text, status text, evidence jsonb);
    create table loop_titles (
      id text primary key, bridge_title_id text unique, slug text, title text, synopsis text,
      content_type text, language text, year integer, duration_minutes integer,
      poster_path text, playback_path text, metadata jsonb, status text, listed boolean,
      published boolean, featured boolean, access_tier text, updated_at timestamptz
    );
    create table bridge_loop_publications (
      id text primary key, bridge_title_id text unique, loop_title_id text,
      authorization_status text, territories text[], languages text[], exploitation_models text[],
      window_start timestamptz, window_end timestamptz, approved_by text, approved_at timestamptz, revoked_at timestamptz,
      metadata jsonb, updated_at timestamptz
    );
  `);
  await db.query(`
    insert into bridge_titles values
      ('title-123','film','Test Film','LICENSED','Malayalam','sealed/master','sealed/poster',
       'Test synopsis',2024,120,'Film');
    insert into bridge_rights_grants
      (id,title_id,status,territories,languages,media,window_start,window_end,exclusivity,evidence)
      values ('grant-1','title-123','VALID','["WORLDWIDE"]','["Malayalam"]',
        '["CRAYONS_LOOP","TVOD"]','2026-01-01','2099-01-01','NON_EXCLUSIVE',
        '[{"commercialTerms":{"rightsOwnerSharePct":80,"distributorSharePct":20}}]');
    insert into bridge_qc_cases values
      ('title-123','PASSED','[{"masterKey":"sealed/master","posterKey":"sealed/poster"}]');
    insert into bridge_legal_cases values ('title-123','APPROVED','[{"grantId":"grant-1"}]');
  `);
  const sql = adapter(db);
  const modules: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => "loop-title-generated" },
    "@tanstack/react-start": {
      createServerFn: () => {
        const builder = {
          middleware: () => builder,
          validator: () => builder,
          handler: (handler: unknown) => handler,
        };
        return builder;
      },
    },
    zod: { z },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./rbac": { assertPermission: () => {} },
    "./session": { requireVerifiedActor: async (userId: string) => ({ userId, emailVerified: true }) },
    "./guards": { assertNotDevUser: () => {} },
    "./audit": { writeAudit: async () => {} },
    "./rights-coverage": {
      findCoveringRightsGrant: (grants: Array<{ id: string; status: string }>) =>
        grants.find((grant) => grant.status === "VALID") ?? null,
      assertPublicationCanExtend: () => {},
    },
    "@/lib/bridge/loop-lanes": { loopStageType: () => "Film" },
  };
  const source = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");
  const output = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, (args: unknown) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    Date,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return { db, sql, authorize: exports.authorizeLoopPublication };
}

test("concurrent publication authorization is serialized and creates one Loop publication in PostgreSQL", async () => {
  const f = await publicationFixture();
  try {
    const data = {
      bridgeTitleId: "title-123",
      destination: "CRAYONS_LOOP",
      territories: ["WORLDWIDE"],
      languages: ["Malayalam"],
      exploitationModels: ["TVOD"],
      accessTier: "TVOD",
      windowStart: "2026-01-01T00:00:00.000Z",
      windowEnd: "2099-01-01T00:00:00.000Z",
    };
    const invoke = () => f.authorize({ context: { userId: "operator" }, data });
    const results = await Promise.all([invoke(), invoke()]) as Array<{ loopTitleId: string; status: string }>;
    assert.equal(results[0].status, "AUTHORIZED");
    assert.equal(results[1].status, "AUTHORIZED");
    assert.equal(results[0].loopTitleId, results[1].loopTitleId);
    const loopRows = await f.db.query<{ count: string }>(
      "select count(*)::text as count from loop_titles where bridge_title_id='title-123'",
    );
    const publicationRows = await f.db.query<{ count: string }>(
      "select count(*)::text as count from bridge_loop_publications where bridge_title_id='title-123' and authorization_status='authorized'",
    );
    assert.equal(loopRows.rows[0].count, "1");
    assert.equal(publicationRows.rows[0].count, "1");
  } finally {
    await f.db.close();
  }
});
