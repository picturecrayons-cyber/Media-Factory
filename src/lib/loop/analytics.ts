import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "@/lib/bridge/rbac";
import { assertNotDevUser } from "@/lib/bridge/guards";

import { loopAnalyticsEventInput } from "./analytics-contract";
export { loopAnalyticsEventInput } from "./analytics-contract";


/**
 * Records observational telemetry for an authenticated viewer only.
 * Client-reported watch intervals are bounded and are never payment evidence.
 */
export const recordLoopAnalyticsEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(loopAnalyticsEventInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const sql = await getSql();

    const eligible = await sql<{
      bridge_title_id: string;
      loop_title_id: string;
    }>`
      select p.bridge_title_id, p.loop_title_id
      from bridge_loop_publications p
      join loop_titles l on l.id = p.loop_title_id
      where p.loop_title_id = ${data.loopTitleId}
        and p.authorization_status = 'authorized'
        and l.published = true
        and l.listed = true
        and l.status = 'approved'
        and (p.window_start is null or p.window_start <= now())
        and (p.window_end is null or p.window_end >= now())
      limit 1
    `;
    const publication = eligible[0];
    if (!publication) throw new Error("Title is not authorized for Loop analytics");

    // Playback events require server-verified access for this exact Loop title.
    // Views can be recorded without playback entitlement; playback cannot.
    if (data.eventType !== "TITLE_VIEW") {
      const access = await sql<{ access_tier: string }>`
        select access_tier from loop_titles where id = ${publication.loop_title_id} limit 1
      `;
      const tier = access[0]?.access_tier;
      let canPlay = tier === "FREE";
      if (tier === "SVOD") {
        const subscriptions = await sql<{ id: number }>`
          select id from loop_subscriptions
          where user_id = ${context.userId} and status = 'active'
            and (expires_at is null or expires_at > now())
          limit 1
        `;
        canPlay = subscriptions.length > 0;
      } else if (tier === "TVOD") {
        const entitlements = await sql<{ id: number }>`
          select id from loop_entitlements
          where user_id = ${context.userId}
            and loop_title_id = ${publication.loop_title_id}
            and (expires_at is null or expires_at > now())
          limit 1
        `;
        canPlay = entitlements.length > 0;
      }
      if (!canPlay) throw new Error("Playback entitlement required for this title");
    }

    // Identity comes from the authenticated Loop session. No client-supplied user,
    // price, order, payment, or arbitrary metadata is accepted.
    const inserted = await sql<{ event_id: string }>`
      insert into bridge_loop_analytics_events
        (event_id, user_id, bridge_title_id, loop_title_id, session_id, event_type, watched_seconds)
      values (
        ${data.eventId}, ${context.userId}, ${publication.bridge_title_id},
        ${publication.loop_title_id}, ${data.sessionId}, ${data.eventType},
        ${data.eventType === "PLAYBACK_PROGRESS" ? data.watchedSeconds : 0}
      )
      on conflict (event_id) do nothing
      returning event_id
    `;
    return { recorded: inserted.length === 1, duplicate: inserted.length === 0 };
  });

const reportInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  bridgeTitleId: z.string().min(1).max(160).optional(),
}).refine((value) => Date.parse(value.to) > Date.parse(value.from), {
  message: "The report end must be after its start",
  path: ["to"],
});

/** Finance-only aggregate. No buyer-level identities are returned. */
export const getLoopAnalyticsReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(reportInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.read");
    const sql = await getSql();

    const playback = await sql<{
      event_count: number;
      unique_viewers: number;
      title_views: number;
      playback_starts: number;
      playback_completions: number;
      watched_seconds: number;
    }>`
      select
        count(*)::int as event_count,
        count(distinct user_id)::int as unique_viewers,
        count(*) filter (where event_type = 'TITLE_VIEW')::int as title_views,
        count(*) filter (where event_type = 'PLAYBACK_START')::int as playback_starts,
        count(*) filter (where event_type = 'PLAYBACK_COMPLETE')::int as playback_completions,
        coalesce(sum(watched_seconds), 0)::int as watched_seconds
      from bridge_loop_analytics_events
      where received_at >= ${data.from}::timestamptz
        and received_at < ${data.to}::timestamptz
        and (${data.bridgeTitleId ?? null}::text is null or bridge_title_id = ${data.bridgeTitleId ?? null})
    `;

    const payments = await sql<{
      captured_count: number;
      gross_paise: number;
      refunded_paise: number;
      provider_fee_paise: number | null;
      provider_tax_paise: number | null;
    }>`
      select
        count(*) filter (where status = 'captured')::int as captured_count,
        coalesce(sum(amount_paise) filter (where status = 'captured'), 0)::bigint as gross_paise,
        coalesce(sum(refunded_amount_paise), 0)::bigint as refunded_paise,
        coalesce(sum(provider_fee_paise) filter (where status = 'captured'), 0)::bigint as provider_fee_paise,
        coalesce(sum(provider_tax_paise) filter (where status = 'captured'), 0)::bigint as provider_tax_paise
      from bridge_payments
      where created_at >= ${data.from}::timestamptz
        and created_at < ${data.to}::timestamptz
        and (${data.bridgeTitleId ?? null}::text is null or title_id = ${data.bridgeTitleId ?? null})
    `;

    const watch = playback[0];
    const sales = payments[0];
    return {
      period: { from: data.from, to: data.to, timezone: "UTC" },
      titleFilter: data.bridgeTitleId ?? null,
      playback: {
        events: Number(watch?.event_count ?? 0),
        uniqueAuthenticatedViewers: Number(watch?.unique_viewers ?? 0),
        titleViews: Number(watch?.title_views ?? 0),
        playbackStarts: Number(watch?.playback_starts ?? 0),
        playbackCompletions: Number(watch?.playback_completions ?? 0),
        observedWatchMinutes: Math.floor(Number(watch?.watched_seconds ?? 0) / 60),
        source: "client-reported telemetry; observational only",
      },
      bridgePaymentRecords: {
        capturedPaymentCount: Number(sales?.captured_count ?? 0),
        capturedGrossPaise: Number(sales?.gross_paise ?? 0),
        refundedPaise: Number(sales?.refunded_paise ?? 0),
        providerFeePaise: sales?.provider_fee_paise == null ? null : Number(sales.provider_fee_paise),
        providerTaxPaise: sales?.provider_tax_paise == null ? null : Number(sales.provider_tax_paise),
        note: "Bridge payment records only; not certified as Loop TVOD sales",
      },
      loopTvodReconciliation: {
        status: "NOT AVAILABLE — Loop TVOD order-to-Razorpay reconciliation is not connected",
        settlementStatus: "NOT AVAILABLE — settlement reconciliation is not connected",
      },
    };
  });
