import test from "node:test";
import { readImageDimensions } from "./image-dimensions.ts";
import assert from "node:assert/strict";
import { getOttIngestAccept, validateArtworkDimensions, validateOttIngestFile } from "./ott-ingest-spec.ts";

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
  assert.equal(validateOttIngestFile({ kind: "technical", filename: "ALEXA.pkg", contentType: "application/vnd.apple.installer+xml" }).ok, false);
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

test("poster upload slots enforce portrait versus landscape dimensions", () => {
  assert.deepEqual(validateArtworkDimensions("poster_vertical", 1000, 1500), { ok: true });
  assert.deepEqual(validateArtworkDimensions("poster_horizontal", 1920, 1080), { ok: true });
  assert.equal(validateArtworkDimensions("poster_vertical", 1920, 1080).ok, false);
  assert.equal(validateArtworkDimensions("poster_horizontal", 1000, 1500).ok, false);
  assert.equal(validateArtworkDimensions("poster_vertical", 1000, 1000).ok, false);
  assert.equal(validateArtworkDimensions("poster_horizontal", 0, 1000).ok, false);
});

test("opaque artwork MIME is provisionally accepted and image bytes remain authoritative", () => {
  assert.equal(validateOttIngestFile({ kind: "poster_vertical", filename: "poster.jpg", contentType: "application/octet-stream" }).ok, true);
  assert.equal(readImageDimensions(Buffer.from("not an image")), null);
});

test("JPEG dimensions account for EXIF orientation that rotates portrait and landscape", () => {
  const exif = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0, 0, // Exif\0\0
    0x49, 0x49, 0x2a, 0, 0x08, 0, 0, 0, // little-endian TIFF header
    0x01, 0, // one IFD entry
    0x12, 0x01, 0x03, 0, 0x01, 0, 0, 0, 0x06, 0, 0, 0, // orientation=6 (rotate 90 CW)
    0, 0, 0, 0, // next IFD
  ]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, exif.length + 2]), exif]);
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0x04, 0xb0, 0x07, 0x08, 1, 1, 0x11, 0]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xd9])]);
  assert.deepEqual(readImageDimensions(jpeg), { width: 1200, height: 1800 });
});

test("server image dimension parser reads PNG and WebP headers and rejects malformed bytes", () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(1800, 20);
  assert.deepEqual(readImageDimensions(png), { width: 1200, height: 1800 });

  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0, "ascii");
  webp.write("WEBP", 8, "ascii");
  webp.write("VP8X", 12, "ascii");
  webp[24] = 191; webp[25] = 4; webp[26] = 0; // 1216 px
  webp[27] = 7; webp[28] = 7; webp[29] = 0; // 1800 px
  assert.deepEqual(readImageDimensions(webp), { width: 1216, height: 1800 });
  assert.equal(readImageDimensions(Buffer.from("not an image")), null);
});
