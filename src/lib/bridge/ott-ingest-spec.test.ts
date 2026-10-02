import test from "node:test";
import assert from "node:assert/strict";
import { getOttIngestAccept, validateOttIngestFile } from "./ott-ingest-spec.ts";

test("OTT ingest accepts expected master formats", () => {
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.MP4", contentType: "video/mp4" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mov", contentType: "video/quicktime" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mxf", contentType: "application/mxf" }).ok, true);
});

test("OTT ingest rejects cross-kind extensions", () => {
  const artwork = validateOttIngestFile({ kind: "poster", filename: "poster.pdf", contentType: "application/pdf" });
  assert.equal(artwork.ok, false);
  const subtitle = validateOttIngestFile({ kind: "subtitle", filename: "subtitles.mp4", contentType: "video/mp4" });
  assert.equal(subtitle.ok, false);
});

test("OTT ingest validates MIME when browser supplies it", () => {
  const result = validateOttIngestFile({ kind: "poster", filename: "poster.png", contentType: "image/jpeg" });
  assert.equal(result.ok, false);
});

test("picker accept filter includes extensions and MIME types", () => {
  const accept = getOttIngestAccept("poster");
  assert.match(accept, /\.png/);
  assert.match(accept, /image\/png/);
  assert.match(accept, /\.webp/);
});
