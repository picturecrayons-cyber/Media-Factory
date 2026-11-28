import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

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
type SitePayload = z.infer<typeof contentSchema>;
type SiteRow = {
  hero_title: string;
  hero_body: string;
  workflow_heading: string;
  audience_heading: string;
  final_cta_heading: string;
  published_payload?: SitePayload | null;
  draft_payload?: SitePayload | null;
  workflow_state?: "DRAFT" | "APPROVED" | "PUBLISHED";
  draft_version?: number;
  published_version?: number;
  approved_by?: string | null;
  updated_at: string | Date;
};

function mapPayload(payload: SitePayload, updatedAt: string | Date | null, version?: number) {
  return {
    ...payload,
    updatedAt: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt ? String(updatedAt) : null,
    ...(version === undefined ? {} : { version }),
  };
}
function isCmsAdmin(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export const getPublicSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<SiteRow>`
    select hero_title, hero_body, workflow_heading, audience_heading, final_cta_heading,
           published_payload, updated_at
    from bridge_site_content
    where content_key = 'homepage'
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_BRIDGE_SITE_CONTENT, updatedAt: null };
  const payload = row.published_payload ?? {
    heroTitle: row.hero_title,
    heroBody: row.hero_body,
    workflowHeading: row.workflow_heading,
    audienceHeading: row.audience_heading,
    finalCtaHeading: row.final_cta_heading,
  };
  return mapPayload(payload, row.updated_at);
});

export const getHomepageDraft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (!isCmsAdmin(actor.internalRole)) throw new Error("Admin access required");
    const sql = await getSql();
    const rows = await sql<SiteRow>`
      select draft_payload, workflow_state, draft_version, published_version, approved_by, updated_at
      from bridge_site_content where content_key = 'homepage' limit 1
    `;
    const row = rows[0];
    return {
      draft: row?.draft_payload ?? null,
      workflowState: row?.workflow_state ?? "PUBLISHED",
      draftVersion: row?.draft_version ?? 0,
      publishedVersion: row?.published_version ?? 0,
      approved: Boolean(row?.approved_by),
      updatedAt: row?.updated_at instanceof Date ? row.updated_at.toISOString() : row?.updated_at ? String(row.updated_at) : null,
    };
  });

export const saveHomepageDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(contentSchema)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (!isCmsAdmin(actor.internalRole)) throw new Error("Admin access required");
    const sql = await getSql();
    const payload = JSON.stringify(data);
    const rows = await sql<{ draft_version: number }>`
      update bridge_site_content
      set draft_payload = ${payload}::jsonb,
          workflow_state = 'DRAFT',
          draft_version = draft_version + 1,
          approved_by = null,
          approved_at = null,
          updated_by = ${context.userId}::uuid,
          updated_at = now()
      where content_key = 'homepage'
      returning draft_version
    `;
    if (!rows[0]) throw new Error("Homepage CMS record is unavailable; no content was changed.");
    await sql`
      insert into bridge_site_content_versions (content_key, version_number, payload, status, created_by)
      values ('homepage', ${rows[0].draft_version}, ${payload}::jsonb, 'DRAFT', ${context.userId}::uuid)
    `;
    await writeAudit({ actorUserId: context.userId, action: "cms.homepage_draft_saved", entityType: "bridge_site_content", entityId: "homepage" });
    return { draft: data, draftVersion: rows[0].draft_version, workflowState: "DRAFT" as const };
  });

export const approveHomepageDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin approval required");
    const sql = await getSql();
    const rows = await sql<{ draft_version: number }>`
      update bridge_site_content
      set workflow_state = 'APPROVED', approved_by = ${context.userId}::uuid, approved_at = now()
      where content_key = 'homepage' and draft_payload is not null and workflow_state = 'DRAFT'
      returning draft_version
    `;
    if (!rows[0]) throw new Error("Save a homepage draft before approval.");
    await sql`
      update bridge_site_content_versions set status = 'APPROVED', approved_by = ${context.userId}::uuid, approved_at = now()
      where content_key = 'homepage' and version_number = ${rows[0].draft_version} and status = 'DRAFT'
    `;
    await writeAudit({ actorUserId: context.userId, action: "cms.homepage_draft_approved", entityType: "bridge_site_content", entityId: "homepage" });
    return { workflowState: "APPROVED" as const, draftVersion: rows[0].draft_version };
  });

export const publishHomepageDraft = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin publishing authorization required");
    const sql = await getSql();
    const rows = await sql<{ draft_version: number; draft_payload: SitePayload }>`
      update bridge_site_content
      set published_payload = draft_payload,
          hero_title = draft_payload->>'heroTitle',
          hero_body = draft_payload->>'heroBody',
          workflow_heading = draft_payload->>'workflowHeading',
          audience_heading = draft_payload->>'audienceHeading',
          final_cta_heading = draft_payload->>'finalCtaHeading',
          published_version = draft_version,
          workflow_state = 'PUBLISHED',
          published_by = ${context.userId}::uuid,
          published_at = now(),
          updated_by = ${context.userId}::uuid,
          updated_at = now()
      where content_key = 'homepage' and workflow_state = 'APPROVED' and approved_by is not null
      returning draft_version, draft_payload
    `;
    if (!rows[0]) throw new Error("Homepage draft must be approved before publishing.");
    await sql`
      update bridge_site_content_versions
      set status = 'SUPERSEDED'
      where content_key = 'homepage' and status = 'PUBLISHED'
    `;
    await sql`
      update bridge_site_content_versions
      set status = 'PUBLISHED', published_by = ${context.userId}::uuid, published_at = now()
      where content_key = 'homepage' and version_number = ${rows[0].draft_version}
    `;
    await writeAudit({ actorUserId: context.userId, action: "cms.homepage_published", entityType: "bridge_site_content", entityId: "homepage" });
    return { workflowState: "PUBLISHED" as const, publishedVersion: rows[0].draft_version };
  });


export const getHomepageVersions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (!isCmsAdmin(actor.internalRole)) throw new Error("Admin access required");
    const sql = await getSql();
    return await sql<{ version_number: number; status: string; created_at: string | Date; approved_at: string | Date | null; published_at: string | Date | null }>`
      select version_number, status, created_at, approved_at, published_at
      from bridge_site_content_versions
      where content_key = 'homepage'
      order by version_number desc
      limit 25
    `;
  });

export const restoreHomepageVersion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ version: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") throw new Error("Super Admin rollback authorization required");
    const sql = await getSql();
    const snapshots = await sql<{ payload: SitePayload }>`
      select payload from bridge_site_content_versions
      where content_key = 'homepage' and version_number = ${data.version}
      limit 1
    `;
    if (!snapshots[0]) throw new Error("Requested homepage version was not found.");
    const payload = JSON.stringify(snapshots[0].payload);
    const rows = await sql<{ draft_version: number }>`
      update bridge_site_content
      set draft_payload = ${payload}::jsonb,
          draft_version = draft_version + 1,
          workflow_state = 'DRAFT',
          approved_by = null,
          approved_at = null,
          updated_by = ${context.userId}::uuid,
          updated_at = now()
      where content_key = 'homepage'
      returning draft_version
    `;
    if (!rows[0]) throw new Error("Homepage CMS record is unavailable.");
    await sql`
      insert into bridge_site_content_versions (content_key, version_number, payload, status, created_by)
      values ('homepage', ${rows[0].draft_version}, ${payload}::jsonb, 'DRAFT', ${context.userId}::uuid)
    `;
    await writeAudit({ actorUserId: context.userId, action: "cms.homepage_version_restored_as_draft", entityType: "bridge_site_content", entityId: String(data.version) });
    return { restoredFromVersion: data.version, draftVersion: rows[0].draft_version, workflowState: "DRAFT" as const };
  });

// Backward-compatible export: saving now creates a draft and never publishes immediately.
export const updateHomepageContent = saveHomepageDraft;
