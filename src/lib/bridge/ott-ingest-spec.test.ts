import test from "node:test";
import assert from "node:assert/strict";
import { getOttIngestAccept, validateOttIngestFile } from "./ott-ingest-spec.ts";

test("OTT ingest accepts expected master formats", () => {
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.MP4", contentType: "video/mp4" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mov", contentType: "video/quicktime" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mxf", contentType: "application/mxf" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mxf", contentType: "video/mxf" }).ok, true);
});

test("OTT ingest accepts Bridge technical camera-support files", () => {
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "ARRI_LogC.cube", contentType: "text/plain" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "Look.aml", contentType: "application/octet-stream" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "FrameLine.xml", contentType: "application/xml" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "ALEXA.pkg", contentType: "application/octet-stream" }).ok, true);
});

test("OTT ingest rejects cross-kind extensions", () => {
  const artwork = validateOttIngestFile({ kind: "poster", filename: "poster.pdf", contentType: "application/pdf" });
  assert.equal(artwork.ok, false);
  const subtitle = validateOttIngestFile({ kind: "subtitle", filename: "subtitles.mp4", contentType: "video/mp4" });
  assert.equal(subtitle.ok, false);
  const technical = validateOttIngestFile({ kind: "technical", filename: "camera.exe", contentType: "application/octet-stream" });
  assert.equal(technical.ok, false);
});

test("OTT ingest validates MIME against the specific extension", () => {
  assert.equal(validateOttIngestFile({ kind: "poster", filename: "poster.png", contentType: "image/jpeg" }).ok, false);
  assert.equal(validateOttIngestFile({ kind: "poster", filename: "poster.jpg", contentType: "image/png" }).ok, false);
  assert.equal(validateOttIngestFile({ kind: "poster", filename: "poster.jpeg", contentType: "image/jpeg" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "subtitle", filename: "captions.vtt", contentType: "text/vtt" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "subtitle", filename: "captions.vtt", contentType: "application/xml" }).ok, false);
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "FrameLine.xml", contentType: "text/plain" }).ok, false);
});

test("opaque browser MIME falls back to extension validation", () => {
  assert.equal(validateOttIngestFile({ kind: "master", filename: "feature.mxf", contentType: "application/octet-stream" }).ok, true);
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "Look.aml", contentType: "application/octet-stream" }).ok, true);
});

test("picker accept filter includes extensions and MIME types", () => {
  const accept = getOttIngestAccept("poster");
  assert.match(accept, /\.png/);
  assert.match(accept, /image\/png/);
  assert.match(accept, /\.webp/);

  const technical = getOttIngestAccept("technical");
  assert.match(technical, /\.cube/);
  assert.match(technical, /\.aml/);
  assert.match(technical, /\.xml/);
  assert.match(technical, /\.pkg/);
});
