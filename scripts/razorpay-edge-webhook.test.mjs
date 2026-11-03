import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("external Razorpay function disables Supabase gateway JWT verification", () => {
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*verify_jwt\s*=\s*false/);
});

test("fallback event ID awaits the body hash", () => {
  assert.match(source, /\x60\$\{e\}:\$\{await sha256\(raw\)\}\x60/);
  assert.doesNotMatch(source, /\$\{awaitHash\(raw\)\}/);
});

test("captured Bridge payment is resolved from provider_order_id, not only notes", () => {
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id", payment\.order_id\)/);
  assert.match(source, /if \(localPayment\) surface = "bridge"/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if \(!payment\?\.order_id \|\| !payment\?\.id\) return await failEvent/);
  assert.match(source, /new Response\(message, \{ status: 503 \}\)/);
});

test("Edge webhook fails closed for every Bridge payment purpose and never writes entitlements", () => {
  assert.match(source, /if \(surface === "bridge"\)[\s\S]*?failEvent\(supabase, id, "Bridge payment fulfillment disabled in Edge webhook/);
  assert.doesNotMatch(source, /from\("bridge_entitlements"\)\.upsert/);
  assert.doesNotMatch(source, /from\("bridge_titles"\)\.update/);
});
