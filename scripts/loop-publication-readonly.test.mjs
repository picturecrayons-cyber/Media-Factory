import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/bridge/loop-publication.ts", import.meta.url), "utf8");
const start = source.indexOf("export const listLoopPublicationReadiness");
const end = source.indexOf("export const authorizeLoopPublication", start);

describe("Loop publication readiness GET remains read-only", () => {
  it("contains no database writes or swallowed database errors", () => {
    assert.notEqual(start, -1, "readiness GET handler must exist");
    assert.notEqual(end, -1, "readiness GET handler boundary must exist");
    const handler = source.slice(start, end);
    assert.doesNotMatch(handler, /\b(insert\s+into|update\s+[a-z_]+|delete\s+from)\b/i);
    assert.doesNotMatch(handler, /\.catch\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
  });
});

const adminSource = readFileSync(new URL("../src/lib/bridge/admin-workstations.ts", import.meta.url), "utf8");

describe("Bridge reviewer approvals require verified evidence", () => {
  it("requires exact master and artwork versions before QC PASS", () => {
    assert.match(adminSource, /masterAssetVersionId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    assert.match(adminSource, /artworkAssetVersionId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    assert.match(adminSource, /if\s*\(!data\.masterAssetVersionId\s*\|\|\s*!data\.artworkAssetVersionId\)/);
    assert.match(adminSource, /requireVerifiedCurrentAsset\(sql,\s*title\.id,\s*data\.masterAssetVersionId/);
    assert.match(adminSource, /requireVerifiedCurrentAsset\(sql,\s*title\.id,\s*data\.artworkAssetVersionId/);
  });

  it("requires a valid title rights grant and verified legal evidence before legal approval", () => {
    assert.match(adminSource, /rightsGrantId:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    assert.match(adminSource, /evidenceAssetIds:\s*z\.array\(z\.string\(\)\.min\(1\)\)/);
    assert.match(adminSource, /status='VALID'/);
    assert.match(adminSource, /requireVerifiedLegalEvidence\(sql,\s*title\.id,\s*data\.evidenceAssetIds\)/);
    assert.match(adminSource, /evidenceAssetIds,\s*note:\s*data\.notes/);
  });
});
