import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { bridgeEnv } from "./env";
import { paymentVerifyBody, verifyRazorpaySignature } from "./razorpay-crypto";
import { loadActor, requireActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";
import { isBuyerVisible } from "./lifecycle";
import { assertNotDevUser } from "./guards";

function requireRazorpayKeys() {
  const keyId = bridgeEnv.razorpayKeyId();
  const keySecret = bridgeEnv.razorpayKeySecret();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  return { keyId, keySecret };
}

async function razorpayFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { keyId, keySecret } = requireRazorpayKeys();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error("Razorpay request failed");
  return (await res.json()) as T;
}

type RzPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
};

export async function grantFromCapturedPayment(opts: {
  orderId: string;
  paymentId: string;
  actorUserId?: string | null;
}) {
  const captured = await razorpayFetch<RzPayment>(`/payments/${opts.paymentId}`);
  if (captured.status !== "captured") {
    throw new Error("Payment is not captured");
  }
  if (captured.order_id !== opts.orderId) {
    throw new Error("Payment does not match order");
  }
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    title_id: string | null;
    amount_paise: number;
    status: string;
    currency: string;
    provider_payment_id: string | null;
  }>`
    select id, user_id, title_id, amount_paise, status, currency, provider_payment_id
    from bridge_payments where provider_order_id = ${opts.orderId} limit 1
  `;
  const payment = rows[0];
  if (!payment) throw new Error("Unknown order");
  if (captured.amount !== payment.amount_paise || captured.currency !== payment.currency || payment.currency !== "INR") {
    throw new Error("Amount or currency mismatch");
  }
  if (payment.provider_payment_id && payment.provider_payment_id !== opts.paymentId) {
    throw new Error("Order already linked to another payment");
  }
  if (opts.actorUserId && opts.actorUserId !== payment.user_id) {
    throw new Error("Payment does not belong to this account");
  }

  await sql`
    update bridge_payments
    set status = ${"captured"},
        provider_payment_id = ${opts.paymentId},
        verified_at = now()
    where id = ${payment.id} and status <> 'captured'
  `;

  if (!payment.title_id) {
    return { paymentId: payment.id, entitled: false };
  }

  await sql`
    insert into bridge_entitlements (user_id, title_id, payment_id, access_type)
    values (${payment.user_id}, ${payment.title_id}, ${payment.id}, ${"license"})
    on conflict (user_id, title_id, access_type) do nothing
  `;

  const title = await loadTitle(payment.title_id);
  if (title && (title.status === "LIVE_FOR_BUYERS" || title.status === "IN_NEGOTIATION")) {
    await recordTransition({
      titleId: title.id,
      from: title.status,
      to: "LICENSED",
      actorUserId: opts.actorUserId ?? payment.user_id,
      note: "razorpay captured",
    });
  }

  await writeAudit({
    actorUserId: opts.actorUserId ?? payment.user_id,
    action: "payment.captured",
    entityType: "bridge_payment",
    entityId: payment.id,
    metadata: { titleId: payment.title_id },
  });

  return { paymentId: payment.id, entitled: true, titleId: payment.title_id };
}

export const getCheckoutConfig = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const { keyId } = requireRazorpayKeys();
    return { keyId };
  });

export const createLicenseOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      idempotencyKey: z.string().min(8).max(80),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    assertPermission(actor, "payment.create_order");
    const title = await loadTitle(data.titleId);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    if (!isBuyerVisible(title.status) && title.status !== "LIVE_FOR_BUYERS") {
      throw new Error("Title is not available for licensing");
    }
    if (title.status !== "LIVE_FOR_BUYERS" && title.status !== "IN_NEGOTIATION") {
      throw new Error("Title is not open for a new license order");
    }
    if (title.licensingFeePaise <= 0) {
      throw new Error("Licensing fee is not set");
    }
    const { keyId } = requireRazorpayKeys();
    const sql = await getSql();
    const existing = await sql<{
      id: string;
      provider_order_id: string | null;
      amount_paise: number;
      title_id: string | null;
      status: string;
    }>`
      select id, provider_order_id, amount_paise, title_id, status
      from bridge_payments
      where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
      limit 1
    `;
    if (existing[0] && existing[0].title_id !== title.id) {
      throw new Error("Idempotency key belongs to another title");
    }
    if (existing[0]?.provider_order_id) {
      return {
        orderId: existing[0].provider_order_id,
        amountPaise: existing[0].amount_paise,
        currency: "INR",
        keyId,
        paymentRecordId: existing[0].id,
      };
    }

    const rz = await razorpayFetch<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: title.licensingFeePaise,
        currency: "INR",
        receipt: data.idempotencyKey.slice(0, 40),
        notes: { titleId: title.id, userId: actor.userId },
      }),
    });

    const id = randomBytes(16).toString("hex");
    const inserted = await sql<{ id: string }>`
      insert into bridge_payments (
        id, user_id, title_id, purpose, provider_order_id, amount_paise, currency, status, idempotency_key
      ) values (
        ${id}, ${actor.userId}, ${title.id}, ${"title_license"}, ${rz.id},
        ${title.licensingFeePaise}, ${"INR"}, ${"created"}, ${data.idempotencyKey}
      )
      on conflict (user_id, purpose, idempotency_key) do nothing
      returning id
    `;
    if (!inserted[0]) {
      const winner = await sql<{ id: string; title_id: string | null; provider_order_id: string | null; amount_paise: number }>`
        select id, title_id, provider_order_id, amount_paise from bridge_payments
        where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
        limit 1
      `;
      if (!winner[0]?.provider_order_id || winner[0].title_id !== title.id) {
        throw new Error("Idempotency key belongs to another title or order is unavailable");
      }
      return {
        orderId: winner[0].provider_order_id,
        amountPaise: winner[0].amount_paise,
        currency: "INR",
        keyId,
        paymentRecordId: winner[0].id,
      };
    }

    if (title.status === "LIVE_FOR_BUYERS") {
      await recordTransition({
        titleId: title.id,
        from: "LIVE_FOR_BUYERS",
        to: "IN_NEGOTIATION",
        actorUserId: actor.userId,
        note: "license order opened",
      });
    }

    await writeAudit({
      actorUserId: actor.userId,
      action: "payment.order_created",
      entityType: "bridge_payment",
      entityId: id,
      metadata: { titleId: title.id },
    });

    return {
      orderId: rz.id,
      amountPaise: title.licensingFeePaise,
      currency: "INR",
      keyId,
      paymentRecordId: id,
    };
  });

export const verifyLicensePayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      orderId: z.string().min(4),
      paymentId: z.string().min(4),
      signature: z.string().min(8),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await loadActor(context.userId);
    if (!actor) throw new Error("Profile required");
    const { keySecret } = requireRazorpayKeys();
    const ok = verifyRazorpaySignature({
      secret: keySecret,
      body: paymentVerifyBody(data.orderId, data.paymentId),
      signature: data.signature,
    });
    if (!ok) throw new Error("Invalid payment signature");
    return grantFromCapturedPayment({
      orderId: data.orderId,
      paymentId: data.paymentId,
      actorUserId: actor.userId,
    });
  });

export const listOwnEntitlements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireActor(context.userId);
    assertPermission(actor, "entitlement.read_own");
    const sql = await getSql();
    const rows = await sql<{
      title_id: string;
      payment_id: string;
      access_type: string;
      created_at: string | Date;
    }>`
      select title_id, payment_id, access_type, created_at
      from bridge_entitlements where user_id = ${actor.userId}
      order by created_at desc
    `;
    return {
      entitlements: rows.map((r) => ({
        titleId: r.title_id,
        paymentId: r.payment_id,
        accessType: r.access_type,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    };
  });

export async function ingestRazorpayWebhook(rawBody: string, signature: string | null) {
  const secret = bridgeEnv.razorpayWebhookSecret();
  if (!secret) throw new Error("Razorpay webhook is not configured");
  const ok = verifyRazorpaySignature({ secret, body: rawBody, signature });
  if (!ok) throw new Error("Invalid webhook signature");
  const payload = JSON.parse(rawBody) as {
    event?: string;
    payload?: { payment?: { entity?: RzPayment & { notes?: Record<string, string> } } };
  };
  const eventName = payload.event ?? "unknown";
  const payment = payload.payload?.payment?.entity;
  const eventId =
    payment?.id && eventName ? `${eventName}:${payment.id}` : createHash("sha256").update(rawBody).digest("hex");
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  const sql = await getSql();
  await sql`
    insert into bridge_webhook_events (event_id, event_name, payload_hash, status)
    values (${eventId}, ${eventName}, ${payloadHash}, ${"received"})
    on conflict (event_id) do nothing
  `;
  const existing = await sql<{ status: string; payload_hash: string }>`
    select status, payload_hash from bridge_webhook_events where event_id = ${eventId}
  `;
  if (existing[0]?.payload_hash !== payloadHash) throw new Error("Webhook event ID collision");
  if (existing[0]?.status === "processed") return { duplicate: true };
  const claim = await sql<{ event_id: string }>`
    update bridge_webhook_events
    set status = ${"processing"}, processing_started_at = now(), attempts = attempts + 1
    where event_id = ${eventId}
      and (
        status in ('received', 'failed')
        or (status = 'processing' and processing_started_at < now() - interval '2 minutes')
      )
    returning event_id
  `;
  if (!claim[0]) throw new Error("Webhook event is already processing");
  try {
    if (eventName === "payment.captured" && payment?.id && payment.order_id) {
      await grantFromCapturedPayment({
        orderId: payment.order_id,
        paymentId: payment.id,
      });
    }
    await sql`
      update bridge_webhook_events
      set status = ${"processed"}, processed_at = now(), processing_started_at = null
      where event_id = ${eventId}
    `;
    return { duplicate: false, eventName };
  } catch (error) {
    await sql`
      update bridge_webhook_events
      set status = ${"failed"}, processing_started_at = null
      where event_id = ${eventId}
    `;
    throw error;
  }
}
