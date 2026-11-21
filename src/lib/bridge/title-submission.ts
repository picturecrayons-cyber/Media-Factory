import type { Sql } from "@/lib/db";
import type { BridgeTitle, TitleStatus } from "./types";
import { hasVerifiedMasterAndArtwork } from "./asset-roles.ts";

/**
 * Executes the real Submit-for-QC database path. Authentication and permission
 * checks stay in the server handler; asset validation and all lifecycle writes
 * remain here so the same transaction can be exercised by PostgreSQL tests.
 */
export async function submitTitleForQc(
  sql: Sql,
  title: Pick<BridgeTitle, "id" | "status" | "masterKey" | "posterKey">,
  actorUserId: string,
  note?: string,
): Promise<{ title: Pick<BridgeTitle, "id" | "status"> & { status: TitleStatus } }> {
  if (title.status !== "PREPARING") throw new Error("Title is not ready for QC submission");
  const assets = await sql<{ kind: string; s3_key: string }>`
    select kind, s3_key
    from bridge_assets
    where title_id = ${title.id} and coalesce(byte_size, 0) > 0
  `;
  if (!hasVerifiedMasterAndArtwork(assets, title.masterKey, title.posterKey)) {
    throw new Error("Verified master and artwork required before QC");
  }

  await sql.transaction(async (tx) => {
    const [locked] = await tx<{ status: string }>`
      select status from bridge_titles where id = ${title.id} for update
    `;
    if (!locked || locked.status !== title.status) {
      throw new Error("Title changed; refresh before retrying");
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

    // QC submission and its internal notification queue entry are one commit.
    // Do not silently accept a submission when the notification schema is absent.
    const schema = await tx<{ outbox: string | null }>`
      select to_regclass('bridge_notification_outbox')::text as outbox
    `;
    if (!schema[0]?.outbox) {
      throw new Error("QC notification outbox is not installed in this environment");
    }
    const [titleRecord] = await tx<{ name: string }>`
      select name from bridge_titles where id = ${title.id} limit 1
    `;
    const reviewers = await tx<{ user_id: string; email: string }>`
      select user_id, email
      from bridge_profiles
      where internal_role = 'qc_reviewer'
        and email_verified = true
        and email is not null
        and btrim(email) <> ''
      order by user_id
    `;
    if (reviewers.length === 0) {
      throw new Error("No verified QC reviewer is configured; submission was not accepted");
    }
    const eventKey = `bridge-qc-submitted:${title.id}:${new Date().toISOString()}`;
    const titleName = titleRecord?.name ?? title.id;
    const subject = `QC review requested: ${titleName}`;
    const textBody = `A title has been submitted for QC review in Crayons Bridge. Title: ${titleName}. Title reference: ${title.id}. Open the internal QC desk: https://www.crayonspictures.in/internal?desk=qc`;
    for (const reviewer of reviewers) {
      await tx`
        insert into bridge_notification_outbox (
          event_key, recipient_email, subject, text_body, html_body
        ) values (
          ${`${eventKey}:${reviewer.user_id}`}, ${reviewer.email}, ${subject}, ${textBody}, null
        ) on conflict (event_key) do nothing
      `;
    }
  });
  return { title: { id: title.id, status: "QC_REVIEW" } };
}
