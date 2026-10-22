import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { sealVerifiedObject, verifyObject } from "./oci-object-storage.server.ts";

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
            assert.equal(url.pathname, "/n/test-namespace/workRequests/copy%2Fid");
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

test("OCI copy work-request handles transient 404 propagation delay and recovers", async () => {
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
    let getAttempts = 0;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || "GET";
      if (method === "POST") {
        return new Response(null, { status: 202, headers: { "opc-work-request-id": "wr-transient-1" } });
      }
      if (method === "GET") {
        getAttempts += 1;
        // First attempt returns 404 (temporary not-yet-visible during propagation window)
        if (getAttempts === 1) {
          return new Response(null, { status: 404 });
        }
        // Second attempt returns SUCCEEDED
        return Response.json({ status: "SUCCEEDED" });
      }
      // HEAD on destination object
      return new Response(null, { headers: { "content-length": "42", etag: '"sealed-etag"' } });
    };

    const sealed = await sealVerifiedObject("src", "dst", "etag", {
      propagationGracePeriodMs: 5_000,
      pollIntervalMs: 5,
    });
    assert.equal(sealed.byteSize, 42);
    assert.equal(getAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OCI copy fails closed when a persistent work-request 404 has no verified destination", async () => {
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
    globalThis.fetch = async (input, init) => {
      const method = init?.method || "GET";
      if (method === "POST") {
        return new Response(null, { status: 202, headers: { "opc-work-request-id": "wr-persistent-404" } });
      }
      if (method === "GET") {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    };

    await assert.rejects(
      sealVerifiedObject("src", "dst", "etag", {
        propagationGracePeriodMs: 20,
        pollIntervalMs: 5,
      }),
      /lookup failed \(404\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OCI copy fails when destination object is missing after copy completion", async () => {
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
    globalThis.fetch = async (input, init) => {
      const method = init?.method || "GET";
      if (method === "POST") {
        return new Response(null, { status: 202, headers: { "opc-work-request-id": "wr-ok" } });
      }
      if (method === "GET") {
        return Response.json({ status: "SUCCEEDED" });
      }
      // Destination HEAD returns 404
      return new Response(null, { status: 404 });
    };

    await assert.rejects(
      sealVerifiedObject("src", "dst", "etag", {
        propagationGracePeriodMs: 50,
        pollIntervalMs: 5,
      }),
      /verification failed \(404\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OCI copy fails closed when copyObject returns precondition error 412", async () => {
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
    globalThis.fetch = async (input, init) => {
      const method = init?.method || "GET";
      if (method === "POST") {
        return new Response(null, { status: 412 });
      }
      return new Response(null, { status: 500 });
    };

    await assert.rejects(
      sealVerifiedObject("src", "dst", "mismatched-etag"),
      /copy failed \(412\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

