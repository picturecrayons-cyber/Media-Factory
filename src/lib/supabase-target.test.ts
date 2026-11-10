import assert from "node:assert/strict";
import test from "node:test";
import { assertSupabaseProjectTarget } from "./supabase-target.ts";

test("deployed Preview requires the Testing DB", () => {
  assert.doesNotThrow(() => assertSupabaseProjectTarget(
    "https://jbymleftneggcgutlcqu.supabase.co/", "preview", true,
  ));
  assert.throws(() => assertSupabaseProjectTarget(
    "https://mlmgugivsyoxzdgwkbpu.supabase.co", "preview", true,
  ), /not bound to its canonical Supabase project/);
});

test("deployed Production requires the Production DB", () => {
  assert.doesNotThrow(() => assertSupabaseProjectTarget(
    "https://mlmgugivsyoxzdgwkbpu.supabase.co", "production", true,
  ));
  assert.throws(() => assertSupabaseProjectTarget(
    "https://jbymleftneggcgutlcqu.supabase.co", "production", true,
  ), /not bound to its canonical Supabase project/);
});

test("deployed runtimes fail closed when target is missing or unsupported", () => {
  assert.throws(() => assertSupabaseProjectTarget(
    "https://jbymleftneggcgutlcqu.supabase.co", undefined, true,
  ), /VITE_SUPABASE_TARGET must be set/);
  assert.throws(() => assertSupabaseProjectTarget(
    "https://jbymleftneggcgutlcqu.supabase.co", "staging", true,
  ), /unsupported VITE_SUPABASE_TARGET/);
});

test("local and test targets cannot connect to remote projects", () => {
  assert.doesNotThrow(() => assertSupabaseProjectTarget("http://localhost:54321", "local", false));
  assert.throws(() => assertSupabaseProjectTarget(
    "https://mlmgugivsyoxzdgwkbpu.supabase.co", "test", false,
  ), /only to localhost Supabase/);
});

test("non-deployed local runtime may omit an explicit target", () => {
  assert.doesNotThrow(() => assertSupabaseProjectTarget(
    "http://localhost:54321", undefined, false,
  ));
});
