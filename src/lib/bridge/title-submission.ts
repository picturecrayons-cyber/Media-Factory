import type { Sql } from "@/lib/db";
import type { BridgeTitle, TitleStatus } from "./types";
import { hasVerifiedMasterAndArtwork } from "./asset-roles.ts";

type QcTitleRow = {
  status: string;
  submission_type: string | null;
  language: string | null;
  runtime_minutes: number | null;
  genres: unknown;
  credits: unknown;
  master_key: string | null;
  poster_key: string | null;
};

type Credit = { role?: unknown; name?: unknown };

export function missingFinishedFilmMetadata(title: {
  submission_type?: string | null;
  language?: string | null;
  runtime_minutes?: number | null;
  genres?: unknown;
  credits?: unknown;
}): string[] {
  if ((title.submission_type ?? "finished_film") !== "finished_film") {
    return ["Finished Film submission type"];
  }

  const missing: string[] = [];
  if (!title.language?.trim()) missing.push("Language");
  if (!Number.isInteger(title.runtime_minutes) || (title.runtime_minutes ?? 0) <= 0) {
    missing.push("Runtime");
  }

  const genres = Array.isArray(title.genres)
    ? title.genres.filter((genre): genre is string => typeof genre === "string" && genre.trim().length > 0)
    : [];
  if (!genres.length) missing.push("Genre");

  const credits = Array.isArray(title.credits) ? (title.credits as Credit[]) : [];
  const hasCredit = (roles: Set<string>) =>
    credits.some((credit) =>
      roles.has(String(credit.role ?? "").trim().toUpperCase()) &&
      typeof credit.name === "string" &&
      credit.name.trim().length > 0
    );

  if (!hasCredit(new Set(["DIRECTOR"]))) missing.push("Director");
  if (!hasCredit(new Set(["CAST", "ACTOR", "ACTRESS"]))) missing.push("Cast");
  return missing;
}

/**
 * Executes the real Submit-for-QC database path. Metadata and current asset
 * pointers are read under the same row lock as the lifecycle transition.
 * Authentication and permission checks stay in the server handler.
 */
export async function submitTitleForQc(
  sql: Sql,
  title: Pick<BridgeTitle, "id" | "status" | "masterKey" | "posterKey">,
  actorUserId: string,
  note?: string,
): Promise<{ title: Pick<BridgeTitle, "id" | "status"> & { status: TitleStatus } }> {
  await sql.transaction(async (tx) => {
    const [locked] = await tx<QcTitleRow>`
      select
        status,
        coalesce(submission_type, 'finished_film') as submission_type,
        language,
        runtime_minutes,
        genres,
        credits,
        master_key,
        poster_key
      from bridge_titles
      where id = ${title.id}
      for update
    `;
    if (!locked || locked.status !== title.status || locked.status !== "PREPARING") {
      throw new Error("Title changed or is not ready; refresh before retrying");
    }

    const missing = missingFinishedFilmMetadata(locked);
    if (missing.length) {
      throw new Error(`Complete mandatory metadata before QC: ${missing.join(", ")}`);
    }

    const assets = await tx<{ kind: string; s3_key: string }>`
      select kind, s3_key
      from bridge_assets
      where title_id = ${title.id} and coalesce(byte_size, 0) > 0
    `;
    if (!hasVerifiedMasterAndArtwork(assets, locked.master_key, locked.poster_key)) {
      throw new Error("Verified master and artwork required before QC");
    }

    await tx`
      update bridge_titles set status = 'QC_REVIEW', updated_at = now()
      where id = ${title.id}
    `;
    await tx`
      insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
      values (${title.id}, ${title.status}, 'QC_REVIEW', ${actorUserId}, ${note ?? null})
    `;
    await tx`
      insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values (
        ${actorUserId}, 'title.advance', 'bridge_title', ${title.id},
        ${JSON.stringify({ from: title.status, to: "QC_REVIEW" })}
      )
    `;
  });
  return { title: { id: title.id, status: "QC_REVIEW" } };
}
