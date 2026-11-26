import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261126221143_bridge_production_projects_dit_lifecycle.sql", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/bridge/dit-agent.ts", import.meta.url), "utf8");
const desk = await readFile(new URL("../src/components/bridge/dit-agent-desk.tsx", import.meta.url), "utf8");

test("DIT sessions are production-project and shoot-day linked without requiring a finished film", () => {
  assert.match(migration, /alter column title_id drop not null/i);
  assert.match(migration, /add column if not exists production_project_id uuid/i);
  assert.match(migration, /add column if not exists shoot_day_id uuid/i);
  assert.match(migration, /foreign key \(shoot_day_id, production_project_id\)/i);
  assert.match(migration, /project_day_pair_check/i);
  assert.match(migration, /bridge_dit_ingest_sessions_shoot_day_idx[\\s\\S]*shoot_day_id, production_project_id/i);
  assert.match(api, /productionProjectId: z\.string\(\)\.uuid\(\)/);
  assert.match(api, /insert into bridge_production_shoot_days/i);
  assert.match(api, /status = case when status = 'PRE_PRODUCTION' then 'IN_PRODUCTION' else status end/i);
  assert.match(api, /then 'POST_PRODUCTION'/i);
  assert.match(api, /values \(\s*\$\{id\}::uuid, null, \$\{project\.id\}/);
  assert.match(desk, /Production project/);
  assert.doesNotMatch(desk, /Select a finished film/);
});

test("finished-film output linkage is separate from DIT sign-off", () => {
  assert.match(migration, /bridge_production_title_links/);
  assert.match(api, /dit\.finished_film_output_linked/);
  assert.match(api, /FINISHED_FILM_OUTPUT/);
  assert.match(desk, /Link output/);
  assert.match(desk, /DIT sign-off does not approve QC/);
});

test("new production and DIT evidence tables are server-only", () => {
  for (const table of ["bridge_production_projects", "bridge_production_shoot_days", "bridge_production_title_links"]) {
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security", "i"));
    assert.match(migration, new RegExp("revoke all privileges on table public\\." + table + " from public, anon, authenticated", "i"));
  }
});
