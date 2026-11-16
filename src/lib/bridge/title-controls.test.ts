import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("title control schema persists HOLD/BLOCK state and immutable history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table bridge_titles(id text primary key);
      create table bridge_title_controls (
        title_id text primary key references bridge_titles(id) on delete restrict,
        control_state text not null default 'CLEAR' check (control_state in ('CLEAR','HOLD','BLOCK')),
        reason text, set_by text, set_at timestamptz, released_by text, released_at timestamptz,
        release_reason text, updated_at timestamptz not null default now(),
        check ((control_state='CLEAR' and reason is null and set_by is null and set_at is null)
          or (control_state in ('HOLD','BLOCK') and length(trim(coalesce(reason,'')))>=8 and set_by is not null and set_at is not null))
      );
      create table bridge_title_control_events (
        id bigserial primary key, title_id text not null references bridge_titles(id) on delete restrict,
        control_state text not null check (control_state in ('HOLD','BLOCK','CLEAR')),
        action text not null check (action in ('SET_HOLD','SET_BLOCK','RELEASE_HOLD','UNBLOCK')),
        reason text not null check (length(trim(reason))>=8), actor_user_id text not null,
        created_at timestamptz not null default now()
      );
      create function reject_control_event_mutation() returns trigger language plpgsql as $
      begin raise exception 'bridge_title_control_events is append-only'; end; $;
      create trigger no_control_event_mutation before update or delete on bridge_title_control_events
        for each row execute function reject_control_event_mutation();
      insert into bridge_titles(id) values ('title-123');
    `);
    await db.query("insert into bridge_title_controls(title_id,control_state,reason,set_by,set_at) values ($1,'HOLD',$2,$3,now())", ["title-123","Rights evidence under review","super"]);
    await db.query("insert into bridge_title_control_events(title_id,control_state,action,reason,actor_user_id) values ($1,'HOLD','SET_HOLD',$2,$3)", ["title-123","Rights evidence under review","super"]);
    assert.equal((await db.query("select control_state from bridge_title_controls where title_id='title-123'")).rows[0].control_state, "HOLD");
    await db.query("update bridge_title_controls set control_state='CLEAR',reason=null,set_by=null,set_at=null,released_by='super',released_at=now(),release_reason='Evidence confirmed',updated_at=now() where title_id='title-123'");
    await db.query("insert into bridge_title_control_events(title_id,control_state,action,reason,actor_user_id) values ($1,'CLEAR','RELEASE_HOLD',$2,$3)", ["title-123","Evidence confirmed","super"]);
    assert.equal((await db.query("select count(*)::int as count from bridge_title_control_events")).rows[0].count, 2);
    await assert.rejects(db.query("delete from bridge_title_control_events where id=1"));
  } finally { await db.close(); }
});
