import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { bridgeEnv } from "@/lib/bridge/env";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { assertNotDevUser } from "@/lib/bridge/guards";

const PURPOSE = "logo_background_conversion";
const AMOUNT_PAISE = 100;

function razorpayKeys() {
  const keyId = bridgeEnv.razorpayKeyId();
  const keySecret = bridgeEnv.razorpayKeySecret();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  return { keyId, keySecret };
}

async function razorpayFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { keyId, keySecret } = razorpayKeys();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error("Razorpay request failed");
  return response.json() as Promise<T>;
}

function validSignature(orderId: string, paymentId: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const createLogoConversionOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ idempotencyKey: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator account required");
    }
    const { keyId } = razorpayKeys();
    const sql = await getSql();
    const existing = await sql<{
      id: string; provider_order_id: string | null; amount_paise: number; status: string;
    }>`
      select id, provider_order_id, amount_paise, status
      from bridge_payments
      where user_id = ${actor.userId} and purpose = ${PURPOSE} and idempotency_key = ${data.idempotencyKey}
      limit 1
    `;
    if (existing[0]?.provider_order_id) {
      return { orderId: existing[0].provider_order_id, amountPaise: existing[0].amount_paise, currency: "INR", keyId };
    }
    if (existing[0]) throw new Error("An order with this request key is still being prepared. Please retry with a new request.");

    const order = await razorpayFetch<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: AMOUNT_PAISE,
        currency: "INR",
        receipt: `logo-${randomBytes(10).toString("hex")}`,
        notes: { purpose: PURPOSE, userId: actor.userId },
      }),
    });
    if (order.amount !== AMOUNT_PAISE || order.currency !== "INR") throw new Error("Razorpay order amount mismatch");
    const paymentRecordId = randomBytes(16).toString("hex");
    const inserted = await sql<{ id: string }>`
      insert into bridge_payments
        (id, user_id, title_id, purpose, provider, provider_order_id, amount_paise, currency, status, idempotency_key)
      values
        (${paymentRecordId}, ${actor.userId}, null, ${PURPOSE}, 'razorpay', ${order.id},
         ${AMOUNT_PAISE}, 'INR', 'created', ${data.idempotencyKey})
      on conflict (user_id, purpose, idempotency_key) do nothing
      returning id
    `;
    if (!inserted[0]) throw new Error("An order already exists for this request. Please retry from the tool.");
    return { orderId: order.id, amountPaise: AMOUNT_PAISE, currency: "INR", keyId };
  });

export const verifyLogoConversionPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    orderId: z.string().min(8).max(80),
    paymentId: z.string().min(8).max(80),
    signature: z.string().min(32).max(128),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const { keySecret } = razorpayKeys();
    if (!validSignature(data.orderId, data.paymentId, data.signature, keySecret)) {
      throw new Error("Invalid payment signature");
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; amount_paise: number; currency: string; status: string }>`
      select id, amount_paise, currency, status
      from bridge_payments
      where user_id = ${actor.userId} and purpose = ${PURPOSE} and provider_order_id = ${data.orderId}
      limit 1
    `;
    const record = rows[0];
    if (!record || record.amount_paise !== AMOUNT_PAISE || record.currency !== "INR") {
      throw new Error("Payment order not found or amount mismatch");
    }
    const payment = await razorpayFetch<{
      id: string; order_id: string; amount: number; currency: string; status: string;
    }>(`/payments/${encodeURIComponent(data.paymentId)}`);
    if (payment.id !== data.paymentId || payment.order_id !== data.orderId ||
        payment.amount !== AMOUNT_PAISE || payment.currency !== "INR" || payment.status !== "captured") {
      throw new Error("Payment is not captured or does not match this order");
    }
    await sql`
      update bridge_payments
      set status = 'captured', provider_payment_id = ${data.paymentId}, verified_at = now()
      where id = ${record.id} and user_id = ${actor.userId} and purpose = ${PURPOSE}
    `;
    return { verified: true, receiptId: record.id };
  });
