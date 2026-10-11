import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
} from "node:crypto";
import { bridgeEnv } from "./env.ts";
import { toLatin1 } from "./latin1.ts";

type OciConfig = {
  tenancy: string;
  user: string;
  fingerprint: string;
  privateKey: string;
  region: string;
  bucket: string;
  namespace?: string;
};

function normalizePrivateKey(value: string) {
  let normalized = value.trim();

  // Vercel/CI secrets can arrive as escaped newlines or as a JSON-quoted string.
  // Accept both without relaxing the crypto parser or silently repairing arbitrary text.
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    try {
      const parsed = JSON.parse(normalized);
      if (typeof parsed === "string") normalized = parsed;
    } catch {
      // Leave the value untouched; createPrivateKey will fail closed below.
    }
  }

  normalized = normalized.replaceAll("\\r\\n", "\n");
  normalized = normalized.replaceAll("\\n", "\n");
  normalized = normalized.replace(/^\\uFEFF/, "");
  normalized = normalized.replace(/^\uFEFF/, "");

  if (
    !/\bBEGIN\s+PRIVATE\s+KEY\b/.test(normalized) &&
    !normalized.includes("BEGIN RSA PRIVATE KEY")
  ) {
    throw new Error("OCI private key must be PEM encoded");
  }

  return normalized;
}

function derivedFingerprint(privateKey: string) {
  const key = createPrivateKey(normalizePrivateKey(privateKey));
  const publicDer = createPublicKey(key).export({ type: "spki", format: "der" });
  return createHash("md5")
    .update(publicDer)
    .digest("hex")
    .match(/.{1,2}/g)!
    .join(":");
}

function config(): OciConfig {
  const tenancy = bridgeEnv.ociTenancyOcid();
  const user = bridgeEnv.ociUserOcid();
  const privateKey = bridgeEnv.ociPrivateKey();
  const region = bridgeEnv.ociRegion();
  const bucket = bridgeEnv.ociBucket();
  if (!tenancy || !user || !privateKey || !region || !bucket) {
    throw new Error("OCI Object Storage is not fully configured");
  }
  return {
    tenancy,
    user,
    privateKey: normalizePrivateKey(privateKey),
    fingerprint: bridgeEnv.ociFingerprint() || derivedFingerprint(privateKey),
    region,
    bucket,
    namespace: bridgeEnv.ociNamespace(),
  };
}

function endpoint(region: string) {
  return `https://objectstorage.${region}.oraclecloud.com`;
}

function encodedObjectName(key: string) {
  return encodeURIComponent(key);
}

function sha256Body(body: string | Uint8Array) {
  return createHash("sha256").update(body).digest("base64");
}

function signHeaders(opts: {
  cfg: OciConfig;
  method: string;
  url: URL;
  body?: string;
  contentType?: string;
}) {
  const method = opts.method.toLowerCase();
  const date = new Date().toUTCString();
  const host = opts.url.host;
  const requestTarget = `${method} ${opts.url.pathname}${opts.url.search}`;
  const lines = [`(request-target): ${requestTarget}`, `host: ${host}`, `date: ${date}`];
  const signedHeaders = ["(request-target)", "host", "date"];
  const headers: Record<string, string> = { host, date };

  if (opts.body !== undefined) {
    const contentType = opts.contentType || "application/json";
    const contentLength = Buffer.byteLength(opts.body).toString();
    const digest = sha256Body(opts.body);
    headers["x-content-sha256"] = digest;
    headers["content-type"] = contentType;
    headers["content-length"] = contentLength;
    lines.push(
      `x-content-sha256: ${digest}`,
      `content-type: ${contentType}`,
      `content-length: ${contentLength}`,
    );
    signedHeaders.push("x-content-sha256", "content-type", "content-length");
  }

  const signer = createSign("RSA-SHA256");
  signer.update(lines.join("\n"));
  signer.end();
  const signature = signer.sign(opts.cfg.privateKey, "base64");
  headers.authorization =
    `Signature version="1",keyId="${opts.cfg.tenancy}/${opts.cfg.user}/${opts.cfg.fingerprint}",` +
    `algorithm="rsa-sha256",headers="${signedHeaders.join(" ")}",signature="${signature}"`;
  return headers;
}

async function signedFetch(opts: {
  cfg: OciConfig;
  method: "GET" | "HEAD" | "POST" | "DELETE";
  path: string;
  body?: unknown;
}) {
  const url = new URL(opts.path, endpoint(opts.cfg.region));
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers = signHeaders({
    cfg: opts.cfg,
    method: opts.method,
    url,
    body,
    contentType: body === undefined ? undefined : "application/json",
  });
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [toLatin1(key), toLatin1(value)]),
  );
  return fetch(url, { method: opts.method, headers: safeHeaders, body });
}

async function resolveNamespace(cfg: OciConfig) {
  if (cfg.namespace) return cfg.namespace;
  const res = await signedFetch({ cfg, method: "GET", path: "/n/" });
  if (!res.ok) throw new Error(`OCI namespace lookup failed (${res.status})`);
  const ns = (await res.text()).replaceAll('"', "").trim();
  if (!ns) throw new Error("OCI Object Storage namespace is empty");
  return ns;
}

async function createPar(opts: {
  key: string;
  accessType: "ObjectWrite" | "ObjectRead";
  expiresIn: number;
}) {
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const timeExpires = new Date(Date.now() + opts.expiresIn * 1000).toISOString();
  const body = {
    name: `bridge-${opts.accessType.toLowerCase()}-${Date.now()}`,
    accessType: opts.accessType,
    objectName: opts.key,
    timeExpires,
  };
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(cfg.bucket)}/p/`;
  const res = await signedFetch({ cfg, method: "POST", path, body });
  if (!res.ok) throw new Error(`OCI pre-authenticated request failed (${res.status})`);
  const parsed = (await res.json()) as { accessUri?: string };
  if (!parsed.accessUri) throw new Error("OCI pre-authenticated request returned no access URI");
  return {
    url: new URL(parsed.accessUri, endpoint(cfg.region)).toString(),
    bucket: cfg.bucket,
    namespace,
  };
}

export async function signUpload(opts: { key: string; contentType: string; expiresIn?: number }) {
  const signed = await createPar({
    key: opts.key,
    accessType: "ObjectWrite",
    expiresIn: opts.expiresIn ?? 900,
  });
  return { url: signed.url, key: opts.key, bucket: signed.bucket, method: "PUT" as const };
}

export async function signDownload(opts: { key: string; expiresIn?: number }) {
  const signed = await createPar({
    key: opts.key,
    accessType: "ObjectRead",
    expiresIn: opts.expiresIn ?? 300,
  });
  return { url: signed.url, key: opts.key, bucket: signed.bucket, method: "GET" as const };
}

export async function verifyObject(key: string, expectedContentType?: string | null) {
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(cfg.bucket)}/o/${encodedObjectName(key)}`;
  const res = await signedFetch({ cfg, method: "HEAD", path });
  if (!res.ok) throw new Error(`OCI object verification failed (${res.status})`);
  const contentLength = Number(res.headers.get("content-length") || 0);
  const contentType = res.headers.get("content-type");
  if (expectedContentType && contentType !== expectedContentType) {
    throw new Error(`OCI object content type mismatch: expected ${expectedContentType}, received ${contentType || "missing"}`);
  }
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) throw new Error("Uploaded object is empty");
  return {
    byteSize: contentLength,
    contentType,
    etag: res.headers.get("etag")?.replaceAll('"', "") ?? null,
  };
}

async function pollWorkRequest(cfg: OciConfig, workRequestId: string) {
  const url = new URL(`/workRequests/${encodeURIComponent(workRequestId)}`, endpoint(cfg.region));
  for (let i = 0; i < 30; i += 1) {
    const headers = signHeaders({ cfg, method: "GET", url });
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) throw new Error(`OCI copy work-request lookup failed (${res.status})`);
    const body = (await res.json()) as { status?: string };
    if (body.status === "SUCCEEDED") return;
    if (body.status === "FAILED" || body.status === "CANCELED") {
      throw new Error(`OCI object copy ${body.status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("OCI object copy did not complete in time");
}

/** Copy a verified upload into an immutable destination key. */
export async function sealVerifiedObject(sourceKey: string, destinationKey: string, expectedEtag: string) {
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(cfg.bucket)}/actions/copyObject`;
  const res = await signedFetch({
    cfg,
    method: "POST",
    path,
    body: {
      sourceObjectName: sourceKey,
      sourceObjectIfMatch: expectedEtag,
      destinationRegion: cfg.region,
      destinationNamespace: namespace,
      destinationBucket: cfg.bucket,
      destinationObjectName: destinationKey,
    },
  });
  if (res.status !== 202 && !res.ok) throw new Error(`OCI object copy failed (${res.status})`);
  const workRequestId = res.headers.get("opc-work-request-id");
  if (workRequestId) await pollWorkRequest(cfg, workRequestId);
  return verifyObject(destinationKey);
}

export async function deleteObject(key: string) {
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(cfg.bucket)}/o/${encodedObjectName(key)}`;
  const res = await signedFetch({ cfg, method: "DELETE", path });
  if (!res.ok && res.status !== 404) throw new Error(`OCI object deletion failed (${res.status})`);
  return { deleted: res.status !== 404, key };
}

export function titleAssetKey(opts: { ownerUserId: string; titleId: string; kind: string; filename: string }) {
  const safe = opts.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `bridge/${opts.ownerUserId}/${opts.titleId}/${opts.kind}/${Date.now()}-${safe}`;
}

export type OciStorageTier = "Standard" | "InfrequentAccess" | "Archive";

/** Change an OCI object's physical storage tier. Caller must enforce business policy first. */
export async function updateObjectStorageTier(opts: { key: string; storageTier: OciStorageTier; versionId?: string }) {
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const path = "/n/" + encodeURIComponent(namespace) + "/b/" + encodeURIComponent(cfg.bucket) + "/actions/updateObjectStorageTier";
  const res = await signedFetch({
    cfg,
    method: "POST",
    path,
    body: {
      objectName: opts.key,
      storageTier: opts.storageTier,
      ...(opts.versionId ? { versionId: opts.versionId } : {}),
    },
  });
  if (!res.ok) throw new Error(`OCI storage tier update failed (${res.status})`);
  return { key: opts.key, storageTier: opts.storageTier, requestId: res.headers.get("opc-request-id") };
}
