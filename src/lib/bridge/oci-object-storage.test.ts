import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { abortMultipartUpload, commitMultipartUpload, deleteObject, initiateMultipartUpload, sealVerifiedObject, verifyObject } from "./oci-object-storage.server.ts";

test("OCI private key normalization accepts escaped and quoted PEM secrets", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const variants = [
    pem,
    JSON.stringify(pem),
    pem.replaceAll("\n", "\\n"),
    JSON.stringify(pem.replaceAll("\n", "\\n")),
  ];

  const originalFetch = globalThis.fetch;
  const keys = [
    "OCI_TENANCY_OCID",
    "OCI_USER_OCID",
    "OCI_PRIVATE_KEY",
    "OCI_FINGERPRINT",
    "OCI_REGION",
    "OCI_NAMESPACE",
    "OCI_BUCKET_NAME",
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const variant of variants) {
      Object.assign(process.env, {
        OCI_TENANCY_OCID: "test-tenancy",
        OCI_USER_OCID: "test-user",
        OCI_PRIVATE_KEY: variant,
        OCI_FINGERPRINT: "test-fingerprint",
        OCI_REGION: "ap-mumbai-1",
        OCI_NAMESPACE: "test-namespace",
        OCI_BUCKET_NAME: "test-bucket",
      });
      globalThis.fetch = async () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": "1", etag: '"test-etag"' },
        });

      await assert.doesNotReject(verifyObject("asset-key"));
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OCI copy polling uses Object Storage and only verifies successful copies", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = {
    OCI_TENANCY_OCID: "test-tenancy",
    OCI_USER_OCID: "test-user",
    OCI_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OCI_FINGERPRINT: "test-fingerprint",
    OCI_REGION: "ap-mumbai-1",
    OCI_NAMESPACE: "test-namespace",
    OCI_BUCKET_NAME: "test-bucket",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  try {
    for (const outcome of ["SUCCEEDED", "FAILED", "CANCELED", "HTTP_ERROR"]) {
      await t.test(outcome, async () => {
        const calls: Array<{ url: URL; method: string }> = [];
        globalThis.fetch = async (input, init) => {
          const url = new URL(String(input));
          const method = init?.method || "GET";
          calls.push({ url, method });
          assert.equal(url.origin, "https://objectstorage.ap-mumbai-1.oraclecloud.com");
          if (method === "POST") {
            assert.equal(url.pathname, "/n/test-namespace/b/test-bucket/actions/copyObject");
            assert.equal(JSON.parse(String(init?.body)).sourceObjectIfMatch, "source-etag");
            return new Response(null, { status: 202, headers: { "opc-work-request-id": "copy/id" } });
          }
          if (method === "GET") {
            assert.equal(url.pathname, "/workRequests/copy%2Fid");
            const headers = new Headers(init?.headers);
            const signature = headers.get("authorization")?.match(/signature="([^"]+)"/)?.[1];
            assert.ok(signature);
            const signed = `(request-target): get ${url.pathname}\nhost: ${url.host}\ndate: ${headers.get("date")}`;
            assert.ok(verify("RSA-SHA256", Buffer.from(signed), publicKey, Buffer.from(signature, "base64")));
            return outcome === "HTTP_ERROR"
              ? new Response(null, { status: 403 })
              : Response.json({ status: outcome });
          }
          assert.equal(method, "HEAD");
          assert.equal(url.pathname, "/n/test-namespace/b/test-bucket/o/sealed-key");
          return new Response(null, { headers: { "content-length": "12", etag: '"sealed-etag"' } });
        };
        if (outcome === "SUCCEEDED") {
          assert.equal((await sealVerifiedObject("source-key", "sealed-key", "source-etag")).byteSize, 12);
          assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "HEAD"]);
        } else {
          const message = outcome === "HTTP_ERROR" ? /lookup failed \(403\)/ : new RegExp(`copy ${outcome.toLowerCase()}`);
          await assert.rejects(sealVerifiedObject("source-key", "sealed-key", "source-etag"), message);
          assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"]);
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test("OCI object verification rejects an unexpected content type", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = {
    OCI_TENANCY_OCID: "test-tenancy", OCI_USER_OCID: "test-user",
    OCI_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OCI_FINGERPRINT: "test-fingerprint", OCI_REGION: "ap-mumbai-1",
    OCI_NAMESPACE: "test-namespace", OCI_BUCKET_NAME: "test-bucket",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  globalThis.fetch = async () => new Response(null, { status: 200,
    headers: { "content-length": "12", "content-type": "image/png", etag: '"test-etag"' } });
  try {
    await assert.rejects(verifyObject("asset-key", "video/mp4"), /content type mismatch/);
    assert.equal((await verifyObject("asset-key", "image/png")).contentType, "image/png");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});


test("OCI multipart uses native initiation, signed part requests, commit manifest, and abort", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = { OCI_TENANCY_OCID: "test-tenancy", OCI_USER_OCID: "test-user", OCI_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), OCI_FINGERPRINT: "test-fingerprint", OCI_REGION: "ap-mumbai-1", OCI_NAMESPACE: "test-namespace", OCI_BUCKET_NAME: "test-bucket" };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  const calls: Array<{ url: URL; method: string; headers: Headers; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    const headers = new Headers(init?.headers);
    const body = init?.body === undefined ? undefined : String(init.body);
    calls.push({ url, method, headers, body });
    if (method === "POST" && url.pathname === "/n/test-namespace/b/test-bucket/u") {
      const details = JSON.parse(body || "{}");
      assert.equal(details.object, "bridge/test-owner/test-title/master/test.mp4");
      assert.equal(details.contentType, "video/mp4");
      return Response.json({ uploadId: "upload-123" });
    }
    if (method === "POST") {
      assert.equal(url.pathname, "/n/test-namespace/b/test-bucket/u/bridge%2Ftest-owner%2Ftest-title%2Fmaster%2Ftest.mp4");
      assert.equal(url.searchParams.get("uploadId"), "upload-123");
      assert.deepEqual(JSON.parse(body || "{}"), { partsToCommit: [{ partNum: 1, etag: '"part-etag-1"' }, { partNum: 2, etag: '"part-etag-2"' }] });
      return new Response(null, { status: 200 });
    }
    assert.equal(method, "DELETE");
    assert.equal(url.searchParams.get("uploadId"), "upload-123");
    return new Response(null, { status: 204 });
  };
  try {
    const key = "bridge/test-owner/test-title/master/test.mp4";
    const upload = await initiateMultipartUpload({ key, contentType: "video/mp4" });
    assert.equal(upload.uploadId, "upload-123");
    const digest = Buffer.alloc(32, 7).toString("base64");
    const signed = await (await import("./oci-object-storage.server.ts")).createMultipartPartRequest({ key, uploadId: upload.uploadId, partNum: 1, byteSize: 1024, sha256: digest });
    const url = new URL(signed.url);
    assert.equal(url.searchParams.get("uploadId"), "upload-123");
    assert.equal(url.searchParams.get("uploadPartNum"), "1");
    const signature = signed.headers.authorization.match(/signature="([^"]+)"/)?.[1];
    assert.ok(signature);
    const signedText = "(request-target): put " + url.pathname + url.search + "\nhost: " + url.host + "\ndate: " + signed.headers.date + "\ncontent-type: application/octet-stream\ncontent-length: 1024\nx-content-sha256: " + digest;
    assert.ok(verify("RSA-SHA256", Buffer.from(signedText), publicKey, Buffer.from(signature, "base64")));
    await commitMultipartUpload({ key, uploadId: upload.uploadId, parts: [{ partNum: 1, etag: '"part-etag-1"' }, { partNum: 2, etag: '"part-etag-2"' }] });
    await abortMultipartUpload({ key, uploadId: upload.uploadId });
    assert.deepEqual(calls.map((call) => call.method), ["POST", "POST", "DELETE"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("OCI deleteObject and abortMultipartUpload handle 404 cleanly and throw on non-404 errors", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = {
    OCI_TENANCY_OCID: "test-tenancy",
    OCI_USER_OCID: "test-user",
    OCI_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OCI_FINGERPRINT: "test-fingerprint",
    OCI_REGION: "ap-mumbai-1",
    OCI_NAMESPACE: "test-namespace",
    OCI_BUCKET_NAME: "test-bucket",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);

  try {
    // 1. deleteObject with 204 No Content
    globalThis.fetch = async () => new Response(null, { status: 204 });
    const del204 = await deleteObject("test-key-204");
    assert.deepEqual(del204, { deleted: true, key: "test-key-204" });

    // 2. deleteObject with 404 Not Found (idempotent, does not throw)
    globalThis.fetch = async () => new Response(null, { status: 404 });
    const del404 = await deleteObject("test-key-404");
    assert.deepEqual(del404, { deleted: false, key: "test-key-404" });

    // 3. deleteObject with 500 Internal Server Error (must throw)
    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(deleteObject("test-key-500"), /OCI object deletion failed \(500\)/);

    // 4. abortMultipartUpload with 204 No Content
    globalThis.fetch = async () => new Response(null, { status: 204 });
    const abort204 = await abortMultipartUpload({ key: "test-key", uploadId: "up-204" });
    assert.deepEqual(abort204, { aborted: true, key: "test-key" });

    // 5. abortMultipartUpload with 404 Not Found (idempotent, does not throw)
    globalThis.fetch = async () => new Response(null, { status: 404 });
    const abort404 = await abortMultipartUpload({ key: "test-key", uploadId: "up-404" });
    assert.deepEqual(abort404, { aborted: false, key: "test-key" });

    // 6. abortMultipartUpload with 500 Internal Server Error (must throw)
    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(
      abortMultipartUpload({ key: "test-key", uploadId: "up-500" }),
      /OCI multipart abort failed \(500\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("cleanup error accumulation detects teardown failures without suppressed exceptions", async () => {
  const cleanupErrors: string[] = [];
  const fakeTeardown = async (task: () => Promise<void>, name: string) => {
    try {
      await task();
    } catch (err) {
      cleanupErrors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  await fakeTeardown(async () => {
    throw new Error("HTTP 502 Bad Gateway during delete");
  }, "delete sealedKey");

  await fakeTeardown(async () => {
    // success
  }, "delete sourceKey");

  assert.equal(cleanupErrors.length, 1);
  assert.match(cleanupErrors[0]!, /HTTP 502/);
  assert.throws(() => {
    if (cleanupErrors.length > 0) {
      throw new Error(`OCI E2E cleanup failed: ${cleanupErrors.join("; ")}`);
    }
  }, /OCI E2E cleanup failed: delete sealedKey: HTTP 502 Bad Gateway during delete/);
});
