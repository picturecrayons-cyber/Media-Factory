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
  extraHeaders?: Record<string, string>;
}) {
  const method = opts.method.toLowerCase();
  const date = new Date().toUTCString();
  const host = opts.url.host;
  const requestTarget = `${method} ${opts.url.pathname}${opts.url.search}`;
  const lines = [`(request-target): ${requestTarget}`, `host: ${host}`, `date: ${date}`];
  const signedHeaders = ["(request-target)", "host", "date"];
  const headers: Record<string, string> = { host, date };
  for (const [key, value] of Object.entries(opts.extraHeaders ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const lower = key.toLowerCase();
    headers[lower] = value;
    lines.push(`${lower}: ${value}`);
    signedHeaders.push(lower);
  }

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
  headers?: Record<string, string>;
}) {
  const url = new URL(opts.path, endpoint(opts.cfg.region));
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers = signHeaders({
    cfg: opts.cfg,
    method: opts.method,
    url,
    body,
    contentType: body === undefined ? undefined : "application/json",
    extraHeaders: opts.headers,
  });
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [toLatin1(key), toLatin1(value)]),
  );
  // Fail closed when OCI signing/namespace/PAR requests stall. The caller receives
  // a bounded error instead of leaving the browser upload UI in "Preparing…" forever.
  return fetch(url, {
    method: opts.method,
    headers: safeHeaders,
    body,
    signal: AbortSignal.timeout(15_000),
  });
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
  return { url: signed.url, key: opts.key, bucket: signed.bucket, method: "PUT" as const, checksumAlgorithm: "SHA256" as const };
}

export async function signDownload(opts: { key: string; expiresIn?: number }) {
  const signed = await createPar({
    key: opts.key,
    accessType: "ObjectRead",
    expiresIn: opts.expiresIn ?? 300,
  });
  return { url: signed.url, key: opts.key, bucket: signed.bucket, method: "GET" as const };
}

async function verifyObjectFormat(key: string, contentType: string | null) {
  if (!contentType) throw new Error("OCI object format verification failed: content type is missing");
  const cfg = config();
  const namespace = await resolveNamespace(cfg);
  const path = `/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(cfg.bucket)}/o/${encodedObjectName(key)}`;
  const res = await signedFetch({ cfg, method: "GET", path, headers: { range: "bytes=0-4095" } });
  if (res.status !== 206) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`OCI format verification requires ranged reads (received ${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ascii = (from: number, length: number) => Buffer.from(bytes.subarray(from, from + length)).toString("ascii");
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (contentType === "video/mp4" || contentType === "video/quicktime") {
    if (ascii(4, 4) !== "ftyp") throw new Error("OCI object format mismatch: expected MP4/QuickTime ftyp box");
    return "ISO-BMFF";
  }
  if (contentType === "video/x-matroska") {
    if (!starts(0x1a, 0x45, 0xdf, 0xa3)) throw new Error("OCI object format mismatch: expected Matroska EBML signature");
    return "MATROSKA";
  }
  if (contentType === "application/mxf" || contentType === "video/mxf") {
    if (!starts(0x06, 0x0e, 0x2b, 0x34)) throw new Error("OCI object format mismatch: expected MXF header partition");
    return "MXF";
  }
  if (contentType === "image/jpeg") {
    if (!starts(0xff, 0xd8, 0xff)) throw new Error("OCI object format mismatch: expected JPEG signature");
    return "JPEG";
  }
  if (contentType === "image/png") {
    if (!starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) throw new Error("OCI object format mismatch: expected PNG signature");
    return "PNG";
  }
  if (contentType === "application/pdf") {
    if (!ascii(0, 5).startsWith("%PDF-")) throw new Error("OCI object format mismatch: expected PDF signature");
    return "PDF";
  }
  if (contentType === "text/vtt") {
    if (!ascii(0, 6).startsWith("WEBVTT")) throw new Error("OCI object format mismatch: expected WebVTT signature");
    return "WEBVTT";
  }
  if (contentType === "text/plain" || contentType === "application/x-subrip") {
    if (!ascii(0, bytes.length).includes("-->")) throw new Error("OCI object format mismatch: expected SubRip subtitle cues");
    return "SRT";
  }
  if (contentType === "audio/wav" || contentType === "audio/wave") {
    if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") throw new Error("OCI object format mismatch: expected WAV RIFF/WAVE signature");
    return "WAV";
  }
  if (contentType === "audio/mpeg") {
    if (!(ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) {
      throw new Error("OCI object format mismatch: expected MP3 frame or ID3 signature");
    }
    return "MP3";
  }
  throw new Error(`OCI object format verification is not supported for ${contentType}`);
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
  const checksumSha256 = res.headers.get("opc-content-sha256") || res.headers.get("opc-multipart-sha256");
  const checksumAlgorithm = res.headers.get("opc-multipart-sha256") ? "SHA256_MULTIPART" : "SHA256";
  if (!checksumSha256) throw new Error("OCI SHA-256 checksum is missing; upload must use opc-checksum-algorithm: SHA256");
  const format = await verifyObjectFormat(key, contentType);
  return {
    byteSize: contentLength,
    contentType,
    etag: res.headers.get("etag")?.replaceAll('"', "") ?? null,
    checksumSha256,
    checksumAlgorithm,
    format,
    formatVerified: true,
  };
}

async function pollWorkRequest(
  cfg: OciConfig,
  workRequestId: string,
  opts?: { propagationGracePeriodMs?: number; pollIntervalMs?: number },
) {
  const url = new URL(`/workRequests/${encodeURIComponent(workRequestId)}`, endpoint(cfg.region));
  const startTime = Date.now();
  const deadline = startTime + 45_000;
  const propagationGraceMs = opts?.propagationGracePeriodMs ?? 10_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 1_000;
  let lastStatus = "unknown";

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const headers = signHeaders({ cfg, method: "GET", url });
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(Math.min(8_000, Math.max(1, remainingMs))),
      });
    } catch {
      throw new Error(`OCI copy work-request lookup timed out (last status: ${lastStatus})`);
    }

    if (!res.ok) {
      if (res.status === 404) {
        lastStatus = "not_yet_visible (404)";
        const elapsed = Date.now() - startTime;
        if (elapsed >= propagationGraceMs) {
          throw new Error(`OCI copy work-request lookup failed (404) (last status: ${lastStatus})`);
        }
      } else {
        throw new Error(`OCI copy work-request lookup failed (${res.status}) (last status: ${lastStatus})`);
      }
    } else {
      const body = (await res.json()) as { status?: string };
      lastStatus = body.status || "unknown";
      if (lastStatus === "SUCCEEDED") return;
      if (lastStatus === "FAILED" || lastStatus === "CANCELED") {
        throw new Error(`OCI object copy ${lastStatus.toLowerCase()}`);
      }
    }

    const remainingAfterPoll = deadline - Date.now();
    if (remainingAfterPoll > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remainingAfterPoll)));
    }
  }
  throw new Error(`OCI object copy did not complete within 45 seconds (last status: ${lastStatus})`);
}

/** Copy a verified upload into an immutable destination key. */
export async function sealVerifiedObject(
  sourceKey: string,
  destinationKey: string,
  expectedEtag: string,
  pollOpts?: { propagationGracePeriodMs?: number; pollIntervalMs?: number },
  expectedChecksumSha256?: string,
) {
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
  if (workRequestId) await pollWorkRequest(cfg, workRequestId, pollOpts);
  const sealed = await verifyObject(destinationKey);
  if (expectedChecksumSha256 && sealed.checksumSha256 !== expectedChecksumSha256) {
    throw new Error("Verified copy checksum differs from the uploaded object");
  }
  return sealed;
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
