import { createServerFn } from "@tanstack/react-start";
import { isSuperAdminReadOnlySurface } from "./super-admin-readonly";
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
  }>`
    select id, user_id, title_id, package_id, amount_paise, status, currency, provider_payment_id
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
      packageId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(8).max(80),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (isSuperAdminReadOnlySurface(actor.internalRole ?? undefined, "buyer")) {
      throw new Error("Super admin is read-only on the buyer surface");
    }
    assertPermission(actor, "payment.create_order");
    const title = await loadTitle(data.titleId);
    if (!title || (!canReadTitle(actor, title) && actor.accountType !== "buyer")) throw new Error("Not found");
    await assertBuyerPublishable(title.id);
    const sql = await getSql();
    if (title.status !== "LIVE_FOR_BUYERS" && title.status !== "IN_NEGOTIATION" && title.status !== "LICENSED" && title.status !== "DELIVERED") {
      throw new Error("Title is not open for a new license order");
    }
    let amountPaise = title.licensingFeePaise;
    if (data.packageId) {
      const pkg = await sql<{ id: string; title_id: string; price_paise: number; status: string }>`
        select id, title_id, price_paise, status
        from bridge_license_packages
        where id = ${data.packageId} and title_id = ${title.id}
        limit 1
      `;
      if (!pkg[0] || !["READY", "IN_NEGOTIATION"].includes(pkg[0].status)) throw new Error("License package is not available");
      amountPaise = Number(pkg[0].price_paise);
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
    }>`
      select id, provider_order_id, amount_paise, title_id, package_id, status
      from bridge_payments
      where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
      limit 1
    `;
    if (existing[0] && (existing[0].title_id !== title.id || (existing[0].package_id ?? null) !== (data.packageId ?? null))) {
      throw new Error("Idempotency key belongs to another title or package");
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
        id, user_id, title_id, package_id, purpose, provider_order_id, amount_paise, currency, status, idempotency_key
      ) values (
        ${id}, ${actor.userId}, ${title.id}, ${data.packageId ?? null}, ${"title_license"}, ${rz.id},
        ${amountPaise}, ${"INR"}, ${"created"}, ${data.idempotencyKey}
      )
      on conflict (user_id, purpose, idempotency_key) do nothing
      returning id
    `;
    if (!inserted[0]) {
      const winner = await sql<{ id: string; title_id: string | null; package_id: string | null; provider_order_id: string | null; amount_paise: number }>`
        select id, title_id, package_id, provider_order_id, amount_paise from bridge_payments
        where user_id = ${actor.userId} and purpose = ${"title_license"} and idempotency_key = ${data.idempotencyKey}
        limit 1
      `;
      if (!winner[0]?.provider_order_id || winner[0].title_id !== title.id || (winner[0].package_id ?? null) !== (data.packageId ?? null)) {
        throw new Error("Idempotency key belongs to another title/package or order is unavailable");
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
      metadata: { titleId: title.id, packageId: data.packageId ?? null },
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
    if (isSuperAdminReadOnlySurface(actor.internalRole ?? undefined, "buyer")) {
      throw new Error("Super admin is read-only on the buyer surface");
    }
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


async function getPaidServiceRate(serviceCode: string) {
  const sql = await getSql();
  const rows = await sql.unsafe(
    "select c.code,c.active as service_active,r.base_price_paise,r.active as rate_active,r.effective_from,r.effective_to from bridge_service_catalog c left join lateral (select base_price_paise,active,effective_from,effective_to from bridge_service_rates where service_code=c.code order by version desc limit 1) r on true where c.code=$1 limit 1",
    [serviceCode],
  ) as Array<{ code: string; service_active: boolean; base_price_paise: number | null; rate_active: boolean | null; effective_from: string | Date | null; effective_to: string | Date | null }>;
  const row = rows[0];
  const now = Date.now();
  const start = row?.effective_from ? new Date(row.effective_from).getTime() : 0;
  const end = row?.effective_to ? new Date(row.effective_to).getTime() : Number.POSITIVE_INFINITY;
  const rateCurrent = Boolean(row?.rate_active) && start <= now && end > now;
  return {
    exists: Boolean(row),
    serviceActive: Boolean(row?.service_active),
    rateActive: rateCurrent,
    amountPaise: row?.base_price_paise == null ? null : Number(row.base_price_paise),
    available: Boolean(row?.service_active && rateCurrent && Number(row?.base_price_paise ?? 0) > 0),
  };
}

async function createPaidServiceOrder(opts: {
  userId: string;
  purpose: "STORY_CONCEPT_NETWORK_SUBMISSION" | "DIT_AGENT";
  serviceCode: string;
  idempotencyKey: string;
}) {
  const sql = await getSql();
  const rate = await getPaidServiceRate(opts.serviceCode);
  if (!rate.available || !rate.amountPaise) {
    throw new Error(rate.exists
      ? "Paid feature is disabled or has no active rate; no Razorpay order was created"
      : "Paid feature has no configured service/rate; no Razorpay order was created");
  }
  const { keyId } = requireRazorpayKeys();
  const existing = await sql.unsafe(
    "select id,provider_order_id,amount_paise,purpose from bridge_payments where user_id=$1 and purpose=$2 and idempotency_key=$3 limit 1",
    [opts.userId, opts.purpose, opts.idempotencyKey],
  ) as Array<{ id: string; provider_order_id: string | null; amount_paise: number; purpose: string }>;
  if (existing[0]?.provider_order_id) {
    if (existing[0].purpose !== opts.purpose || Number(existing[0].amount_paise) !== rate.amountPaise) {
      throw new Error("Idempotency key belongs to another paid feature or price");
    }
    return { orderId: existing[0].provider_order_id, amountPaise: Number(existing[0].amount_paise), currency: "INR", keyId, paymentRecordId: existing[0].id };
  }
  const rz = await razorpayFetch<{ id: string; amount: number; currency: string }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: rate.amountPaise,
      currency: "INR",
      receipt: opts.idempotencyKey.slice(0, 40),
      notes: { purpose: opts.purpose, serviceCode: opts.serviceCode, userId: opts.userId },
    }),
  });
  const paymentId = randomBytes(16).toString("hex");
  const inserted = await sql.unsafe(
    "insert into bridge_payments (id,user_id,title_id,package_id,purpose,provider_order_id,amount_paise,currency,status,idempotency_key) values ($1,$2,null,null,$3,$4,$5,'INR','created',$6) on conflict (user_id,purpose,idempotency_key) do nothing returning id",
    [paymentId, opts.userId, opts.purpose, rz.id, rate.amountPaise, opts.idempotencyKey],
  ) as Array<{ id: string }>;
  if (!inserted[0]) {
    const winner = await sql.unsafe(
      "select id,provider_order_id,amount_paise from bridge_payments where user_id=$1 and purpose=$2 and idempotency_key=$3 limit 1",
      [opts.userId, opts.purpose, opts.idempotencyKey],
    ) as Array<{ id: string; provider_order_id: string | null; amount_paise: number }>;
    if (!winner[0]?.provider_order_id || Number(winner[0].amount_paise) !== rate.amountPaise) {
      throw new Error("Paid feature order idempotency conflict");
    }
    return { orderId: winner[0].provider_order_id, amountPaise: Number(winner[0].amount_paise), currency: "INR", keyId, paymentRecordId: winner[0].id };
  }
  await writeAudit({
    actorUserId: opts.userId, action: "payment.order_created",
    entityType: "bridge_payment", entityId: paymentId,
    metadata: { purpose: opts.purpose, serviceCode: opts.serviceCode, amountPaise: rate.amountPaise },
  });
  return { orderId: rz.id, amountPaise: rate.amountPaise, currency: "INR", keyId, paymentRecordId: paymentId };
}

async function verifyPaidServiceOrder(opts: {
  actorUserId: string;
  purpose: "STORY_CONCEPT_NETWORK_SUBMISSION" | "DIT_AGENT";
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const sql = await getSql();
  const rows = await sql.unsafe(
    "select id,user_id,purpose,status from bridge_payments where provider_order_id=$1 limit 1",
    [opts.orderId],
  ) as Array<{ id: string; user_id: string; purpose: string; status: string }>;
  if (!rows[0] || rows[0].user_id !== opts.actorUserId || rows[0].purpose !== opts.purpose) {
    throw new Error("Razorpay order does not belong to this paid feature or account");
  }
  const { keySecret } = requireRazorpayKeys();
  const ok = verifyRazorpaySignature({
    secret: keySecret,
    body: paymentVerifyBody(opts.orderId, opts.paymentId),
    signature: opts.signature,
  });
  if (!ok) throw new Error("Invalid payment signature");
  return grantFromCapturedPayment({ orderId: opts.orderId, paymentId: opts.paymentId, actorUserId: opts.actorUserId });
}

export const getPaidFeaturePricing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (!actor.internalRole && actor.accountType !== "independent_creator" && actor.accountType !== "studio") {
      throw new Error("Creator or Studio account required");
    }
    const storyConcept = await getPaidServiceRate("STORY_CONCEPT_NETWORK_SUBMISSION");
    const ditAgent = actor.accountType === "studio" ? await getPaidServiceRate("DIT_AGENT") : null;
    return { storyConcept, ditAgent };
  });

export const createStoryConceptOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ idempotencyKey: z.string().min(8).max(80) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    assertPermission(actor, "story_concept.create");
    assertPermission(actor, "payment.create_story_concept_order");
    return createPaidServiceOrder({ userId: actor.userId, purpose: "STORY_CONCEPT_NETWORK_SUBMISSION", serviceCode: "STORY_CONCEPT_NETWORK_SUBMISSION", idempotencyKey: data.idempotencyKey });
  });

export const verifyStoryConceptPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.string().min(4), paymentId: z.string().min(4), signature: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    assertPermission(actor, "payment.create_story_concept_order");
    return verifyPaidServiceOrder({ actorUserId: actor.userId, purpose: "STORY_CONCEPT_NETWORK_SUBMISSION", ...data });
  });

export const createDitAgentOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ idempotencyKey: z.string().min(8).max(80) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio") throw new Error("Studio account required");
    assertPermission(actor, "dit.agent");
    assertPermission(actor, "payment.create_dit_agent_order");
    return createPaidServiceOrder({ userId: actor.userId, purpose: "DIT_AGENT", serviceCode: "DIT_AGENT", idempotencyKey: data.idempotencyKey });
  });

export const verifyDitAgentPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.string().min(4), paymentId: z.string().min(4), signature: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "studio") throw new Error("Studio account required");
    assertPermission(actor, "payment.create_dit_agent_order");
    return verifyPaidServiceOrder({ actorUserId: actor.userId, purpose: "DIT_AGENT", ...data });
  });


export const listOwnStoryConceptPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") throw new Error("Creator or Studio account required");
    const sql = await getSql();
    const rows = await sql.unsafe(
      "select p.id::text,p.amount_paise,p.currency,p.verified_at,p.created_at from bridge_payments p where p.user_id=$1 and p.purpose='STORY_CONCEPT_NETWORK_SUBMISSION' and p.status='captured' and p.verified_at is not null and not exists(select 1 from bridge_story_concept_submissions sc where sc.payment_id=p.id) order by p.verified_at desc limit 20",
      [actor.userId],
    );
    return { payments: JSON.parse(JSON.stringify(rows)) };
  });
