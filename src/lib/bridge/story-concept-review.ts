import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { assertPermission, canOperateOnTitle } from "./rbac";
import { loadTitle } from "./titles";
import { writeAudit } from "./audit";

type ReviewEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string | Date;
};
type ReviewNotification = {
  id: string;
  message: string;
  read_at: string | Date | null;
  created_at: string | Date;
};

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function recordStoryConceptReviewUpdate(opts: {
  conceptId: string;
  titleId: string;
  actorUserId: string | null;
  fromStatus: string | null;
  toStatus: string;
  note: string;
  recipientUserId?: string | null;
}) {
  const sql = await getSql();
  try {
    await sql.query(
      "insert into bridge_story_concept_review_events(id,concept_id,title_id,from_status,to_status,actor_user_id,note) values($1,$2::uuid,$3,$4,$5,$6,$7)",
      [randomUUID(), opts.conceptId, opts.titleId, opts.fromStatus, opts.toStatus, opts.actorUserId, opts.note],
    );
    if (opts.recipientUserId) {
      await sql.query(
        "insert into bridge_story_concept_notifications(id,concept_id,title_id,recipient_user_id,message) values($1,$2::uuid,$3,$4,$5)",
        [randomUUID(), opts.conceptId, opts.titleId, opts.recipientUserId, opts.note],
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/bridge_story_concept_review_events|bridge_story_concept_notifications|does not exist|undefined_table/i.test(message)) throw error;
  }
}

export async function notifyStoryConceptSuperAdmin(opts: {
  conceptId: string;
  titleId: string;
  message: string;
}) {
  const sql = await getSql();
  try {
    const admins = await sql.query<{ user_id: string }>(
      "select user_id from bridge_profiles where internal_role='super_admin' limit 1",
      [],
    );
    if (!admins[0]) return;
    await sql.query(
      "insert into bridge_story_concept_notifications(id,concept_id,title_id,recipient_user_id,message) values($1,$2::uuid,$3,$4,$5)",
      [randomUUID(), opts.conceptId, opts.titleId, admins[0].user_id, opts.message],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/bridge_story_concept_notifications|does not exist|undefined_table/i.test(message)) throw error;
  }
}

export const getMyStoryConceptReview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Creator or Studio account required");
    }
    const sql = await getSql();
    const rows = await sql.query<{
      id: string;
      title_id: string;
      title_name: string;
      owner_user_id: string;
      logline: string | null;
      synopsis: string | null;
      treatment_url: string | null;
      screenplay_url: string | null;
      genre: string[] | null;
      estimated_budget_range: string | null;
      target_platforms: string[] | null;
      curation_status: string;
      admin_notes: string | null;
      introduced_to_buyers_at: string | Date | null;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      "select c.*,t.name as title_name,t.owner_user_id from bridge_story_concept_submissions c join bridge_titles t on t.id=c.title_id where c.id=$1::uuid and (t.owner_user_id=$2 or ($3::uuid is not null and t.owner_organization_id=$3::uuid)) limit 1",
      [data.id, actor.userId, actor.accountType === "studio" ? actor.organizationId ?? null : null],
    );
    const concept = rows[0];
    if (!concept) throw new Error("Story Concept not found");
    let events: ReviewEvent[] = [];
    let notifications: ReviewNotification[] = [];
    try {
      events = await sql.query<ReviewEvent>(
        "select id,from_status,to_status,note,created_at from bridge_story_concept_review_events where concept_id=$1::uuid order by created_at asc",
        [concept.id],
      );
      notifications = await sql.query<ReviewNotification>(
        "select id,message,read_at,created_at from bridge_story_concept_notifications where concept_id=$1::uuid and recipient_user_id=$2 order by created_at desc limit 30",
        [concept.id, actor.userId],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/bridge_story_concept_review_events|bridge_story_concept_notifications|does not exist|undefined_table/i.test(message)) throw error;
    }
    return {
      concept: {
        id: concept.id,
        titleId: concept.title_id,
        titleName: concept.title_name,
        logline: concept.logline,
        synopsis: concept.synopsis,
        treatmentUrl: concept.treatment_url,
        screenplayUrl: concept.screenplay_url,
        genre: concept.genre ?? [],
        estimatedBudgetRange: concept.estimated_budget_range,
        targetPlatforms: concept.target_platforms ?? [],
        status: concept.curation_status,
        adminNotes: concept.admin_notes,
        introducedToBuyersAt: iso(concept.introduced_to_buyers_at),
        createdAt: iso(concept.created_at),
        updatedAt: iso(concept.updated_at),
        reviewEvents: events.map((event) => ({
          id: event.id,
          fromStatus: event.from_status,
          toStatus: event.to_status,
          note: event.note,
          createdAt: iso(event.created_at),
        })),
      },
      notifications: notifications.map((item) => ({
        id: item.id,
        message: item.message,
        readAt: iso(item.read_at),
        createdAt: iso(item.created_at),
      })),
    };
  });

export const resubmitStoryConceptCorrections = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().uuid(),
    logline: z.string().trim().min(10).max(500),
    synopsis: z.string().trim().min(40).max(8000),
    treatmentUrl: z.string().url().max(500).optional().or(z.literal("")),
    screenplayUrl: z.string().url().max(500).optional().or(z.literal("")),
    genre: z.array(z.string().min(1).max(40)).max(12).default([]),
    estimatedBudgetRange: z.string().max(80).optional(),
    targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) {
      throw new Error("Only the owning Creator or Studio account can resubmit corrections");
    }
    assertPermission(actor, "title.update_own");
    const sql = await getSql();
    const rows = await sql.query<{ title_id: string; curation_status: string; admin_notes: string | null }>(
      "select title_id,curation_status,admin_notes from bridge_story_concept_submissions where id=$1::uuid limit 1",
      [data.id],
    );
    const current = rows[0];
    if (!current || current.curation_status !== "UNDER_REVIEW" || !current.admin_notes?.trim()) {
      throw new Error("There is no active Super Admin correction request for this Story Concept");
    }
    const title = await loadTitle(current.title_id);
    if (!title || !canOperateOnTitle(actor, title, "title.update_own")) throw new Error("Story Concept not found");
    const updated = await sql.query<{ id: string }>(
      "update bridge_story_concept_submissions set logline=$1,synopsis=$2,treatment_url=$3,screenplay_url=$4,genre=$5::text[],estimated_budget_range=$6,target_platforms=$7::text[],curation_status='PENDING',admin_notes=null,updated_at=now() where id=$8::uuid and curation_status='UNDER_REVIEW' returning id",
      [data.logline, data.synopsis, data.treatmentUrl || null, data.screenplayUrl || null, data.genre, data.estimatedBudgetRange ?? null, data.targetPlatforms, data.id],
    );
    if (!updated[0]) throw new Error("Story Concept changed before correction resubmission");
    const note = "Creator / Studio resubmitted the requested corrections. The concept is back in the review queue.";
    await recordStoryConceptReviewUpdate({
      conceptId: data.id,
      titleId: current.title_id,
      actorUserId: actor.userId,
      fromStatus: "UNDER_REVIEW",
      toStatus: "PENDING",
      note,
      recipientUserId: actor.userId,
    });
    await notifyStoryConceptSuperAdmin({
      conceptId: data.id,
      titleId: current.title_id,
      message: "A Story / Concept correction has been resubmitted and is ready for review.",
    });
    await writeAudit({
      actorUserId: actor.userId,
      action: "story_concept.correction_resubmitted",
      entityType: "bridge_story_concept_submission",
      entityId: data.id,
      metadata: { titleId: current.title_id },
    });
    return { id: data.id, status: "PENDING" as const };
  });

export const markStoryConceptNotificationRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole || !["independent_creator", "studio"].includes(actor.accountType)) throw new Error("Creator or Studio account required");
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>(
      "update bridge_story_concept_notifications set read_at=now() where id=$1::uuid and recipient_user_id=$2 returning id",
      [data.id, actor.userId],
    );
    if (!rows[0]) throw new Error("Notification not found");
    return { id: rows[0].id, read: true };
  });
