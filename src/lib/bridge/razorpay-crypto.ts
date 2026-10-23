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


/** Fail closed on Vercel Preview unless the deployment explicitly uses Razorpay Test Mode. */
export function assertRazorpayEnvironment(opts: {
  deploymentEnvironment: string | undefined;
  testMode: string | undefined;
  keyId: string;
}): void {
  if (opts.deploymentEnvironment?.toLowerCase() !== "preview") return;
  if (opts.testMode !== "true") {
    throw new Error("Razorpay Preview blocked: RAZORPAY_TEST_MODE must be true");
  }
  if (!opts.keyId.startsWith("rzp_test_")) {
    throw new Error("Razorpay Preview blocked: a Test Mode key ID is required");
  }
}
