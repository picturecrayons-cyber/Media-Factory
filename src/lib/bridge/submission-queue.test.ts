import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import { listIncomingSubmissions } from "./submission-queue.ts";

test("incoming queue includes Creator and Studio review submissions without intake rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table bridge_titles (
      id text primary key, name text not null, status text not null,
      owner_user_id text not null, owner_account_type text not null,
      owner_organization_id uuid, submission_type text, merged_into_title_id text,
      updated_at timestamptz not null
    );
    create table bridge_title_submission_intake (
      title_id text primary key, authority_type text,
      authorization_evidence_type text, authorization_confirmed boolean,
      buyer_channels jsonb, screener_mode text, submitted_at timestamptz
    );
    create table bridge_profiles (user_id text primary key, display_name text, email text, organization_name text);
    create table bridge_organizations (id uuid primary key, legal_name text);
    insert into bridge_profiles values ('creator-1','Creator One','creator@example.test',null),('studio-1','Studio One','studio@example.test','Studio Org');
    insert into bridge_titles values
      ('creator-title','Creator Film','QC_REVIEW','creator-1','independent_creator',null,null,null,now()),
      ('studio-title','Studio Film','PREPARING','studio-1','studio',null,null,null,now()),
      ('concept-title','Story Concept','QC_REVIEW','creator-1','independent_creator',null,'story_concept',null,now()),
      ('draft-title','Unsubmitted Draft','DRAFT','creator-1','independent_creator',null,null,null,now()),
      ('merged-title','Merged Duplicate','RIGHTS_REVIEW','creator-1','independent_creator',null,null,'creator-title',now()),
      ('intake-title','Public Intake Film','RIGHTS_REVIEW','creator-1','independent_creator',null,null,null,now());
    insert into bridge_title_submission_intake(title_id,authority_type,authorization_evidence_type,authorization_confirmed,buyer_channels,screener_mode,submitted_at)
      values ('intake-title','RIGHTS_OWNER','RIGHTS_AGREEMENT',true,'["OTT"]'::jsonb,'NONE',now());`);
    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      let query = strings[0];
      values.forEach((_, index) => { query += `$${index + 1}${strings[index + 1]}`; });
      return (await db.query(query, values)).rows;
    }) as Sql;
    sql.query = async (query, params) => (await db.query(query, params)).rows as never;
    sql.transaction = async (fn) => fn(sql);
    const rows = await listIncomingSubmissions(sql);
    assert.deepEqual(rows.map((row) => row.title_id).sort(), ["creator-title", "intake-title", "studio-title"]);
    assert.equal(rows.find((row) => row.title_id === "creator-title")?.authority_type, null);
    assert.equal(rows.find((row) => row.title_id === "intake-title")?.authority_type, "RIGHTS_OWNER");
  } finally {
    await db.close();
  }
});
