import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpaySignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyRazorpaySignature(opts: {
  secret: string;
  body: string;
  signature: string | null | undefined;
}): boolean {
  if (!opts.signature) return false;
  const expected = razorpaySignature(opts.secret, opts.body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(opts.signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function paymentVerifyBody(orderId: string, paymentId: string): string {
  return `${orderId}|${paymentId}`;
}
