import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("gallery JSX has one article close and one canonical title asset listing", () => {
  const gallery = read("../../components/bridge/asset-preview-gallery.tsx");
  const assets = read("./assets.ts");
  assert.equal(gallery.includes("</article>  </article>"), false);
  assert.equal((assets.match(/export const listTitleAssets/g) ?? []).length, 1);
});

test("pause retains upload session and never aborts durable multipart parts", () => {
  const route = read("../../routes/title.$id.tsx");
  const pauseStart = route.indexOf("const session = activeMultipart.current;");
  assert.notEqual(pauseStart, -1);
  const pauseEnd = route.indexOf("if (uploadXhrRef.current.size === 0) setUploading(null);", pauseStart);
  assert.notEqual(pauseEnd, -1);
  const pauseHandler = route.slice(pauseStart, pauseEnd);
  assert.match(pauseHandler, /Upload paused/);
  assert.doesNotMatch(pauseHandler, /clearUploadSession|abortAssetMultipart/);
  assert.match(route, /getAssetMultipartStatus/);
});

test("both direct confirmation and durable worker execute object SHA-256 before persistence", () => {
  const assets = read("./assets.ts");
  const worker = read("./asset-verification-worker.server.ts");
  const storage = read("./oci-object-storage.server.ts");
  assert.match(assets, /const checksumSha256 = await computeObjectSha256\(sealedKey\)/);
  assert.match(worker, /const checksumSha256 = await computeObjectSha256\(verifiedKey\)/);
  assert.match(storage, /createHash\("sha256"\)/);
  assert.match(storage, /hash\.update\(value\)/);
  assert.match(assets, /checksumSha256,/);
  assert.match(worker, /checksumSha256,/);
});
