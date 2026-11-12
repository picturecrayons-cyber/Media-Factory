import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeDatabaseUrl } from "./db-url.ts";

const testingApi = "https://jbymleftneggcgutlcqu.supabase.co";
const stale = "postgresql://postgres:secret@db.bbtrosuwisnxacuxvegt.supabase.co:5432/postgres";
const testing = "postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres";

test("a stale DATABASE_URL cannot shadow a matching Testing DB POSTGRES_URL", () => {
  assert.equal(resolveBridgeDatabaseUrl({ VERCEL: "1", SUPABASE_URL: testingApi, DATABASE_URL: stale, POSTGRES_URL: testing }), testing);
});

test("fails closed when all configured database URLs target a different project", () => {
  assert.throws(() => resolveBridgeDatabaseUrl({ VERCEL: "1", SUPABASE_URL: testingApi, DATABASE_URL: stale }), /DATABASE_TARGET_MISMATCH/);
});

test("requires an explicit canonical Supabase target on Vercel", () => {
  assert.throws(() => resolveBridgeDatabaseUrl({ VERCEL: "1", DATABASE_URL: testing }), /canonical SUPABASE_URL/);
});

test("preserves local development precedence without a Supabase target", () => {
  assert.equal(resolveBridgeDatabaseUrl({ DATABASE_URL: stale, POSTGRES_URL: testing }), stale);
});

test("ignores blank candidates and selects the matching target", () => {
  assert.equal(resolveBridgeDatabaseUrl({ VERCEL: "1", SUPABASE_URL: testingApi, DATABASE_URL: " ", POSTGRES_URL: testing }), testing);
});
