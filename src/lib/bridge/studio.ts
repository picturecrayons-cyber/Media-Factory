import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "./session";
import { assertNotDevUser } from "./guards";
import { integrationStatus } from "./env";
import { countPipeline, formatInrPaise } from "./studio-metrics";
import type { TitleStatus } from "./types";

export const getStudioOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    if (actor.accountType !== "studio" && !actor.internalRole) {
      throw new Error("Studio desk only");
    }
    const sql = await getSql();
    const orgId = actor.organizationId;
    const titles = orgId
      ? await sql<{
          id: string;
          slug: string;
          name: string;
          name_ml: string | null;
          year: number | null;
          status: string;
          licensing_fee_paise: number;
          updated_at: string | Date;
        }>`
          select id, slug, name, name_ml, year, status, licensing_fee_paise, updated_at
          from bridge_titles
          where owner_user_id = ${actor.userId} or organization_id = ${orgId}
          order by updated_at desc limit 200
        `
      : await sql<{
          id: string;
          slug: string;
          name: string;
          name_ml: string | null;
          year: number | null;
          status: string;
          licensing_fee_paise: number;
          updated_at: string | Date;
        }>`
          select id, slug, name, name_ml, year, status, licensing_fee_paise, updated_at
          from bridge_titles where owner_user_id = ${actor.userId}
          order by updated_at desc limit 200
        `;

    const paid = orgId
      ? await sql<{ n: number; sum: number | null }>`
          select count(*)::int as n, coalesce(sum(p.amount_paise), 0)::bigint as sum
          from bridge_payments p
          join bridge_titles t on t.id = p.title_id
          where p.status = 'captured'
            and (t.owner_user_id = ${actor.userId} or t.organization_id = ${orgId})
        `
      : await sql<{ n: number; sum: number | null }>`
          select count(*)::int as n, coalesce(sum(p.amount_paise), 0)::bigint as sum
          from bridge_payments p
          join bridge_titles t on t.id = p.title_id
          where p.status = 'captured' and t.owner_user_id = ${actor.userId}
        `;
    const capturedCount = Number(paid[0]?.n ?? 0);
    const capturedPaise = Number(paid[0]?.sum ?? 0);

    let dealsOpen = 0;
    try {
      const deals = orgId
        ? await sql<{ n: number }>`
            select count(*)::int as n from bridge_deals d
            join bridge_titles t on t.id = d.title_id
            where d.status <> 'closed'
              and (t.owner_user_id = ${actor.userId} or t.organization_id = ${orgId})
          `
        : await sql<{ n: number }>`
            select count(*)::int as n from bridge_deals d
            join bridge_titles t on t.id = d.title_id
            where t.owner_user_id = ${actor.userId} and d.status <> 'closed'
          `;
      dealsOpen = Number(deals[0]?.n ?? 0);
    } catch {
      dealsOpen = 0;
    }

    const pipeline = countPipeline(titles.map((t) => ({ status: t.status as TitleStatus })));
    const integrations = integrationStatus();
    return {
      organizationName: actor.organizationName,
      pipeline,
      titleCount: titles.length,
      inReview: pipeline.filter((c) => c.id === "review" || c.id === "verified").reduce((n, c) => n + c.count, 0),
      licensed: pipeline.find((c) => c.id === "licensed")?.count ?? 0,
      capturedCount,
      capturedPaise,
      capturedLabel: formatInrPaise(capturedPaise),
      dealsOpen,
      razorpay: integrations.razorpay,
      razorpayWebhook: integrations.razorpayWebhook,
      mail: integrations.mail,
      s3: integrations.s3,
      loop: integrations.loop,
      titles: titles.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        nameMl: t.name_ml,
        year: t.year,
        status: t.status as TitleStatus,
        licensingFeePaise: Number(t.licensing_fee_paise ?? 0),
        updatedAt: t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at),
      })),
    };
  });

export const listStudioRights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    const orgId = actor.organizationId;
    const rows = orgId
      ? await sql<{
          title_id: string;
          name: string;
          territories: string;
          rights_type: string;
          media_type: string;
          start_date: string | null;
          end_date: string | null;
          exclusive: boolean;
          chain_of_title_status: string;
          approved_at: string | Date | null;
        }>`
          select t.id as title_id, t.name, r.territories, r.rights_type, r.media_type,
                 r.start_date, r.end_date, r.exclusive, r.chain_of_title_status, r.approved_at
          from bridge_titles t
          left join bridge_title_rights r on r.title_id = t.id
          where t.owner_user_id = ${actor.userId} or t.organization_id = ${orgId}
          order by t.updated_at desc limit 200
        `
      : await sql<{
          title_id: string;
          name: string;
          territories: string;
          rights_type: string;
          media_type: string;
          start_date: string | null;
          end_date: string | null;
          exclusive: boolean;
          chain_of_title_status: string;
          approved_at: string | Date | null;
        }>`
          select t.id as title_id, t.name, r.territories, r.rights_type, r.media_type,
                 r.start_date, r.end_date, r.exclusive, r.chain_of_title_status, r.approved_at
          from bridge_titles t
          left join bridge_title_rights r on r.title_id = t.id
          where t.owner_user_id = ${actor.userId}
          order by t.updated_at desc limit 200
        `;
    return {
      rows: rows.map((r) => ({
        titleId: r.title_id,
        name: r.name,
        territories: r.territories || "",
        rightsType: r.rights_type || "",
        mediaType: r.media_type || "",
        startDate: r.start_date,
        endDate: r.end_date,
        exclusive: !!r.exclusive,
        chainOfTitleStatus: r.chain_of_title_status || "unverified",
        approvedAt: r.approved_at
          ? r.approved_at instanceof Date
            ? r.approved_at.toISOString()
            : String(r.approved_at)
          : null,
      })),
    };
  });
