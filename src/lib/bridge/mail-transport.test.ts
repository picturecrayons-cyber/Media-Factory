import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeMailTransport } from "./mail-transport.ts";

test("Preview always uses the non-network sink even if SMTP variables exist", () => {
  assert.equal(resolveBridgeMailTransport({ VERCEL_ENV: "preview", NODE_ENV: "production", SMTP_HOST: "smtp.example", SMTP_USER: "u", SMTP_PASS: "p" }), "sink");
});

test("local development and test use the non-network sink", () => {
  assert.equal(resolveBridgeMailTransport({ NODE_ENV: "development" }), "sink");
  assert.equal(resolveBridgeMailTransport({ NODE_ENV: "test", VERCEL_ENV: "production" }), "sink");
});

test("only a matched Vercel Production runtime enables SMTP", () => {
  assert.equal(resolveBridgeMailTransport({ VERCEL_ENV: "production", NODE_ENV: "production" }), "smtp");
});

test("unknown and mismatched environments fail closed", () => {
  assert.throws(() => resolveBridgeMailTransport({ NODE_ENV: "production" }));
  assert.throws(() => resolveBridgeMailTransport({ VERCEL_ENV: "production", NODE_ENV: "development" }));
  assert.throws(() => resolveBridgeMailTransport({ VERCEL_ENV: "custom", NODE_ENV: "production" }));
});
