/**
 * Story / Concept submission – server functions (RPC).
 * Pattern matches titles.ts (not named *.server.ts).
 */

import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import {
  STORY_CONCEPT_ENABLED,
  CURATION_TRANSITIONS,
  type CurationStatus,
  type StoryConceptSubmission,
} from "./story-concept";

type ConceptRow = {
  id: string;
  title_id: string;
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
};

function asIso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapConcept(r: ConceptRow): StoryConceptSubmission {
  return {
    id: r.id,
    title_id: r.title_id,
    logline: r.logline,
    synopsis: r.synopsis,
    treatment_url: r.treatment_url,
    screenplay_url: r.screenplay_url,
    genre: r.genre ?? [],
    estimated_budget_range: r.estimated_budget_range,
    target_platforms: r.target_platforms ?? [],
    curation_status: r.curation_status as CurationStatus,
    admin_notes: r.admin_notes,
    introduced_to_buyers_at: asIso(r.introduced_to_buyers_at),
    created_at: asIso(r.created_at) ?? "",
    updated_at: asIso(r.updated_at) ?? "",
  };
}

const loadBridgeMail = createServerOnlyFn(() => import("./mail.server"));

async function notifyConceptOwner(sql: Awaited<ReturnType<typeof getSql>>, concept: ConceptRow) {
  const [profiles, titles] = await Promise.all([
    sql<{ email: string | null }>`
      select p.email from bridge_profiles p
      join bridge_titles t on t.owner_user_id = p.user_id
      where t.id = ${concept.title_id} limit 1
    `,
    sql<{ name: string }>`select name from bridge_titles where id = ${concept.title_id} limit 1`,
  ]);
  const email = profiles[0]?.email?.trim();
  if (!email) return;
  const titleName = titles[0]?.name ?? "your Story / Concept";
  const labels: Record<string, string> = {
    PENDING: "Pending review", UNDER_REVIEW: "In review", APPROVED: "Approved",
    REJECTED: "Rejected", INTRODUCED_TO_BUYERS: "Introduced to buyers",
  };
  const subject = `Crayons Bridge concept review update: ${titleName}`;
  const textBody = `The review status for ${titleName} is now: ${labels[concept.curation_status] ?? concept.curation_status}.${concept.admin_notes ? ` Reviewer feedback: ${concept.admin_notes}` : ""}\n\nOpen your Concept review: https://www.crayonspictures.in/title/${concept.title_id}`;
  const eventKey = `bridge-story-concept:${concept.id}:${asIso(concept.updated_at)}`;
  await sql`
    insert into bridge_notification_outbox (event_key, recipient_email, subject, text_body)
    values (${eventKey}, ${email}, ${subject}, ${textBody})
    on conflict (event_key) do nothing
  `;
  const claimed = await sql<{ id: string; recipient_email: string; subject: string; text_body: string }>`
    update bridge_notification_outbox
    set status = 'sending', attempts = attempts + 1, processing_started_at = now(), updated_at = now()
    where event_key = ${eventKey} and next_attempt_at <= now()
      and (status in ('pending','failed') or (status = 'sending' and processing_started_at < now() - interval '10 minutes'))
    returning id, recipient_email, subject, text_body
  `;
  const outbox = claimed[0];
  if (!outbox) return;
  try {
    const { sendTransactionalEmail } = await loadBridgeMail();
    const sent = await sendTransactionalEmail({
      to: outbox.recipient_email, subject: outbox.subject, text: outbox.text_body,
      category: "bridge_story_concept_review_updated",
    });
    await sql`
      update bridge_notification_outbox
      set status = 'sent', sent_at = now(), provider_message_id = ${sent.messageId ?? null},
          last_error = null, processing_started_at = null, updated_at = now()
      where id = ${outbox.id}::uuid
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "mail_delivery_failed";
    await sql`
      update bridge_notification_outbox
      set status = 'failed', last_error = ${message.slice(0, 500)},
          next_attempt_at = now() + make_interval(mins => least(60, greatest(1, power(2, least(attempts, 6))::int))),
          processing_started_at = null, updated_at = now()
      where id = ${outbox.id}::uuid
    `;
    console.warn("Bridge Story / Concept notification failed; retained in outbox", {
      conceptId: concept.id, error: message,
    });
  }
}

function slugify(name: string, id: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "concept"}-${id.slice(0, 6)}`;
}

function migrationHint(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /bridge_story_concept_submissions|submission_type|does not exist|undefined_column|undefined_table/i.test(
      msg,
    )
  ) {
    throw new Error(
      "Story/Concept tables are not installed yet. Apply migration 20261027_story_concept_submission.sql on Supabase, then retry.",
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

function requireCurationStaff(actor: { internalRole?: string | null }) {
  if (!actor.internalRole) throw new Error("Forbidden");
  // Align with rights/QC operators — not read-only viewers.
  assertPermission(actor as Parameters<typeof assertPermission>[0], "title.rights_review");
}

const createPayloadSchema = z.object({
  titleName: z.string().min(1).max(160),
  logline: z.string().min(10).max(500),
  synopsis: z.string().min(40).max(8000),
  genre: z.array(z.string().min(1).max(40)).max(12).default([]),
  estimatedBudgetRange: z.string().max(80).optional(),
  targetPlatforms: z.array(z.string().min(1).max(40)).max(12).default([]),
  treatmentUrl: z.string().url().max(500).optional().or(z.literal("")),
  screenplayUrl: z.string().url().max(500).optional().or(z.literal("")),
  language: z.string().min(2).max(40).default("Malayalam"),
});

export const createStoryConceptSubmission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createPayloadSchema)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    if (!STORY_CONCEPT_ENABLED) {
      throw new Error("Story / Concept submissions are not enabled yet.");
    }

    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, actor.internalRole ? "title.ingest_internal" : "title.create");

    const titleId = randomBytes(16).toString("hex");
    const slug = slugify(data.titleName, titleId);
    const sql = await getSql();

    try {
      await sql`
        insert into bridge_titles (
          id, slug, name, owner_user_id, owner_account_type, status,
          synopsis, language, content_type, owner_organization_id, submission_type
        ) values (
          ${titleId},
          ${slug},
          ${data.titleName},
          ${actor.userId},
          ${actor.accountType},
          ${"DRAFT"},
          ${data.synopsis},
          ${data.language},
          ${"OTHER"},
          ${actor.accountType === "studio" ? actor.organizationId ?? null : null},
          ${"story_concept"}
        )
      `;

      await sql`
        insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
        values (${titleId}, null, ${"DRAFT"}, ${actor.userId}, ${"story concept submission received"})
      `;

      const conceptRows = await sql<ConceptRow>`
        insert into bridge_story_concept_submissions (
          title_id, logline, synopsis, treatment_url, screenplay_url,
          genre, estimated_budget_range, target_platforms, curation_status
        ) values (
          ${titleId},
          ${data.logline},
          ${data.synopsis},
          ${data.treatmentUrl || null},
          ${data.screenplayUrl || null},
          ${data.genre},
          ${data.estimatedBudgetRange ?? null},
          ${data.targetPlatforms},
          ${"PENDING"}
        )
        returning *
      `;

      const concept = conceptRows[0];
      if (!concept) throw new Error("Story concept create failed");

      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.create",
        entityType: "bridge_story_concept_submission",
        entityId: concept.id,
        metadata: { titleId },
      });

      return {
        titleId,
        concept: mapConcept(concept),
      };
    } catch (err) {
      migrationHint(err);
    }
  });

export const listMyStoryConcepts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();

    try {
      const rows = await sql<ConceptRow & { title_name: string }>`
        select c.*, t.name as title_name
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where t.owner_user_id = ${actor.userId}
           or (
             t.owner_account_type = 'studio'
             and t.owner_organization_id is not null
             and t.owner_organization_id = ${actor.organizationId ?? null}
           )
        order by c.created_at desc
        limit 100
      `;

      return {
        concepts: rows.map((r) => ({
          ...mapConcept(r),
          titleName: r.title_name,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/bridge_story_concept_submissions|does not exist|undefined_table/i.test(msg)) {
        return { concepts: [] };
      }
      throw err;
    }
  });

export const listPendingStoryConcepts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    try {
      const rows = await sql<ConceptRow & { title_name: string; owner_user_id: string }>`
        select c.*, t.name as title_name, t.owner_user_id
        from bridge_story_concept_submissions c
        join bridge_titles t on t.id = c.title_id
        where c.curation_status in ('PENDING', 'UNDER_REVIEW', 'APPROVED')
        order by c.created_at asc
        limit 200
      `;

      return {
        concepts: rows.map((r) => ({
          ...mapConcept(r),
          titleName: r.title_name,
          ownerUserId: r.owner_user_id,
        })),
      };
    } catch (err) {
      migrationHint(err);
    }
  });

export const updateStoryConceptCuration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "INTRODUCED_TO_BUYERS"]),
      adminNotes: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    requireCurationStaff(actor);

    const sql = await getSql();
    try {
      const existing = await sql<ConceptRow>`
        select * from bridge_story_concept_submissions where id = ${data.id} limit 1
      `;
      const current = existing[0];
      if (!current) throw new Error("Not found");

      const from = current.curation_status as CurationStatus;
      const allowed = CURATION_TRANSITIONS[from] ?? [];
      if (!allowed.includes(data.status)) {
        throw new Error(`Invalid curation transition: ${from} → ${data.status}`);
      }

      const rows = await sql<ConceptRow>`
        update bridge_story_concept_submissions
        set
          curation_status = ${data.status},
          admin_notes = ${data.adminNotes ?? current.admin_notes},
          updated_at = now(),
          introduced_to_buyers_at = case
            when ${data.status} = 'INTRODUCED_TO_BUYERS' then coalesce(introduced_to_buyers_at, now())
            else introduced_to_buyers_at
          end
        where id = ${data.id}
        returning *
      `;

      const concept = rows[0];
      if (!concept) throw new Error("Not found");

      await writeAudit({
        actorUserId: actor.userId,
        action: "story_concept.curation_update",
        entityType: "bridge_story_concept_submission",
        entityId: concept.id,
        metadata: { from, status: data.status },
      });
      try {
        await notifyConceptOwner(sql, concept);
      } catch (notificationError) {
        console.warn("Bridge Story / Concept notification enqueue failed", {
          conceptId: concept.id,
          error: notificationError instanceof Error ? notificationError.message : "unknown",
        });
      }

      return { concept: mapConcept(concept) };
    } catch (err) {
      migrationHint(err);
    }
  });
