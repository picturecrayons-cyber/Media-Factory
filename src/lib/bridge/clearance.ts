import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";

const REQUIRED = ["Data", "Film", "Poster"];

export const listClearance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin" && actor.internalRole !== "admin" && actor.internalRole !== "qc_reviewer") {
      throw new Error("Forbidden");
    }
    const sql = await getSql();
    await ensureClearance(sql);
    const titles = await sql<{
      id: string;
      name: string;
      status: string;
      language: string | null;
      year: number | null;
      runtime_minutes: number | null;
      synopsis: string | null;
      checked: boolean | null;
      verified: boolean | null;
      certified: boolean | null;
    }>`
      select t.id, t.name, t.status, t.language, t.year, t.runtime_minutes, t.synopsis,
        c.checked, c.verified, c.certified
      from bridge_titles t
      left join bridge_clearance c on c.title_id = t.id
      where t.status in ('PREPARING', 'QC_REVIEW', 'RIGHTS_REVIEW')
      order by t.updated_at desc
      limit 40
    `;
    const assets = await sql<{ title_id: string; kind: string }>`
      select distinct on (a.title_id, a.kind) a.title_id, a.kind
      from bridge_assets a
      join bridge_titles t on t.id = a.title_id
      where t.status in ('PREPARING', 'QC_REVIEW', 'RIGHTS_REVIEW')
        and coalesce(a.byte_size, 0) > 0
      order by a.title_id, a.kind, a.created_at desc
    `;
    return {
      titles: titles.map((title) => {
        const mine = assets.filter((asset) => asset.title_id === title.id);
        const has = (kinds: string[]) => mine.some((asset) => kinds.includes(asset.kind));
        const checks = [
          { label: "Data", ok: Boolean(title.name && title.language && title.synopsis) },
          { label: "Film", ok: has(["master", "screener"]) },
          { label: "Trailer", ok: has(["trailer"]) },
          { label: "Poster", ok: has(["poster_vertical", "poster", "poster_horizontal", "thumbnail"]) },
          { label: "English subtitles", ok: has(["subtitle"]) },
          { label: "Certificate", ok: has(["censor_certificate"]) },
        ];
        const ready = checks.filter((item) => REQUIRED.includes(item.label as typeof REQUIRED[number])).every((item) => item.ok);
        return {
          id: title.id,
          name: title.name,
          status: title.status === "QC_REVIEW" ? "In QC" : title.status === "RIGHTS_REVIEW" ? "QC passed" : "Submitted",
          facts: [title.language, title.year ? String(title.year) : "", title.runtime_minutes ? `${title.runtime_minutes} min` : ""].filter(Boolean).join(" · "),
          checks,
          ready,
          checked: Boolean(title.checked) || title.status !== "PREPARING",
          verified: Boolean(title.verified),
          certified: Boolean(title.certified) || title.status === "RIGHTS_REVIEW",
        };
      }),
    };
  });

export const setClearance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().min(8),
    step: z.enum(["check", "verify", "certify"]),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin" && actor.internalRole !== "admin") throw new Error("Forbidden");
    const sql = await getSql();
    await ensureClearance(sql);
    const queue = await listOne(sql, data.titleId);
    if (!queue) throw new Error("Title is not in QC");
    if (data.step === "check" && !queue.ready) {
      const missing = queue.checks.filter((item) => !item.ok && REQUIRED.includes(item.label as typeof REQUIRED[number])).map((item) => item.label);
      throw new Error(`Still missing: ${missing.join(", ")}`);
    }
    if (data.step === "verify" && !queue.checked) throw new Error("Check the title first");
    if (data.step === "certify" && !queue.verified) throw new Error("Verify the preview first");

    let status = queue.rawStatus;
    if (data.step === "certify" && status !== "RIGHTS_REVIEW") {
      const steps = status === "PREPARING" ? [["PREPARING", "QC_REVIEW"], ["QC_REVIEW", "RIGHTS_REVIEW"]] : [["QC_REVIEW", "RIGHTS_REVIEW"]];
      for (const [from, to] of steps) {
        await sql`update bridge_titles set status = ${to}, updated_at = now() where id = ${data.titleId}`;
        await sql`insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note) values (${data.titleId}, ${from}, ${to}, ${actor.userId}, ${"QC passed"})`;
      }
      await sql`insert into bridge_qc_cases (title_id, status, reviewer_findings, reviewed_by, reviewed_at) values (${data.titleId}, 'PASSED', '[]'::jsonb, ${actor.userId}, now())`;
      status = "RIGHTS_REVIEW";
    }
    const checked = true;
    const verified = data.step !== "check";
    const certified = data.step === "certify";
    await sql`
      insert into bridge_clearance (title_id, checked, verified, certified, updated_by, updated_at)
      values (${data.titleId}, ${checked}, ${verified}, ${certified}, ${actor.userId}, now())
      on conflict (title_id) do update set
        checked = bridge_clearance.checked or excluded.checked,
        verified = bridge_clearance.verified or excluded.verified,
        certified = bridge_clearance.certified or excluded.certified,
        updated_by = excluded.updated_by,
        updated_at = now()
    `;
    const word = data.step === "check" ? "Checking complete" : data.step === "verify" ? "Preview verified" : "QC passed";
    await writeAudit({ actorUserId: actor.userId, action: `clearance.${data.step}`, entityType: "bridge_title", entityId: data.titleId, metadata: { status } });
    await notice(sql, { titleId: data.titleId, titleName: queue.name, ownerUserId: queue.ownerUserId, actorUserId: actor.userId, actorName: actor.displayName || actor.email, word });
    return { ok: true, word };
  });

async function listOne(sql: Awaited<ReturnType<typeof getSql>>, titleId: string) {
  const listed = await sql<{
    id: string; name: string; status: string; language: string | null; synopsis: string | null; owner_user_id: string;
    checked: boolean | null; verified: boolean | null;
  }>`
    select t.id, t.name, t.status, t.language, t.synopsis, t.owner_user_id, c.checked, c.verified
    from bridge_titles t
    left join bridge_clearance c on c.title_id = t.id
    where t.id = ${titleId}
    limit 1
  `;
  const title = listed[0];
  if (!title || !["PREPARING", "QC_REVIEW", "RIGHTS_REVIEW"].includes(title.status)) return null;
  const assets = await sql<{ kind: string }>`
    select distinct kind from bridge_assets where title_id = ${titleId} and coalesce(byte_size, 0) > 0
  `;
  const has = (kinds: string[]) => assets.some((asset) => kinds.includes(asset.kind));
  const checks = [
    { label: "Data", ok: Boolean(title.name && title.language && title.synopsis) },
    { label: "Film", ok: has(["master", "screener"]) },
    { label: "Poster", ok: has(["poster_vertical", "poster", "poster_horizontal", "thumbnail"]) },
  ];
  return {
    name: title.name,
    rawStatus: title.status,
    ownerUserId: title.owner_user_id,
    checks,
    ready: checks.every((item) => item.ok),
    checked: Boolean(title.checked) || title.status !== "PREPARING",
    verified: Boolean(title.verified),
  };
}

async function ensureClearance(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql.query(`
    create table if not exists bridge_clearance (
      title_id text primary key,
      checked boolean not null default false,
      verified boolean not null default false,
      certified boolean not null default false,
      updated_by text,
      updated_at timestamptz not null default now()
    )
  `);
}

async function notice(sql: Awaited<ReturnType<typeof getSql>>, input: {
  titleId: string; titleName: string; ownerUserId: string; actorUserId: string; actorName: string; word: string;
}) {
  try {
    const admins = await sql<{ email: string }>`
      select email from bridge_profiles where internal_role in ('admin', 'super_admin', 'qc_reviewer')
    `;
    const owner = await sql<{ email: string }>`select email from bridge_profiles where user_id = ${input.ownerUserId} limit 1`;
    const people = [...new Set([...admins.map((row) => row.email), owner[0]?.email ?? ""].map((value) => value.trim()).filter(Boolean))];
    let mailed = false;
    try {
      const { sendTransactionalEmail } = await import("./mail.server");
      await Promise.race([
        Promise.all(people.map((address) => sendTransactionalEmail({
          to: address,
          subject: `${input.word} · ${input.titleName}`,
          text: `${input.actorName}: ${input.word} for “${input.titleName}”. Open https://www.crayonspictures.in/title/${input.titleId}`,
        }))),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
      mailed = people.length > 0;
    } catch (error) {
      console.error("[bridge] clearance mail skipped", error instanceof Error ? error.message : error);
    }
    await sql.query(`
      create table if not exists bridge_desk_notes (
        id text primary key,
        title_id text not null,
        actor_user_id text not null,
        action text not null,
        body text not null,
        mailed boolean not null default false,
        created_at timestamptz not null default now()
      )
    `);
    await sql`
      insert into bridge_desk_notes (id, title_id, actor_user_id, action, body, mailed)
      values (${randomBytes(16).toString("hex")}, ${input.titleId}, ${input.actorUserId}, 'note', ${input.word}, ${mailed})
    `;
  } catch (error) {
    console.error("[bridge] clearance notice skipped", error instanceof Error ? error.message : error);
  }
}
