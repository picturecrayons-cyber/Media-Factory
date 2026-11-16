import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const agent = join(root, "tools/staging-test-agent/agent.mjs");
const example = JSON.parse(await readFile(join(root, "tools/staging-test-agent/fixtures.example.json"), "utf8"));

async function runWithFixture(fixture, extraArgs = ["--dry-run"]) {
  const dir = await mkdtemp(join(tmpdir(), "crayons-staging-agent-"));
  const path = join(dir, "fixture.json");
  try {
    await writeFile(path, JSON.stringify(fixture));
    return spawnSync(process.execPath, [agent, ...extraArgs, "--fixtures", path], { encoding: "utf8" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("valid synthetic STAGING fixture is accepted in dry-run only", async () => {
  const result = await runWithFixture(example);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS — fixture shape and STAGING target validated/);
  assert.match(result.stdout, /NOT TESTED — no database\/API calls/);
  assert.match(result.stdout, /Production access: DENIED/);
});

test("Production project is denied", async () => {
  const result = await runWithFixture({ ...example, projectId: "mlmgugivsyoxzdgwkbpu" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Production project is explicitly denied/);
});

test("non-STAGING project is denied", async () => {
  const result = await runWithFixture({ ...example, projectId: "another-project" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /approved STAGING project only/);
});

test("duplicate Auth UUID is rejected", async () => {
  const fixture = structuredClone(example);
  fixture.users[1].authUserId = fixture.users[0].authUserId;
  const result = await runWithFixture(fixture);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Duplicate Auth UUID/);
});

test("linked User C is rejected", async () => {
  const fixture = structuredClone(example);
  fixture.users.find(user => user.role === "C").bridgeUserId = "TEST-BRIDGE-C";
  const result = await runWithFixture(fixture);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /User C must remain intentionally unlinked/);
});

test("execution mode is not available", async () => {
  const result = await runWithFixture(example, ["--execute"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Only --dry-run is supported/);
});
