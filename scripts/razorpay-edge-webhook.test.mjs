import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/razorpay-webhook/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("external Razorpay function disables Supabase gateway JWT verification", () => {
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*verify_jwt\s*=\s*false/);
});

test("fallback event ID awaits the body hash", () => {
  assert.match(source, /`\$\{e\}:\$\{await sha256\(raw\)\}`/);
  assert.doesNotMatch(source, /\$\{awaitHash\(raw\)\}/);
});

test("captured Bridge payment is resolved from provider_order_id, not only notes", () => {
  assert.match(source, /from\("bridge_payments"\)[\s\S]*eq\("provider_order_id", payment\.order_id\)/);
  assert.match(source, /if \(localPayment\) surface = "bridge"/);
});

test("unmatched Bridge capture remains retriable", () => {
  assert.match(source, /if \(!localPayment\) return await failEvent\(supabase, id, "Bridge order not persisted yet"\)/);
  assert.match(source, /new Response\(message, \{ status: 503 \}\)/);
});

test("entitlement and title transition happen before webhook is marked processed", () => {
  const entitlement = source.indexOf('from("bridge_entitlements").upsert');
  const transition = source.indexOf('from("bridge_titles").update');
  const processed = source.indexOf('status: "processed"');
  assert.ok(entitlement >= 0 && transition >= 0 && processed >= 0);
  assert.ok(entitlement < processed);
  assert.ok(transition < processed);
});

test("invalid Razorpay signatures are rejected before JSON parsing or persistence", () => {
  const rejectSignature = source.indexOf('if(!safeEqualHex(expected,signature))return new Response("Invalid signature",{status:401})');
  const parsePayload = source.indexOf("let payload:any;try{payload=JSON.parse(raw)}catch");
  const persistEvent = source.indexOf('supabase.from("bridge_webhook_events").insert');
  assert.ok(rejectSignature >= 0 && parsePayload > rejectSignature && persistEvent > parsePayload);
});

test("duplicate event IDs with changed payloads are rejected as collisions", () => {
  assert.ok(source.includes('if(existing.payload_hash!==hash)return new Response("Event collision",{status:409})'));
});

test("processed webhook duplicates return success without replaying payment side effects", () => {
  assert.ok(source.includes('if(existing.status==="processed")return Response.json({ok:true,duplicate:true})'));
});

test("only one active worker claims an event and active duplicates are acknowledged", () => {
  assert.ok(source.includes('.neq("status","processed")'));
  assert.ok(source.includes('processing_token.is.null,processing_started_at.lt.${staleBefore}'));
  assert.ok(source.includes('if(!claimed)return Response.json({ok:true,duplicate:true,in_progress:true})'));
});
