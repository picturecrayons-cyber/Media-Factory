import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { LoopSubscription } from "./types";
import { bridgeEnv } from "@/lib/bridge/env";

export const LOOP_PLANS = [
  {
    planKey: "svod_monthly",
    name: "Loop Monthly Pass",
    priceInr: 149,
    description: "Unlimited streaming of all SVOD titles, full HD playback, ad-free experience",
    durationDays: 30,
  },
  {
    planKey: "svod_annual",
    name: "Loop Annual Pass",
    priceInr: 999,
    description: "Year-long unlimited streaming, early premiere access, offline viewing priority",
    durationDays: 365,
  },
];

/**
 * Get active subscription status for consumer
 */
export const getConsumerSubscription = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<LoopSubscription> => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      plan_key: string;
      status: string;
      started_at: string | Date;
      expires_at: string | Date;
    }>`
      select id, plan_key, status, started_at, expires_at
      from loop_subscriptions
      where user_id = ${context.userId}
        and status = 'active'
        and expires_at > now()
      order by expires_at desc
      limit 1
    `;

    if (!rows[0]) {
      return {
        planKey: "none",
        name: "No Active Pass",
        status: "none",
        priceInr: 0,
        startedAt: null,
        expiresAt: null,
      };
    }

    const row = rows[0];
    const plan = LOOP_PLANS.find((p) => p.planKey === row.plan_key) || LOOP_PLANS[0];

    return {
      planKey: row.plan_key,
      name: plan.name,
      status: "active",
      priceInr: plan.priceInr,
      startedAt: new Date(row.started_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  });

/**
 * Activate a consumer subscription plan (Loop Pass)
 */
export const subscribeToLoopPass = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ planKey: z.enum(["svod_monthly", "svod_annual"]) }))
  .handler(async () => {
    throw new Error("Direct Loop Pass activation is disabled. A verified Razorpay subscription checkout is required before access can be granted.");
  });

/**
 * Create a payable TVOD rental order. No entitlement is granted here.
 * The verified Razorpay capture webhook performs the 48-hour fulfillment.
 */
export const rentTvodMovie = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const keyId = bridgeEnv.razorpayKeyId();
    const keySecret = bridgeEnv.razorpayKeySecret();
    if (!keyId || !keySecret) throw new Error("Loop payments are not configured");
    const sql = await getSql();
    const ready = await sql<{ ready: boolean }>`select public.loop_rental_fulfillment_ready() as ready`;
    if (!ready[0]?.ready) throw new Error("TVOD fulfillment is not enabled; payment checkout is blocked");

    const titles = await sql<{ id: string; title: string; tvod_rental_price: number }>`
      select l.id,l.title,l.tvod_rental_price
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id=l.id and p.bridge_title_id=l.bridge_title_id
      where l.id=${data.loopTitleId} and l.status='approved' and l.listed=true and l.published=true
        and l.access_tier='TVOD' and p.authorization_status='authorized' and p.revoked_at is null
        and p.window_start <= now() and p.window_end > now()
        and 'WORLDWIDE'=any(p.territories) and 'TVOD'=any(p.exploitation_models)
      limit 1
    `;
    const title = titles[0];
    if (!title) throw new Error("This title is not currently available for TVOD rental");
    const amountPaise = Math.round(Number(title.tvod_rental_price) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error("TVOD rental price is not configured");

    const receipt = `loop-${randomUUID()}`;
    const notes = {
      surface: "loop",
      product: "crayons_loop_tvod",
      accessType: "TVOD_RENTAL",
      titleId: title.id,
      userId: context.userId,
    };
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
    });
    if (!response.ok) throw new Error("Razorpay could not create the Loop rental order");
    const order = await response.json() as { id?: string; amount?: number; currency?: string };
    if (!order.id || order.amount !== amountPaise || order.currency !== "INR") {
      throw new Error("Razorpay returned an invalid Loop rental order");
    }

    await sql`
      insert into loop_tvod_orders(provider_order_id,user_id,loop_title_id,amount_paise,currency,status)
      values (${order.id},${context.userId}::uuid,${title.id}::uuid,${amountPaise},'INR','pending')
    `;
    return {
      ok: true,
      orderId: order.id,
      amountPaise,
      currency: "INR" as const,
      keyId,
      title: title.title,
      validHours: 48,
    };
  });
