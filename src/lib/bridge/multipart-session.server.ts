import { createHmac, timingSafeEqual } from "node:crypto";
import { bridgeEnv } from "./env.ts";
import { multipartTargetAllowed } from "./multipart-upload.ts";

type MultipartSessionClaims = {
  version: 1;
  actorUserId: string;
  assetId: string;
  objectKey: string;
  uploadId: string;
  partBaseUrl: string;
  expiresAt: number;
};

type ExpectedSession = {
  actorUserId: string;
  assetId: string;
  objectKey: string;
};

function signingSecret(): Buffer {
  const value = bridgeEnv.uploadSessionSecret();
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("BRIDGE_UPLOAD_SESSION_SECRET must contain at least 32 bytes");
  }
  return Buffer.from(value, "utf8");
}

export function assertMultipartSessionSigningReady() {
  // Validate before opening a remote OCI multipart upload.
  signingSecret();
}

function encode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest();
}

export function signMultipartSession(
  claims: Omit<MultipartSessionClaims, "version">,
): string {
  const region = bridgeEnv.ociRegion();
  if (!region || !multipartTargetAllowed(claims.partBaseUrl, region, claims.objectKey, claims.uploadId)) {
    throw new Error("OCI multipart session target is invalid");
  }
  if (
    !claims.actorUserId ||
    !claims.assetId ||
    !claims.objectKey ||
    !claims.uploadId ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt <= Date.now()
  ) {
    throw new Error("OCI multipart session claims are invalid");
  }
  const payload = encode(JSON.stringify({ version: 1, ...claims }));
  return `${payload}.${encode(signature(payload))}`;
}

export function verifyMultipartSession(
  token: string,
  expected: ExpectedSession,
): MultipartSessionClaims {
  if (token.length > 12_000) throw new Error("Multipart session token is invalid");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Multipart session token is invalid");
  }
  const [payload, encodedSignature] = parts;
  const actual = Buffer.from(encodedSignature, "base64url");
  const wanted = signature(payload);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    throw new Error("Multipart session signature is invalid");
  }

  let claims: MultipartSessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MultipartSessionClaims;
  } catch {
    throw new Error("Multipart session payload is invalid");
  }
  const region = bridgeEnv.ociRegion();
  if (
    claims.version !== 1 ||
    claims.actorUserId !== expected.actorUserId ||
    claims.assetId !== expected.assetId ||
    claims.objectKey !== expected.objectKey ||
    !claims.uploadId ||
    !claims.partBaseUrl ||
    !Number.isSafeInteger(claims.expiresAt) ||
    claims.expiresAt <= Date.now() ||
    !region ||
    !multipartTargetAllowed(claims.partBaseUrl, region, expected.objectKey, claims.uploadId)
  ) {
    throw new Error("Multipart session is expired or does not match this asset");
  }
  return claims;
}
