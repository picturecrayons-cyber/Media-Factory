import { createHmac, timingSafeEqual } from "node:crypto";
import { bridgeEnv } from "./env";

const MAX_CLOCK_SKEW_SECONDS = 60;

/** Verify a timestamped HMAC over the exact raw request body. */
export function verifyLoopPlaybackHandoffSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  nowSeconds?: number;
}) {
  const secret = bridgeEnv.loopPlaybackHandoffSecret();
  if (!secret || !input.timestamp || !input.signature) return false;
  if (!/^\d{10}$/.test(input.timestamp)) return false;
  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret)
    .update(input.timestamp + "." + input.rawBody, "utf8")
    .digest();
  let supplied: Buffer;
  try {
    if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
    supplied = Buffer.from(input.signature, "hex");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
