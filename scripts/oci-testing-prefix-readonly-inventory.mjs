import { writeFile } from "node:fs/promises";
import { createPrivateKey, createPublicKey, createSign, createHash } from "node:crypto";

const EXPECTED_BUCKET = "bucket-20260526-1544";
const EXPECTED_REGION = "ap-mumbai-1";
const EXPECTED_PREFIX = "testing/";
const MAX_OBJECTS = Number.parseInt(process.env.OCI_INVENTORY_MAX_OBJECTS || "100000", 10);
const PAGE_SIZE = 1000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function normalizePrivateKey(value) {
  let key = value.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    try { const parsed = JSON.parse(key); if (typeof parsed === "string") key = parsed; } catch {}
  }
  return key.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n").replace(/^\\uFEFF/, "").replace(/^\uFEFF/, "");
}
function fingerprintFromKey(privateKey) {
  const der = createPublicKey(createPrivateKey(privateKey)).export({ type: "spki", format: "der" });
  return createHash("md5").update(der).digest("hex").match(/.{1,2}/g).join(":");
}

const tenancy = required("OCI_TENANCY_OCID");
const user = required("OCI_USER_OCID");
const privateKey = normalizePrivateKey(required("OCI_PRIVATE_KEY"));
const fingerprint = process.env.OCI_FINGERPRINT?.trim() || fingerprintFromKey(privateKey);
const region = required("OCI_REGION");
const bucket = required("OCI_BUCKET_NAME");
const prefix = required("OCI_OBJECT_PREFIX");
if (bucket !== EXPECTED_BUCKET) throw new Error("Refusing unexpected bucket.");
if (region !== EXPECTED_REGION) throw new Error("Refusing unexpected region.");
if (prefix !== EXPECTED_PREFIX) throw new Error("Refusing unexpected prefix; only testing/ is allowed.");
if (!Number.isSafeInteger(MAX_OBJECTS) || MAX_OBJECTS < 1 || MAX_OBJECTS > 500000) {
  throw new Error("OCI_INVENTORY_MAX_OBJECTS must be an integer between 1 and 500000");
}

const base = `https://objectstorage.${region}.oraclecloud.com`;
function signedHeaders(url) {
  const date = new Date().toUTCString();
  const canonical = `(request-target): get ${url.pathname}${url.search}\nhost: ${url.host}\ndate: ${date}`;
  const signer = createSign("RSA-SHA256");
  signer.update(canonical); signer.end();
  return {
    date, host: url.host,
    authorization: `Signature version="1",keyId="${tenancy}/${user}/${fingerprint}",algorithm="rsa-sha256",headers="(request-target) host date",signature="${signer.sign(privateKey, "base64")}"`,
  };
}
async function get(path) {
  const url = new URL(path, base);
  const response = await fetch(url, { method: "GET", headers: signedHeaders(url), signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok) throw new Error(`OCI read request failed (${response.status})`);
  return response;
}
async function resolveNamespace() {
  const configured = process.env.OCI_NAMESPACE?.trim();
  if (configured) return configured;
  return (await (await get("/n/")).text()).replaceAll('"', "").trim();
}
const namespace = await resolveNamespace();
if (!namespace) throw new Error("OCI namespace lookup returned empty value");

const objects = [];
let start;
let pages = 0;
while (true) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), prefix: EXPECTED_PREFIX, fields: "name,size,timeCreated,storageTier,archivalState" });
  if (start) params.set("start", start);
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(bucket)}/o?${params.toString()}`;
  const page = await (await get(path)).json();
  const batch = Array.isArray(page.objects) ? page.objects : [];
  objects.push(...batch);
  pages++;
  if (objects.length >= MAX_OBJECTS) throw new Error(`Testing-prefix inventory exceeded safety cap (${MAX_OBJECTS}); no partial totals reported.`);
  if (!page.nextStartWith || batch.length === 0) break;
  start = page.nextStartWith;
  if (pages > Math.ceil(MAX_OBJECTS / PAGE_SIZE) + 1) throw new Error("Pagination exceeded safety limit");
}

const now = Date.now();
const totals = { objectCount: objects.length, totalBytes: 0, byStorageTier: {}, ageCohorts: { under30Days: 0, days30To90: 0, days91To365: 0, over365Days: 0, unknownCreatedAt: 0 }, objectsMissingSize: 0, objectsMissingStorageTier: 0 };
for (const object of objects) {
  const size = Number(object.size);
  if (Number.isSafeInteger(size) && size >= 0) totals.totalBytes += size; else totals.objectsMissingSize++;
  const tier = object.storageTier || "UNKNOWN";
  totals.byStorageTier[tier] = (totals.byStorageTier[tier] || 0) + 1;
  if (!object.storageTier) totals.objectsMissingStorageTier++;
  const created = Date.parse(object.timeCreated || "");
  if (!Number.isFinite(created)) totals.ageCohorts.unknownCreatedAt++;
  else {
    const days = Math.max(0, (now - created) / 86400000);
    if (days < 30) totals.ageCohorts.under30Days++;
    else if (days < 90) totals.ageCohorts.days30To90++;
    else if (days < 365) totals.ageCohorts.days91To365++;
    else totals.ageCohorts.over365Days++;
  }
}
const report = {
  reportType: "READ_ONLY_OCI_TESTING_PREFIX_INVENTORY",
  generatedAt: new Date().toISOString(),
  provider: "oracle-cloud-infrastructure-object-storage",
  region, bucket, prefix: EXPECTED_PREFIX, namespaceResolved: true,
  pagesRead: pages, complete: true, totals,
  safety: {
    operations: ["GET namespace", "GET object listing restricted to testing/"],
    objectReads: 0, objectWrites: 0, copies: 0, tierTransitions: 0, restores: 0, deletes: 0,
    databaseWrites: 0, productionPrefixAccess: false,
    note: "Only object listings with the fixed testing/ prefix are requested. No object names, media bytes, or per-object metadata are emitted.",
  },
};
await writeFile("inventory-report.json", JSON.stringify(report, null, 2) + String.fromCharCode(10), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
