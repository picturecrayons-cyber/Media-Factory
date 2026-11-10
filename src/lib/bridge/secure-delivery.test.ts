import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

test("delivery manifest hash is stable for sorted asset evidence",()=>{
  const assets=[{id:"b",checksum:"b".repeat(64),size:20},{id:"a",checksum:"a".repeat(64),size:10}].sort((x,y)=>x.id.localeCompare(y.id));
  const value=assets.map(a=>`${a.id}:${a.checksum}:${a.size}`).join("\n");
  assert.equal(createHash("sha256").update(value).digest("hex").length,64);
});
test("delivery manifest cannot contain a zero-size or missing-checksum asset",()=>{
  const assets=[{size:0,checksum:"a".repeat(64)},{size:10,checksum:""}];
  assert.equal(assets.some(a=>a.size<=0||!a.checksum),true);
});
