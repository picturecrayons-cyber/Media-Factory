import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("server function auth awaits the current Supabase session token", () => {
  const client = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
  const middleware = readFileSync(new URL("./middleware.ts", import.meta.url), "utf8");
  assert.match(client, /export async function getBearerToken/);
  assert.match(client, /await getSupabaseSession\(\)/);
  assert.match(middleware, /const bearerToken = await getBearerToken\(\)/);
  assert.doesNotMatch(middleware, /bearerToken: getBearerToken\(\)/);
});
