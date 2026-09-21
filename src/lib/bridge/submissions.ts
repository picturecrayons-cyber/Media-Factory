import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "./session";
import { assertPermission, canReadTitle } from "./rbac";
import { loadTitle, recordTransition } from "./titles";
import { writeAudit } from "./audit";
import { assertNotDevUser } from "./guards";
import { CERTIFICATION_VERSION, COMMERCIAL_PREFERENCE_IDS, classifyScreenerUrl } from "./submission-policy";
import { integrationStatus } from "./env";

function clientIp(): string | null {
  try {
    const req = getRequest();
    const fwd = req?.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() || null;
    return req?.headers.get("x-real-ip");
  } catch {
    return null;
  }
}

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    try {
      const rows = actor.organizationId
        ? await sql<{
            id: string;
            title_id: string;
            title_name: string;
            status: string;
            screener_status: string;
            created_at: string | Date;
          }>`
            select s.id, s.title_id, t.name as title_name, s.status, s.screener_status, s.created_at
            from bridge_submissions s
            join bridge_titles t on t.id = s.title_id
            where s.actor_user_id = ${actor.userId} or s.organization_id = ${actor.organizationId}
            order by s.created_at desc
            limit 100
          `
        : await sql<{
            id: string;
            title_id: string;
            title_name: string;
            status: string;
            screener_status: string;
            created_at: string | Date;
          }>`
            select s.id, s.title_id, t.name as title_name, s.status, s.screener_status, s.created_at
            from bridge_submissions s
            join bridge_titles t on t.id = s.title_id
            where s.actor_user_id = ${actor.userId}
            order by s.created_at desc
            limit 100
          `;
      return {
        submissions: rows.map((r) => ({
          id: r.id,
          titleId: r.title_id,
          titleName: r.title_name,
          status: r.status,
          screenerStatus: r.screener_status,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        })),
      };
    } catch {
      return { submissions: [] as const, schemaPending: true };
    }
  });

export const submitFilm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      directorName: z.string().min(2).max(120),
      studioBanner: z.string().max(160).optional(),
      officialEmail: z.string().email(),
      phone: z.string().max(40).optional(),
      title: z.string().min(1).max(160),
      titleMl: z.string().max(160).optional(),
      synopsis: z.string().min(8).max(4000),
      genre: z.string().max(80).optional(),
      language: z.string().max(40).optional(),
      year: z.number().int().min(1895).max(2100).optional(),
      runtimeMinutes: z.number().int().min(1).max(600).optional(),
      maturityRating: z.string().max(20).optional(),
      screenerUrl: z.string().url(),
      posterUrl: z.string().url().optional().or(z.literal("")),
      backdropUrl: z.string().url().optional().or(z.literal("")),
      commercialPreferences: z.array(z.enum(COMMERCIAL_PREFERENCE_IDS)).min(1),
      certify: z.literal(true),
    }),
  )
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    if (actor.accountType !== "independent_creator" && actor.accountType !== "studio") {
      throw new Error("Filmmaker or studio desk only");
    }
    assertPermission(actor, "title.create");
    const screener = classifyScreenerUrl(data.screenerUrl);
    const sql = await getSql();
    const titleId = randomBytes(16).toString("hex");
    const slugBase = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const slug = `${slugBase || "title"}-${titleId.slice(0, 6)}`;
    await sql`
      insert into bridge_titles (
        id, slug, name, name_ml, owner_user_id, organization_id, owner_account_type, status,
        synopsis, language, year, runtime_minutes, licensing_fee_paise
      ) values (
        ${titleId}, ${slug}, ${data.title}, ${data.titleMl ?? null}, ${actor.userId},
        ${actor.organizationId ?? null}, ${actor.accountType}, ${"DRAFT"}, ${data.synopsis},
        ${data.language ?? "Malayalam"}, ${data.year ?? null}, ${data.runtimeMinutes ?? null}, ${0}
      )
    `;
    await recordTransition({
      titleId,
      from: null,
      to: "DRAFT",
      actorUserId: actor.userId,
      note: "submission",
    });
    const title = await loadTitle(titleId);
    if (!title) throw new Error("Title create failed");
    const id = randomBytes(16).toString("hex");
    const ip = clientIp();
    await sql`
      insert into bridge_submissions (
        id, title_id, actor_user_id, organization_id, director_name, studio_banner,
        official_email, phone, genre, maturity_rating, screener_url, screener_status,
        poster_url, backdrop_url, commercial_preferences, certification_version,
        certified_at, certified_by, certified_ip, status
      ) values (
        ${id}, ${title.id}, ${actor.userId}, ${actor.organizationId ?? null}, ${data.directorName},
        ${data.studioBanner ?? ""}, ${data.officialEmail}, ${data.phone ?? ""}, ${data.genre ?? ""},
        ${data.maturityRating ?? ""}, ${data.screenerUrl}, ${screener.status},
        ${data.posterUrl || ""}, ${data.backdropUrl || ""}, ${JSON.stringify(data.commercialPreferences)}::jsonb,
        ${CERTIFICATION_VERSION}, now(), ${actor.userId}, ${ip}, ${"submitted"}
      )
    `;
    await writeAudit({
      actorUserId: actor.userId,
      action: "submission.create",
      entityType: "bridge_submission",
      entityId: id,
      metadata: { titleId: title.id, screenerStatus: screener.status, certification: CERTIFICATION_VERSION },
    });
    let mailSent = false;
    if (integrationStatus().mail) {
      try {
        const { sendBridgeMail } = await import("./mail.server");
        await sendBridgeMail({
          to: data.officialEmail,
          subject: `Crayons Bridge submission ${id.slice(0, 8)}`,
          text: `Your title "${title.name}" is recorded as a Bridge submission (${id}). Status: submitted. Screener: ${screener.status}. This is not Loop publication.`,
        });
        mailSent = true;
      } catch {
        mailSent = false;
      }
    }
    return {
      submissionId: id,
      titleId: title.id,
      status: "submitted" as const,
      screenerStatus: screener.status,
      mailSent,
    };
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireActor(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      title_id: string;
      actor_user_id: string;
      organization_id: string | null;
      status: string;
      screener_status: string;
    }>`
      select id, title_id, actor_user_id, organization_id, status, screener_status
      from bridge_submissions where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Not found");
    const title = await loadTitle(row.title_id);
    if (!title || !canReadTitle(actor, title)) throw new Error("Not found");
    return row;
  });
