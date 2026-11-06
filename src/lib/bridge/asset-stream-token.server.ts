import { createHmac, timingSafeEqual } from "node:crypto";

export type AssetStreamClaims = { version: 1; actorUserId: string; assetId: string; expiresAt: number };

function secret() {
  const value = process.env.BRIDGE_ASSET_STREAM_SECRET?.trim();
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("BRIDGE_ASSET_STREAM_SECRET must contain at least 32 bytes");
  }
  return value;
}
function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest();
}
export function createAssetStreamToken(actorUserId: string, assetId: string, ttlSeconds = 60) {
  if (!actorUserId || !assetId || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error("Asset stream token claims are invalid");
  }
  const payload = Buffer.from(JSON.stringify({version:1,actorUserId,assetId,expiresAt:Date.now()+ttlSeconds*1000})).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function verifyAssetStreamToken(token: string, expectedAssetId: string, expectedActorUserId?: string) {
  if (!token || token.length > 4096) throw new Error("Asset stream token is invalid");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Asset stream token is invalid");
  const actual = Buffer.from(parts[1], "base64url");
  const wanted = signature(parts[0]);
  if (actual.length !== wanted.length || !timingSafeEqual(actual,wanted)) throw new Error("Asset stream token signature is invalid");
  let claims: AssetStreamClaims;
  try { claims = JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as AssetStreamClaims; }
  catch { throw new Error("Asset stream token payload is invalid"); }
  if (claims.version !== 1 || claims.assetId !== expectedAssetId || (expectedActorUserId !== undefined && claims.actorUserId !== expectedActorUserId) ||
      !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= Date.now()) {
    throw new Error("Asset stream token is expired or not bound to this authenticated actor and asset");
  }
  return claims;
}
