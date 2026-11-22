import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";

export const DEFAULT_BRIDGE_SITE_CONTENT = {
  heroTitle: "One bridge from content to market.",
  heroBody: "The professional workspace for preparing, protecting, licensing and delivering film and television.",
  workflowHeading: "From upload to delivery.",
  audienceHeading: "Built for the media business.",
  finalCtaHeading: "Ready to move your content forward?",
  carouselSlides: [] as Array<{ imageUrl: string; alt: string; caption: string }>,
} as const;

const contentSchema = z.object({
  heroTitle: z.string().trim().min(1).max(120),
  heroBody: z.string().trim().min(1).max(280),
  workflowHeading: z.string().trim().min(1).max(100),
  audienceHeading: z.string().trim().min(1).max(100),
  finalCtaHeading: z.string().trim().min(1).max(120),
});

export const homepageSlideSchema = z.object({
  imageUrl: z.string().trim().url().max(2048).refine((value) => value.startsWith("https://"), "Use a secure HTTPS image URL"),
  alt: z.string().trim().min(5).max(160),
  caption: z.string().trim().max(120),
});

const slidesSchema = z.array(homepageSlideSchema).max(5);

type SiteRow = {
  hero_title: string;
  hero_body: string;
  workflow_heading: string;
  audience_heading: string;
  final_cta_heading: string;
  carousel_slides?: Array<{ imageUrl?: string; alt?: string; caption?: string }> | null;
  updated_at: string | Date;
};

function mapRow(row: SiteRow) {
  return {
    heroTitle: row.hero_title,
    heroBody: row.hero_body,
    workflowHeading: row.workflow_heading,
    audienceHeading: row.audience_heading,
    finalCtaHeading: row.final_cta_heading,
    carouselSlides: Array.isArray(row.carousel_slides) ? row.carousel_slides.filter((slide) => typeof slide.imageUrl === "string" && slide.imageUrl.startsWith("https://") && typeof slide.alt === "string").slice(0, 5).map((slide) => ({ imageUrl: slide.imageUrl!, alt: slide.alt!, caption: typeof slide.caption === "string" ? slide.caption : "" })) : [],
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export const getPublicSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<SiteRow>`
    select hero_title, hero_body, workflow_heading, audience_heading,
           final_cta_heading, to_jsonb(bridge_site_content)->'carousel_slides' as carousel_slides, updated_at
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
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      throw new Error("Admin access required");
    }
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

export const updateHomepageCarousel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ slides: slidesSchema }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Only the designated Super Admin can manage homepage carousel images");
    }
    const sql = await getSql();
    const rows = await sql<SiteRow>`
      insert into bridge_site_content (
        content_key, hero_title, hero_body, workflow_heading, audience_heading,
        final_cta_heading, carousel_slides, updated_by, updated_at
      ) values (
        'homepage', ${DEFAULT_BRIDGE_SITE_CONTENT.heroTitle}, ${DEFAULT_BRIDGE_SITE_CONTENT.heroBody},
        ${DEFAULT_BRIDGE_SITE_CONTENT.workflowHeading}, ${DEFAULT_BRIDGE_SITE_CONTENT.audienceHeading},
        ${DEFAULT_BRIDGE_SITE_CONTENT.finalCtaHeading}, ${JSON.stringify(data.slides)}::jsonb,
        ${context.userId}::uuid, now()
      )
      on conflict (content_key) do update set
        carousel_slides = excluded.carousel_slides,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning hero_title, hero_body, workflow_heading, audience_heading,
                final_cta_heading, carousel_slides, updated_at
    `;
    await writeAudit({
      actorUserId: context.userId,
      action: "cms.homepage_carousel_updated",
      entityType: "bridge_site_content",
      entityId: "homepage",
      metadata: { slideCount: data.slides.length },
    });
    return mapRow(rows[0]);
  });
