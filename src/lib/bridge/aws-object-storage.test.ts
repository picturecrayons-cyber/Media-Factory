import test from "node:test";
import assert from "node:assert/strict";
import { S3Client, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  assertObjectKey,
  titleAssetKey,
  signUpload,
  signDownload,
  sealVerifiedObject,
} from "./aws-object-storage.server.ts";
import { integrationStatus } from "./env.ts";

test("AWS signing preserves legacy keys and never reports OCI as S3 readiness", async (t) => {
  const names = [
    "AWS_REGION",
    "AWS_S3_MEDIA_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ];
  const saved = names.map((name) => process.env[name]);
  t.after(() =>
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name];
      else process.env[name] = saved[i];
    }),
  );
  for (const name of names) delete process.env[name];
  assert.equal(integrationStatus().s3, false);
  await assert.rejects(signDownload({ key: "films/master.mp4" }), /region and media bucket/);
  Object.assign(process.env, {
    AWS_REGION: "us-east-1",
    AWS_S3_MEDIA_BUCKET: "test-bucket",
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
  });
  assert.equal(integrationStatus().s3, true);
  const download = await signDownload({ key: "films/posters/film + art.jpg" });
  const parsed = new URL(download.url);
  assert.equal(decodeURIComponent(parsed.pathname), "/films/posters/film + art.jpg");
  assert.equal(parsed.searchParams.get("X-Amz-Expires"), "300");
  const upload = await signUpload({
    key: "bridge/owner/title/poster/art.jpg",
    contentType: "image/jpeg",
  });
  assert.ok(new URL(upload.url).searchParams.get("X-Amz-SignedHeaders")?.includes("content-type"));
  await assert.rejects(signDownload({ key: "films/master.mp4", expiresIn: 901 }), /expiry/);
  delete process.env.AWS_SECRET_ACCESS_KEY;
  await assert.rejects(signDownload({ key: "films/master.mp4" }), /Incomplete/);
});

test("keys reject traversal and generated upload keys do not collide", () => {
  for (const key of ["", "/films/a", "films/../a", "films/./a", "films/\na"])
    assert.throws(() => assertObjectKey(key));
  const input = { ownerUserId: "owner", titleId: "title", kind: "poster", filename: "art.jpg" };
  assert.notEqual(titleAssetKey(input), titleAssetKey(input));
});

test("sealing encodes copy source, pins source ETag and rejects unverified copies", async (t) => {
  const savedRegion = process.env.AWS_REGION,
    savedBucket = process.env.AWS_S3_MEDIA_BUCKET;
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_S3_MEDIA_BUCKET = "test-bucket";
  t.after(() => {
    if (savedRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = savedRegion;
    if (savedBucket === undefined) delete process.env.AWS_S3_MEDIA_BUCKET;
    else process.env.AWS_S3_MEDIA_BUCKET = savedBucket;
  });
  let copies = 0;
  const mock = t.mock.method(
    S3Client.prototype,
    "send",
    async (command: { input: Record<string, unknown> }) => {
      if (command instanceof CopyObjectCommand) {
        copies++;
        assert.equal(command.input.CopySource, "test-bucket/films/a%20%2B%20b.mp4");
        assert.equal(command.input.CopySourceIfMatch, '"source-etag"');
        return { CopyObjectResult: { ETag: '"destination-etag"' } };
      }
      assert.ok(command instanceof HeadObjectCommand);
      return { ContentLength: 42, ContentType: "video/mp4", ETag: '"destination-etag"' };
    },
  );
  const sealed = await sealVerifiedObject("films/a + b.mp4", "bridge/sealed/id", "source-etag");
  assert.equal(sealed.etag, "destination-etag");
  assert.equal(copies, 1);
  mock.mock.mockImplementation(async () => ({ ContentLength: 6 * 1024 ** 3 }));
  await assert.rejects(sealVerifiedObject("films/master", "bridge/sealed/id", "etag"), /multipart/);
});
