import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { bridgeEnv } from "./env";
import { paymentVerifyBody, verifyRazorpaySignature } from "./razorpay-crypto";
import { requireVerifiedActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";
import { assertBuyerPublishable } from "./buyer-visibility";
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
    package_id: string | null;
    deal_id: string | null;
  }>`
    select id, user_id, title_id, package_id, deal_id, amount_paise, status, currency, provider_payment_id
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

  if (payment.deal_id) {
    const deals = await sql<{
      id: string; title_id: string; buyer_user_id: string; status: string;
      term_start: string | Date; term_end: string | Date; contract_reference: string | null;
    }>`
      select id, title_id, buyer_user_id, status, term_start, term_end, contract_reference
      from public.bridge_license_deals
      where id = ${payment.deal_id}
      limit 1
    `;
    const deal = deals[0];
    if (!deal || deal.title_id !== payment.title_id || deal.buyer_user_id !== payment.user_id ||
        !["ACCEPTED", "PAYMENT_PENDING", "LICENSED"].includes(deal.status) || !deal.contract_reference) {
      throw new Error("Payment is not linked to an accepted licensing deal");
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(deal.term_start).getTime() > today.getTime() || new Date(deal.term_end).getTime() < today.getTime()) {
      throw new Error("The licensing deal is outside its term");
    }
    await sql`
      insert into public.bridge_deal_entitlements (deal_id, title_id, buyer_user_id, payment_id)
      values (${deal.id}, ${payment.title_id}, ${payment.user_id}, ${payment.id})
      on conflict (deal_id, buyer_user_id) do nothing
    `;
    await sql`
      update public.bridge_license_deals
      set status = 'LICENSED', licensed_at = coalesce(licensed_at, now()), updated_at = now()
      where id = ${deal.id} and status in ('ACCEPTED', 'PAYMENT_PENDING', 'LICENSED')
    `;
    await writeAudit({
      actorUserId: opts.actorUserId ?? payment.user_id,
      action: "licensing.deal_payment_captured",
      entityType: "bridge_license_deal",
      entityId: deal.id,
      metadata: { titleId: payment.title_id, paymentId: payment.id, amountPaise: payment.amount_paise, currency: payment.currency },
    });
    return { paymentId: payment.id, entitled: true, titleId: payment.title_id, dealId: deal.id };
  }

  if (payment.package_id) {
    const pkg = await sql<{ id: string; title_id: string; status: string; delivery_status: string }>`
      select id, title_id, status, delivery_status
      from bridge_license_packages
      where id = ${payment.package_id} and title_id = ${payment.title_id}
      limit 1
    `;
    if (!pkg[0]) throw new Error("License package not found");
    await sql`
      insert into bridge_package_entitlements (package_id, title_id, buyer_user_id, payment_id)
      values (${pkg[0].id}, ${payment.title_id}, ${payment.user_id}, ${payment.id})
      on conflict (package_id, buyer_user_id) do nothing
    `;
    await sql`
      update bridge_license_packages
      set status = 'LICENSED', buyer_user_id = ${payment.user_id}, payment_id = ${payment.id}, updated_at = now()
      where id = ${pkg[0].id}
    `;
    await writeAudit({
      actorUserId: opts.actorUserId ?? payment.user_id,
      action: "licensing.language_package_licensed",
      entityType: "bridge_license_package",
      entityId: pkg[0].id,
      metadata: { titleId: payment.title_id, paymentId: payment.id },
    });
    return { paymentId: payment.id, entitled: true, titleId: payment.title_id, packageId: pkg[0].id };
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
    await requireVerifiedActor(context.userId);
    const { keyId } = requireRazorpayKeys();
    return { keyId };
  });

export const createLicenseOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      titleId: z.string().min(8),
      dealId: z.string().uuid().optional(),
      packageId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(8).max(80),
    }).refine((value) => !(value.dealId && value.packageId), {
      message: "Choose either an accepted deal or a language package",
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "payment.create_order");
    const title = await loadTitle(data.titleId);
    if (!title || (!canReadTitle(actor, title) && actor.accountType !== "buyer")) throw new Error("Not found");
    await assertBuyerPublishable(title.id);
    const sql = await getSql();
    if (title.status !== "LIVE_FOR_BUYERS" && title.status !== "IN_NEGOTIATION" && title.status !== "LICENSED" && title.status !== "DELIVERED") {
      throw new Error("Title is not open for a new license order");
    }
    let amountPaise = title.licensingFeePaise;
    if (data.dealId) {
      const deal = await sql<{
        id: string; title_id: string; buyer_user_id: string; agreed_fee_paise: number;
        currency: string; status: string; term_start: string | Date; term_end: string | Date;
      }>`
        select id, title_id, buyer_user_id, agreed_fee_paise, currency, status, term_start, term_end
        from public.bridge_license_deals
        where id = ${data.dealId}
        limit 1
      `;
      const acceptedDeal = deal[0];
      if (!acceptedDeal || acceptedDeal.status !== "ACCEPTED" ||
          acceptedDeal.title_id !== title.id || acceptedDeal.buyer_user_id !== actor.userId ||
          acceptedDeal.currency !== "INR") {
        throw new Error("An accepted licensing deal for this buyer and title is required");
      }
      const termStart = new Date(acceptedDeal.term_start).getTime();
      const termEnd = new Date(acceptedDeal.term_end).getTime();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (termEnd < today.getTime() || termStart > today.getTime()) {
        throw new Error("The accepted deal is outside its license term");
      }
      amountPaise = Number(acceptedDeal.agreed_fee_paise);
    } else if (data.packageId) {
      const pkg = await sql<{ id: string; title_id: string; price_paise: number; status: string; buyer_user_id: string | null }>`
        select id, title_id, price_paise, status, buyer_user_id
        from bridge_license_packages
        where id = ${data.packageId} and title_id = ${title.id}
        limit 1
      `;
      if (!pkg[0] || pkg[0].status !== "IN_NEGOTIATION" || pkg[0].buyer_user_id !== actor.userId) {
        throw new Error("A buyer-assigned language package in negotiation is required");
      }
      amountPaise = Number(pkg[0].price_paise);
    } else {
      throw new Error("An accepted licensing deal is required before title checkout");
    }
    if (amountPaise <= 0) throw new Error("Licensing price is not set");
    const { keyId } = requireRazorpayKeys();
    const existing = await sql<{
      id: string;
      provider_order_id: string | null;
      amount_paise: number;
      title_id: string | null;
      status: string;
      package_id: string | null;
      deal_id: string | null;
    }>`
      select id, provider_order_id, amount_paise, title_id, package_id, deal_id, status
      from bridge_payments
      where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
      limit 1
    `;
    if (existing[0] && (existing[0].title_id !== title.id ||
        (existing[0].package_id ?? null) !== (data.packageId ?? null) ||
        (existing[0].deal_id ?? null) !== (data.dealId ?? null))) {
      throw new Error("Idempotency key belongs to another title, package, or deal");
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
        amount: amountPaise,
        currency: "INR",
        receipt: data.idempotencyKey.slice(0, 40),
        notes: { titleId: title.id, packageId: data.packageId ?? "", userId: actor.userId },
      }),
    });

    const id = randomBytes(16).toString("hex");
    const inserted = await sql<{ id: string }>`
      insert into bridge_payments (
        id, user_id, title_id, package_id, deal_id, purpose, provider_order_id, amount_paise, currency, status, idempotency_key
      ) values (
        ${id}, ${actor.userId}, ${title.id}, ${data.packageId ?? null}, ${data.dealId ?? null}, ${"title_license"}, ${rz.id},
        ${amountPaise}, ${"INR"}, ${"created"}, ${data.idempotencyKey}
      )
      on conflict (user_id, purpose, idempotency_key) do nothing
      returning id
    `;
    if (!inserted[0]) {
      const winner = await sql<{ id: string; title_id: string | null; package_id: string | null; deal_id: string | null; provider_order_id: string | null; amount_paise: number }>`
        select id, title_id, package_id, deal_id, provider_order_id, amount_paise from bridge_payments
        where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
        limit 1
      `;
      if (!winner[0]?.provider_order_id || winner[0].title_id !== title.id ||
          (winner[0].package_id ?? null) !== (data.packageId ?? null) ||
          (winner[0].deal_id ?? null) !== (data.dealId ?? null)) {
        throw new Error("Idempotency key belongs to another title/package/deal or order is unavailable");
      }
      return {
        orderId: winner[0].provider_order_id,
        amountPaise: winner[0].amount_paise,
        currency: "INR",
        keyId,
        paymentRecordId: winner[0].id,
      };
    }

    if (data.packageId) {
      await sql`
        update bridge_license_packages
        set status = 'IN_NEGOTIATION', buyer_user_id = ${actor.userId}, updated_at = now()
        where id = ${data.packageId} and title_id = ${title.id}
      `;
    } else if (title.status === "LIVE_FOR_BUYERS") {
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
      metadata: { titleId: title.id, packageId: data.packageId ?? null, dealId: data.dealId ?? null, amountPaise, currency: "INR" },
    });

    return {
      orderId: rz.id,
      amountPaise,
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
    const actor = await requireVerifiedActor(context.userId);
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
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "entitlement.read_own");
    const sql = await getSql();
    try {
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
    } catch (error) {
      console.error("buyer entitlements unavailable", error);
      return { entitlements: [] };
    }
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
  const claimToken = randomBytes(16).toString("hex");
  const claim = await sql<{ event_id: string }>`
    update bridge_webhook_events
    set status = ${"processing"},
        processing_started_at = now(),
        processing_token = ${claimToken},
        attempts = attempts + 1
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
    const completed = await sql<{ event_id: string }>`
      update bridge_webhook_events
      set status = ${"processed"},
          processed_at = now(),
          processing_started_at = null,
          processing_token = null
      where event_id = ${eventId} and processing_token = ${claimToken}
      returning event_id
    `;
    if (!completed[0]) throw new Error("Webhook processing lease was superseded");
    return { duplicate: false, eventName };
  } catch (error) {
    await sql`
      update bridge_webhook_events
      set status = ${"failed"}, processing_started_at = null, processing_token = null
      where event_id = ${eventId} and processing_token = ${claimToken}
    `;
    throw error;
  }
}
