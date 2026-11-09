import test from "node:test";
import assert from "node:assert/strict";
import { decryptMultipartCapability, encryptMultipartCapability } from "./multipart-session-crypto.server.ts";

test("multipart capability encryption authenticates and round-trips", () => {
  const prior = process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY;
  process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const value = "https://objectstorage.example.oraclecloud.com/p/private-capability/u/object/id/upload";
    const encrypted = encryptMultipartCapability(value);
    assert.notEqual(encrypted, value);
    assert.equal(decryptMultipartCapability(encrypted), value);
    assert.throws(() => decryptMultipartCapability(encrypted.replace(/.$/, "A")));
  } finally {
    if (prior === undefined) delete process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY;
    else process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY = prior;
  }
});

test("multipart capability encryption fails closed without a key", () => {
  const prior = process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY;
  delete process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptMultipartCapability("secret"), /not configured/);
  } finally {
    if (prior !== undefined) process.env.BRIDGE_MULTIPART_SESSION_ENCRYPTION_KEY = prior;
  }
});
