import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { ASSET_KINDS, type AssetKind } from "./types.ts";
import { persistVerifiedAsset } from "./asset-confirmation.ts";
import { validateOttIngestFile } from "./ott-ingest-spec.ts";

test("all 9 supported asset types are valid in OTT ingest specification", () => {
  const expectedKinds: AssetKind[] = [
    "master",
    "screener",
    "poster_vertical",
    "poster_horizontal",
    "thumbnail",
    "subtitle",
    "censor_certificate",
    "technical",
    "poster",
  ];

  for (const kind of expectedKinds) {
    assert.ok(ASSET_KINDS.includes(kind), `Expected ASSET_KINDS to include ${kind}`);
  }

  // Verify valid filenames for each asset type pass ingest validation
  const testFiles: Record<AssetKind, { filename: string; contentType: string }> = {
    master: { filename: "film_master.mp4", contentType: "video/mp4" },
    screener: { filename: "trailer.mp4", contentType: "video/mp4" },
    poster_vertical: { filename: "poster_v.jpg", contentType: "image/jpeg" },
    poster_horizontal: { filename: "poster_h.png", contentType: "image/png" },
    thumbnail: { filename: "thumb.webp", contentType: "image/webp" },
    subtitle: { filename: "subtitles.vtt", contentType: "text/vtt" },
    censor_certificate: { filename: "certificate.pdf", contentType: "application/pdf" },
    technical: { filename: "lut.cube", contentType: "text/plain" },
    poster: { filename: "artwork.jpeg", contentType: "image/jpeg" },
  };

  for (const [kind, file] of Object.entries(testFiles) as Array<[AssetKind, { filename: string; contentType: string }]>) {
    const res = validateOttIngestFile({ kind, filename: file.filename, contentType: file.contentType });
    assert.equal(res.ok, true, `Expected ${kind} with ${file.filename} to be valid: ${!res.ok ? res.message : ""}`);
  }
});

test("asset confirmation uses canonical Bridge persistence, not the legacy Loop migration queue", () => {
  const assets = readFileSync(join(process.cwd(), "src/lib/bridge/assets.ts"), "utf8");
  assert.doesNotMatch(assets, /loop_media_migration_queue/);
  assert.match(assets, /persistVerifiedAsset\(sql,/);
  assert.match(assets, /database_persist_verified_asset/);
});


test("duplicate upload confirmations derive the same sealed key from the asset row ID", () => {
  const assets = readFileSync(join(process.cwd(), "src/lib/bridge/assets.ts"), "utf8");
  assert.ok(assets.includes('const sealedKey = `${asset.s3_key}.verified/${asset.id}`;'));
  assert.doesNotMatch(assets, /randomUUID/);
});

test("verification timeout warns that server-side work may still complete and requires refresh before retry", () => {
  const route = readFileSync(join(process.cwd(), "src/routes/title.$id.tsx"), "utf8");
  assert.match(route, /Stored-object verification timed out/);
  assert.match(route, /The server may still be finishing verification/);
  assert.match(route, /Refresh the asset list and check its status before retrying/);
});
