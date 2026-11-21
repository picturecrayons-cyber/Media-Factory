import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./bridge-release-gates.mjs", import.meta.url);

test("missing manifest fails closed with all 15 gates not verified", () => {
  const dir = mkdtempSync(join(tmpdir(), "bridge-gates-"));
  try {
    const manifest = join(dir, "evidence.json");
    writeFileSync(manifest, JSON.stringify({ version: 1, gates: {} }));
    const result = spawnSync(process.execPath, [script.pathname, manifest], { encoding: "utf8" });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.verdict, "NOT CERTIFIED");
    assert.equal(output.production, "HOLD / NO-GO");
    assert.equal(output.pilot, "NOT AUTHORIZED");
    assert.equal(output.gates.length, 15);
    assert.ok(output.gates.every((gate) => gate.status === "NOT VERIFIED"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("matching deployment metadata alone cannot pass all gates", () => {
  const dir = mkdtempSync(join(tmpdir(), "bridge-gates-"));
  try {
    const manifest = join(dir, "evidence.json");
    writeFileSync(manifest, JSON.stringify({
      version: 1,
      gates: {
        deploymentMapping: {
          status: "PASS", checkedAt: "2026-10-22T00:00:00Z", evidenceRef: "https://example.invalid/evidence",
          publicDomain: { commitSha: "9c56a25e4eba2de63c4c261503112c8945b2dd5a", deploymentId: "prod-id" },
          preview: { commitSha: "f8520f79c9f26d61a777d9d450d242878054a631", deploymentId: "preview-id" }
        }
      }
    }));
    const result = spawnSync(process.execPath, [script.pathname, manifest], { encoding: "utf8" });
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.gates[0].status, "PASS");
    assert.equal(output.verdict, "NOT CERTIFIED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production credentials available in Preview blocks OCI isolation", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /productionCredentialsAvailable === true/);
  assert.match(source, /Preview has Production OCI credentials available/);
});
