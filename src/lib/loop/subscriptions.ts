import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { LoopSubscription } from "./types";

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
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const plan = LOOP_PLANS.find((p) => p.planKey === data.planKey)!;
    const durationDays = plan.durationDays;

    await sql`
      insert into loop_subscriptions (
        user_id, plan_key, status, started_at, expires_at
      ) values (
        ${context.userId}, ${data.planKey}, 'active', now(), now() + (${durationDays} || ' days')::interval
      )
    `;

    return { ok: true, planName: plan.name };
  });

/**
 * Rent a TVOD title for 48 hours
 */
export const rentTvodMovie = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();

    // Check title exists
    const titles = await sql<{ id: string; title: string; tvod_rental_price: number }>`
      select id, title, tvod_rental_price from loop_titles where id = ${data.loopTitleId} limit 1
    `;
    const title = titles[0];
    if (!title) throw new Error("Title not found");

    // 48 hours rental window
    await sql`
      insert into loop_entitlements (
        user_id, loop_title_id, access_type, expires_at
      ) values (
        ${context.userId}, ${data.loopTitleId}, 'TVOD_RENTAL', now() + interval '48 hours'
      )
    `;

    return { ok: true, title: title.title, validHours: 48 };
  });
