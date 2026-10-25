import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table public.bridge_titles (
      id text primary key,
      owner_user_id text not null,
      status text not null default 'PREPARING'
    );
    create table public.bridge_assets (
      id text primary key,
      title_id text not null references public.bridge_titles(id),
      byte_size bigint,
      content_type text
    );
    create table public.bridge_qc_cases (
      id uuid primary key default gen_random_uuid(),
      title_id text not null,
      status text not null,
      reviewed_by text,
      reviewed_at timestamptz
    );
    create table public.bridge_legal_cases (
      id uuid primary key default gen_random_uuid(),
      title_id text not null,
      status text not null,
      evidence jsonb not null default '[]'::jsonb,
      reviewed_by text,
      reviewed_at timestamptz
    );
    create table public.bridge_rights_grants (
      id uuid primary key default gen_random_uuid(),
      title_id text not null,
      status text not null,
      evidence jsonb not null default '[]'::jsonb,
      window_start timestamptz,
      window_end timestamptz
    );
    create table public.bridge_destination_packages (
      id uuid primary key default gen_random_uuid(),
      title_id text not null,
      readiness_state text not null,
      rights_grant_id uuid,
      qc_case_id uuid,
      legal_case_id uuid
    );
    create table public.bridge_loop_publications (
      bridge_title_id text not null,
      loop_title_id text not null,
      authorization_status text not null,
      approved_by text,
      approved_at timestamptz,
      window_start timestamptz,
      window_end timestamptz
    );
    create table public.loop_titles (
      id text primary key,
      bridge_title_id text,
      published boolean not null default false,
      listed boolean not null default false,
      status text not null default 'draft'
    );
  `);
  const migration = await readFile(
    new URL("../migrations/0021_bridge_eight_gate_state_machine.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(`
    insert into public.bridge_titles(id, owner_user_id) values ('synthetic-gate-test', 'creator-1');
    insert into public.bridge_assets(id, title_id, byte_size, content_type)
      values ('asset-1', 'synthetic-gate-test', 128, 'image/png');
  `);
  return db;
}

async function transition(db, gate, actor = "reviewer-1", role = "super_admin", evidence = { reference: "test-evidence" }) {
  return db.query(
    "select (public.bridge_transition_gate($1,$2,$3,$4,$5::jsonb)).current_gate as current_gate",
    ["synthetic-gate-test", gate, actor, role, JSON.stringify(evidence)],
  );
}

test("eight-gate state machine rejects skipping gates and missing asset verification", async () => {
  const db = await fixture();
  try {
    await assert.rejects(
      transition(db, "ASSET_VERIFICATION"),
      /GATE_ORDER_BLOCKED/,
    );
    await transition(db, "PREPARING", "creator-1", "creator");
    await assert.rejects(
      transition(db, "ASSET_VERIFICATION"),
      /GATE_BLOCKED_ASSET_VERIFICATION/,
    );
    await db.query(`
      update public.bridge_assets
      set verified = true, verified_at = now(), verified_by = 'reviewer-1',
          etag = 'etag-test', sha256 = repeat('a', 64)
      where id = 'asset-1'
    `);
    await transition(db, "ASSET_VERIFICATION");
    await assert.rejects(
      transition(db, "LEGAL", "legal-1", "legal_reviewer"),
      /GATE_ORDER_BLOCKED/,
    );
  } finally {
    await db.close();
  }
});

test("complete synthetic gate flow requires independent QC/legal and explicit publication evidence", async () => {
  const db = await fixture();
  try {
    await transition(db, "PREPARING", "creator-1", "creator");
    await db.query(`
      update public.bridge_assets
      set verified = true, verified_at = now(), verified_by = 'reviewer-1',
          etag = 'etag-test', sha256 = repeat('a', 64)
      where id = 'asset-1'
    `);
    await transition(db, "ASSET_VERIFICATION");

    const qc = await db.query(
      "insert into public.bridge_qc_cases(title_id,status,reviewed_by,reviewed_at) values ($1,'PASSED','qc-1',now()) returning id",
      ["synthetic-gate-test"],
    );
    await transition(db, "QC", "qc-1", "qc_reviewer");
    await assert.rejects(
      transition(db, "LEGAL", "creator-1", "legal_reviewer"),
      /SELF_APPROVAL_DENIED/,
    );

    const legal = await db.query(
      "insert into public.bridge_legal_cases(title_id,status,evidence,reviewed_by,reviewed_at) values ($1,'APPROVED','[{\\"reference\\":\\"rights-doc-test\\"}]'::jsonb,'legal-1',now()) returning id",
      ["synthetic-gate-test"],
    );
    await transition(db, "LEGAL", "legal-1", "legal_reviewer");

    const grant = await db.query(
      "insert into public.bridge_rights_grants(title_id,status,evidence,window_start,window_end) values ($1,'VALID','[{\\"reference\\":\\"grant-test\\"}]'::jsonb,now()-interval '1 day',now()+interval '1 day') returning id",
      ["synthetic-gate-test"],
    );
    await transition(db, "LICENSE", "legal-1", "legal_reviewer");

    await db.query(
      "insert into public.bridge_destination_packages(title_id,readiness_state,rights_grant_id,qc_case_id,legal_case_id) values ($1,'READY',$2,$3,$4)",
      ["synthetic-gate-test", grant.rows[0].id, qc.rows[0].id, legal.rows[0].id],
    );
    await transition(db, "DISTRIBUTION", "admin-1", "admin");

    await db.query(`
      insert into public.loop_titles(id,bridge_title_id,published,listed,status)
      values ('loop-synthetic-gate-test','synthetic-gate-test',true,true,'approved')
    `);
    await db.query(
      "insert into public.bridge_loop_publications(bridge_title_id,loop_title_id,authorization_status,approved_by,approved_at,window_start,window_end) values ($1,$2,'authorized','admin-1',now(),now()-interval '1 day',now()+interval '1 day')",
      ["synthetic-gate-test", "loop-synthetic-gate-test"],
    );
    await transition(db, "PUBLICATION", "reviewer-1", "super_admin");
    await transition(db, "REVENUE", "finance-1", "finance", {
      reporting_reference: "synthetic-reconciliation-001",
      reconciled_at: new Date().toISOString(),
      total_paise: 0,
    });

    const state = await db.query(
      "select current_gate from public.bridge_gate_state where title_id=$1",
      ["synthetic-gate-test"],
    );
    assert.equal(state.rows[0].current_gate, "REVENUE");
    const audit = await db.query(
      "select to_gate from public.bridge_gate_audit_trail where title_id=$1 order by created_at, to_gate",
      ["synthetic-gate-test"],
    );
    assert.equal(audit.rows.length, 8);
    await assert.rejects(
      db.query("delete from public.bridge_gate_audit_trail where title_id=$1", ["synthetic-gate-test"]),
      /GATE_AUDIT_IMMUTABLE/,
    );
  } finally {
    await db.close();
  }
});
