import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { sealVerifiedObject, verifyObject } from "./oci-object-storage.server.ts";

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

test("OCI tier mutation signs and sends a successful Object Storage action", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const values = {
    OCI_TENANCY_OCID: "test-tenancy", OCI_USER_OCID: "test-user",
    OCI_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    OCI_FINGERPRINT: "test-fingerprint", OCI_REGION: "ap-mumbai-1",
    OCI_NAMESPACE: "test-namespace", OCI_BUCKET_NAME: "test-bucket",
  };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, values);
  let requestCount = 0;
  globalThis.fetch = async (input, init) => {
    requestCount += 1;
    const url = new URL(String(input));
    assert.equal(init?.method, "POST");
    assert.equal(url.origin, "https://objectstorage.ap-mumbai-1.oraclecloud.com");
    assert.equal(url.pathname, "/n/test-namespace/b/test-bucket/actions/updateObjectStorageTier");
    const rawBody = String(init?.body);
    const body = JSON.parse(rawBody);
    assert.deepEqual(body, { objectName: "test-key", storageTier: "InfrequentAccess" });
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization") || "";
    const signature = authorization.match(/signature="([^"]+)"/)?.[1];
    assert.ok(signature, "OCI authorization must contain a signature");
    assert.match(authorization, /algorithm="rsa-sha256"/);
    assert.match(authorization, /headers="\(request-target\) host date x-content-sha256 content-type content-length"/);
    const digest = createHash("sha256").update(rawBody).digest("base64");
    assert.equal(headers.get("x-content-sha256"), digest);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("content-length"), String(Buffer.byteLength(rawBody)));
    const signed = [
      `(request-target): post ${url.pathname}`,
      `host: ${url.host}`,
      `date: ${headers.get("date")}`,
      `x-content-sha256: ${digest}`,
      "content-type: application/json",
      `content-length: ${Buffer.byteLength(rawBody)}`,
    ].join("\\n");
    assert.ok(verify("RSA-SHA256", Buffer.from(signed), publicKey, Buffer.from(signature, "base64")));
    return new Response(null, { status: 200, headers: { "opc-request-id": "tier-test" } });
  };
  try {
    const { updateObjectStorageTier } = await import("./oci-object-storage.server.ts");
    assert.deepEqual(
      await updateObjectStorageTier({ key: "test-key", storageTier: "InfrequentAccess" }),
      { key: "test-key", storageTier: "InfrequentAccess", requestId: "tier-test" },
    );
    assert.equal(requestCount, 1, "one signed OCI tier mutation should be sent");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
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
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
