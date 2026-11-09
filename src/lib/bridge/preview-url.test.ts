import test from "node:test";
import assert from "node:assert/strict";
import { previewUrlFor } from "./preview-url.ts";

test("a video preview link asks OCI for an inline media type without changing the object", () => {
  const signed = "https://objectstorage.ap-mumbai-1.oraclecloud.com/p/token/n/ns/b/bucket/o/film.mp4";
  const preview = new URL(previewUrlFor(signed, "screener", "application/octet-stream"));
  assert.equal(preview.searchParams.get("httpResponseContentType"), "video/mp4");
  assert.equal(preview.searchParams.get("httpResponseContentDisposition"), "inline");
  assert.equal(preview.origin + preview.pathname, "https://objectstorage.ap-mumbai-1.oraclecloud.com/p/token/n/ns/b/bucket/o/film.mp4");
});

test("a stored image type is kept", () => {
  const signed = "https://objectstorage.ap-mumbai-1.oraclecloud.com/p/token/n/ns/b/bucket/o/poster.png";
  const preview = new URL(previewUrlFor(signed, "poster", "image/png"));
  assert.equal(preview.searchParams.get("httpResponseContentType"), "image/png");
});
