import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";

export const DEFAULT_BRIDGE_SITE_CONTENT = {
  heroTitle: "One bridge from content to market.",
  heroBody: "The professional workspace for preparing, protecting, licensing and delivering film and television.",
  workflowHeading: "From upload to delivery.",
  audienceHeading: "Built for the media business.",
  finalCtaHeading: "Ready to move your content forward?",
} as const;

const contentSchema = z.object({
  heroTitle: z.string().trim().min(1).max(120),
  heroBody: z.string().trim().min(1).max(280),
  workflowHeading: z.string().trim().min(1).max(100),
  audienceHeading: z.string().trim().min(1).max(100),
  finalCtaHeading: z.string().trim().min(1).max(120),
});

type SiteRow = {
  hero_title: string;
  hero_body: string;
  workflow_heading: string;
  audience_heading: string;
  final_cta_heading: string;
  updated_at: string | Date;
};

function mapRow(row: SiteRow) {
  return {
    heroTitle: row.hero_title,
    heroBody: row.hero_body,
    workflowHeading: row.workflow_heading,
    audienceHeading: row.audience_heading,
    finalCtaHeading: row.final_cta_heading,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export const getPublicSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<SiteRow>`
    select hero_title, hero_body, workflow_heading, audience_heading,
           final_cta_heading, updated_at
    from bridge_site_content
    where content_key = 'homepage'
    limit 1
  `;
  return rows[0] ? mapRow(rows[0]) : { ...DEFAULT_BRIDGE_SITE_CONTENT, updatedAt: null };
});

export const updateHomepageContent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(contentSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "users.invite_internal");
    const sql = await getSql();
    const rows = await sql<SiteRow>`
      insert into bridge_site_content (
        content_key, hero_title, hero_body, workflow_heading, audience_heading,
        final_cta_heading, updated_by, updated_at
      ) values (
        'homepage', ${data.heroTitle}, ${data.heroBody}, ${data.workflowHeading},
        ${data.audienceHeading}, ${data.finalCtaHeading}, ${context.userId}::uuid, now()
      )
      on conflict (content_key) do update set
        hero_title = excluded.hero_title,
        hero_body = excluded.hero_body,
        workflow_heading = excluded.workflow_heading,
        audience_heading = excluded.audience_heading,
        final_cta_heading = excluded.final_cta_heading,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning hero_title, hero_body, workflow_heading, audience_heading,
                final_cta_heading, updated_at
    `;
    await writeAudit({
      actorUserId: context.userId,
      action: "cms.homepage_updated",
      entityType: "bridge_site_content",
      entityId: "homepage",
    });
    return mapRow(rows[0]);
  });
