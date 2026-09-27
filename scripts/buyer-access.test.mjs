import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("buyer share is explicit, revocable and audited without browser grants", async () => {
  const db = new PGlite();
  try {
    await db.waitReady;
    await db.exec("create role anon; create role authenticated;");
    // Exercise the full fresh-preview migration sequence, including optional
    // canonical-only tables referenced by the Data API lockdown.
    for (const filename of readdirSync(join(root, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(root, "migrations", filename), "utf8"));
    }
    const grants = await db.query(`select has_table_privilege('anon', 'bridge_buyer_title_access', 'select') as anon,
      has_table_privilege('authenticated', 'bridge_buyer_title_access', 'select') as authenticated`);
    assert.deepEqual(grants.rows[0], { anon: false, authenticated: false });
    await db.exec(`insert into bridge_profiles (user_id,email,account_type,email_verified)
      values ('buyer1','buyer@example.test','buyer',true);
      insert into bridge_titles (id,slug,name,owner_user_id,owner_account_type,status)
      values ('title1234','title','Title','creator','independent_creator','LIVE_FOR_BUYERS');`);
    const hasAccess = async () => (await db.query(`select exists (
      select 1 from bridge_buyer_title_access where title_id = 'title1234' and buyer_user_id = 'buyer1'
        and revoked_at is null and (expires_at is null or expires_at > now())) as allowed`)).rows[0].allowed;
    assert.equal(await hasAccess(), false);
    await db.exec(`with changed as (
      insert into bridge_buyer_title_access (title_id,buyer_user_id,granted_by)
      values ('title1234','buyer1','admin') returning title_id)
      insert into bridge_audit_logs (actor_user_id,action,entity_type,entity_id)
      select 'admin','buyer.title_shared','bridge_title',title_id from changed`);
    assert.equal(await hasAccess(), true);
    await db.exec(`with changed as (
      update bridge_buyer_title_access set revoked_at=now()
      where title_id='title1234' and buyer_user_id='buyer1' returning title_id)
      insert into bridge_audit_logs (actor_user_id,action,entity_type,entity_id)
      select 'admin','buyer.title_revoked','bridge_title',title_id from changed`);
    assert.equal(await hasAccess(), false);
    const audit = await db.query("select action from bridge_audit_logs where actor_user_id='admin' order by id");
    assert.deepEqual(audit.rows.map(r => r.action), ["buyer.title_shared", "buyer.title_revoked"]);
  } finally {
    await db.close();
  }
});
