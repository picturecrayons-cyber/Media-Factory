import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import * as rbac from "./rbac.ts";
import type { Sql } from "../db";

type Db = {
  exec(text: string): Promise<unknown>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};

const creator = {
  userId: "creator-a",
  emailVerified: true,
  accountType: "independent_creator" as const,
  internalRole: null,
};
const foreignTitle = { ownerUserId: "creator-a" };
const baseData = {
  name: "Rights Ready Test Film",
  synopsis: "A test synopsis long enough for a valid rights-ready submission.",
  contentType: "FEATURE",
  originalLanguage: "Malayalam",
  countryOfOrigin: "India",
  releaseYear: 2026,
  runtimeMinutes: 95,
  rightsLanguages: ["Malayalam"],
  territories: ["India"],
  exploitation: ["SVOD"],
  windowStart: "2026-10-10T00:00:00.000Z",
  windowEnd: "2027-10-10T00:00:00.000Z",
  exclusivity: "NON_EXCLUSIVE",
  authorityType: "PRODUCER",
  authorizationEvidenceType: "AUTHORIZATION_LETTER",
  authorizationConfirmed: true,
  buyerChannels: ["OTT"],
  screenerMode: "PRIVATE_BRIDGE",
};

async function fixture() {
  const pglite = new PGlite();
  const db: Db = {
    exec: async (text) => pglite.exec(text),
    query: async <T>(text: string, params?: unknown[]) =>
      (await pglite.query(text, params)) as { rows: T[] },
    close: async () => pglite.close(),
  };
  await db.exec(`
    create table bridge_titles (
      id text primary key, slug text unique, name text, original_title text,
      owner_user_id text not null, owner_account_type text not null, status text not null,
      synopsis text, long_synopsis text, language text, original_language text,
      year integer, runtime_minutes integer, content_type text, country_of_origin text,
      release_date date
    );
    create table bridge_rights_grants (
      id bigserial primary key, title_id text not null, grant_type text not null,
      territories jsonb not null, languages jsonb not null, media jsonb not null,
      window_start timestamptz not null, window_end timestamptz not null,
      exclusivity text not null, evidence jsonb not null, status text not null,
      created_by text not null
    );
    create table bridge_legal_cases (
      title_id text not null, status text not null, evidence jsonb not null
    );
    create table bridge_title_submission_intake (
      title_id text not null, authority_type text not null,
      authorization_evidence_type text not null, authorization_confirmed boolean not null,
      buyer_channels jsonb not null, screener_mode text not null, screener_url text,
      check (screener_mode <> 'NONE')
    );
    create table bridge_title_events (
      title_id text not null, from_status text, to_status text not null,
      actor_user_id text not null, note text
    );
    create table bridge_audit_logs (
      actor_user_id text not null, action text not null, entity_type text not null,
      entity_id text, metadata jsonb not null
    );
  `);

  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let query = strings[0];
    values.forEach((_, index) => { query += `$${index + 1}${strings[index + 1]}`; });
    return (await db.query(query, values)).rows;
  }) as Sql;
  sql.query = async <T>(query: string, values?: unknown[]) =>
    (await db.query<T>(query, values)).rows;
  sql.transaction = async <T>(fn: (tx: Sql) => Promise<T>) => {
    await db.exec("begin");
    try {
      const result = await fn(sql);
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  };

  const actors: Record<string, typeof creator | { userId: string; emailVerified: boolean; accountType: "buyer"; internalRole: null }> = {
    "creator-a": creator,
    "buyer-a": { userId: "buyer-a", emailVerified: true, accountType: "buyer", internalRole: null },
  };
  const modules: Record<string, unknown> = {
    "@tanstack/react-start": {
      createServerFn: () => {
        let validator: { parse: (data: unknown) => unknown } | undefined;
        const builder = {
          middleware: () => builder,
          validator: (schema: { parse: (data: unknown) => unknown }) => { validator = schema; return builder; },
          handler: (handler: (args: { context: { userId: string }; data: typeof baseData }) => Promise<unknown>) =>
            async (args: { context: { userId: string }; data: unknown }) =>
              handler({ ...args, data: validator ? validator.parse(args.data) as typeof baseData : args.data as typeof baseData }),
        };
        return builder;
      },
    },
    zod: { z },
    "node:crypto": { randomBytes },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/db": { getSql: async () => sql },
    "./rbac": rbac,
    "./session": { requireVerifiedActor: async (id: string) => {
      const actor = actors[id];
      if (!actor) throw new Error("Profile required");
      return actor;
    } },
    "./audit": { writeAudit: async (opts: { actorUserId: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }, tx: Sql) => {
      await tx`insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values (${opts.actorUserId}, ${opts.action}, ${opts.entityType}, ${opts.entityId ?? null}, ${JSON.stringify(opts.metadata ?? {})}::jsonb)`;
    } },
    "./guards": { assertNotDevUser: (id: string) => {
      if (id === "dev-user") throw new Error("Mock/dev authorization is disabled for Crayons Bridge");
    } },
  };
  const exports: Record<string, unknown> = {};
  const source = (await import("node:fs")).readFileSync(
    new URL("./submissions.ts", import.meta.url), "utf8",
  );
  runInNewContext(
    transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: 99 } }).outputText,
    {
      exports,
      require: (name: string) => {
        assert.ok(name in modules, `Unexpected module: ${name}`);
        return modules[name];
      },
      Date,
    },
  );
  return { db, sql, submit: exports.createRightsReadySubmission as (args: { context: { userId: string }; data: unknown }) => Promise<{ titleId: string; status: string }> };
}

test("authenticated creator submission atomically persists title, rights, legal case, intake, event and audit", async () => {
  const f = await fixture();
  try {
    const result = await f.submit({ context: { userId: creator.userId }, data: baseData });
    assert.equal(result.status, "DRAFT");
    assert.equal((await f.sql.query<{ owner_user_id: string }>("select owner_user_id from bridge_titles"))[0].owner_user_id, creator.userId);
    for (const table of ["bridge_titles", "bridge_rights_grants", "bridge_legal_cases", "bridge_title_submission_intake", "bridge_title_events", "bridge_audit_logs"]) {
      assert.equal((await f.sql.query(`select * from ${table}`)).length, 1, table);
    }
  } finally {
    await f.db.close();
  }
});

test("buyer account cannot submit a title and does not create partial records", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.submit({ context: { userId: "buyer-a" }, data: baseData }),
      /Only creator and studio accounts can submit titles/,
    );
    assert.equal((await f.sql.query("select * from bridge_titles")).length, 0);
    assert.equal((await f.sql.query("select * from bridge_audit_logs")).length, 0);
  } finally {
    await f.db.close();
  }
});

test("forced intake failure rolls back all earlier submission writes", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.submit({ context: { userId: creator.userId }, data: { ...baseData, screenerMode: "NONE" } }),
      /check constraint/i,
    );
    for (const table of ["bridge_titles", "bridge_rights_grants", "bridge_legal_cases", "bridge_title_submission_intake", "bridge_title_events", "bridge_audit_logs"]) {
      assert.equal((await f.sql.query(`select * from ${table}`)).length, 0, table);
    }
  } finally {
    await f.db.close();
  }
});

test("cross-owner mutation is denied by the same RBAC ownership primitive used by title routes", () => {
  const otherCreator = { ...creator, userId: "creator-b" };
  assert.equal(rbac.canMutateTitle(otherCreator, foreignTitle, "title.update_own", "title.license"), false);
  assert.equal(rbac.canMutateTitle(creator, foreignTitle, "title.update_own", "title.license"), true);
});
