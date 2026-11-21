import type { Sql } from "@/lib/db";
import type { BridgeTitle, TitleStatus } from "./types";
import { bridgeEnv } from "./env";

const REQUIRED_QC_FILES = [
  { label: "main film", kinds: ["master"] },
  { label: "trailer", kinds: ["screener"] },
  { label: "vertical poster", kinds: ["poster_vertical", "poster"] },
  { label: "horizontal artwork", kinds: ["poster_horizontal"] },
  { label: "thumbnail", kinds: ["thumbnail"] },
  { label: "subtitles", kinds: ["subtitle"] },
  { label: "censor/legal certificate", kinds: ["censor_certificate"] },
] as const;

type QcAsset = {
  id: string;
  kind: string;
  s3_key: string;
  byte_size: number | null;
  checksum_sha256: string | null;
  verified_object_key: string | null;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_namespace: string | null;
  storage_region: string | null;
  storage_endpoint: string | null;
  storage_verified_at: string | Date | null;
};

function storageVerified(asset: QcAsset): boolean {
  return Number(asset.byte_size ?? 0) > 0 &&
    Boolean(asset.verified_object_key) &&
    Boolean(asset.storage_provider && asset.storage_bucket && asset.storage_namespace &&
      asset.storage_region && asset.storage_endpoint && asset.storage_verified_at) &&
    Boolean(asset.checksum_sha256 && /^[a-f0-9]{64}$/.test(asset.checksum_sha256));
}

/**
 * Executes the real Submit-for-QC database path. Authentication and permission
 * checks stay in the server handler. The title and asset rows are locked before
 * validating the immutable seven-file package and metadata, preventing a
 * concurrent upload replacement from racing the lifecycle transition.
 */
export async function submitTitleForQc(
  sql: Sql,
  title: Pick<BridgeTitle, "id" | "status" | "masterKey" | "posterKey">,
  actorUserId: string,
  note?: string,
  consentVersion?: string,
): Promise<{ title: Pick<BridgeTitle, "id" | "status"> & { status: TitleStatus } }> {
  if (title.status !== "PREPARING") throw new Error("Title is not ready for QC submission");

  await sql.transaction(async (tx) => {
    const [locked] = await tx<{
      status: string;
      owner_user_id: string;
      owner_organization_id: string | null;
      name: string;
      submission_type: string | null;
      content_type: string | null;
      original_language: string | null;
      country_of_origin: string | null;
      release_date: string | Date | null;
      synopsis: string | null;
      runtime_minutes: number | null;
      year: number | null;
      master_language: string | null;
    }>`
      select status, owner_user_id, owner_organization_id, name, submission_type, content_type, original_language,
        country_of_origin, release_date, synopsis, runtime_minutes, year, master_language
      from bridge_titles where id = ${title.id} for update
    `;
    if (!locked || locked.status !== title.status) {
      throw new Error("Title changed; refresh before retrying");
    }

    if (consentVersion !== "bridge-title-rights-v1") {
      throw new Error("Current title submission declaration acceptance is required");
    }
    const [submitter] = await tx<{
      user_id: string; account_type: string; internal_role: string | null; organization_id: string | null;
    }>`select user_id, account_type, internal_role, organization_id from bridge_profiles where user_id = ${actorUserId} for share`;
    if (!submitter || submitter.internal_role || !["independent_creator", "studio"].includes(submitter.account_type)) {
      throw new Error("Only the verified Creator or Studio submitting account can accept the title declaration");
    }
    const ownerAllowed = locked.owner_user_id === actorUserId;
    const membership = submitter.account_type === "studio" && locked.owner_organization_id
      ? await tx<{ active: boolean }>`select exists (
          select 1 from bridge_organization_memberships
          where organization_id = ${locked.owner_organization_id}
            and user_id = ${actorUserId}
            and status = 'active'
        ) as active`
      : [];
    if (!ownerAllowed && membership[0]?.active !== true) {
      throw new Error("Only the title owner or an active member of the owning Studio can submit this title");
    }
    const assets = await tx<QcAsset>`
      select id, kind, s3_key, byte_size, checksum_sha256, verified_object_key,
        storage_provider, storage_bucket, storage_namespace, storage_region,
        storage_endpoint, storage_verified_at
      from bridge_assets
      where title_id = ${title.id}
      order by id
      for update
    `;
    const missing = REQUIRED_QC_FILES.filter((required) =>
      !assets.some((asset) =>
        required.kinds.some((kind) => kind === asset.kind) &&
        storageVerified(asset) &&
        (required.label !== "main film" || asset.s3_key === title.masterKey) &&
        (required.label !== "vertical poster" || asset.s3_key === title.posterKey)
      )
    );
    if (missing.length) {
      throw new Error(
        `QC blocked: all 7 mandatory files must have immutable storage verification and SHA-256 (missing or unverified: ${missing.map((item) => item.label).join(", ")})`,
      );
    }

    const metadataMissing = [
      !locked.name?.trim() ? "title name" : null,
      !locked.content_type?.trim() ? "content type" : null,
      !locked.original_language?.trim() ? "original language" : null,
      !locked.country_of_origin?.trim() ? "country of origin" : null,
      !locked.release_date ? "release date" : null,
      !locked.synopsis?.trim() ? "synopsis" : null,
      !(Number(locked.runtime_minutes) > 0) ? "runtime" : null,
      !(Number(locked.year) >= 1888 && Number(locked.year) <= new Date().getFullYear() + 2) ? "release year" : null,
      !locked.master_language?.trim() ? "master language" : null,
    ].filter((item): item is string => Boolean(item));
    if (metadataMissing.length) {
      throw new Error(`QC blocked: finished-film metadata incomplete (${metadataMissing.join(", ")})`);
    }
    if (locked.submission_type && locked.submission_type !== "finished_film") {
      throw new Error("QC blocked: this submission is not classified as a finished film");
    }

    const rights = await tx<{
      authority_type: string | null;
      authorization_evidence_type: string | null;
      authorization_confirmed: boolean;
      evidence: Array<{ type?: string; rightsBasis?: string; authorizationConfirmed?: boolean }>;
    }>`
      select i.authority_type, i.authorization_evidence_type, i.authorization_confirmed, g.evidence
      from bridge_title_submission_intake i
      join bridge_rights_grants g on g.title_id = i.title_id
      where i.title_id = ${title.id} and g.status in ('DRAFT','VALID')
      order by g.created_at desc limit 1
    `;
    const rightsRow = rights[0];
    const allowedAuthority = new Set([
      "RIGHTS_OWNER", "LICENSEE_WITH_ONWARD_RIGHTS", "DISTRIBUTOR_SALES_AGENT", "PRODUCER",
    ]);
    const attestation = rightsRow?.evidence?.some((item) =>
      item.type === "AUTHORIZATION_ATTESTATION" &&
      Boolean(item.rightsBasis) &&
      item.authorizationConfirmed === true
    );
    if (
      !rightsRow ||
      !allowedAuthority.has(rightsRow.authority_type ?? "") ||
      !rightsRow.authorization_evidence_type ||
      rightsRow.authorization_confirmed !== true ||
      !attestation
    ) {
      throw new Error("QC blocked: rights-holder classification and authorization evidence are incomplete");
    }

    const schema = await tx<{ outbox: string | null }>`
      select to_regclass('public.bridge_notification_outbox')::text as outbox
    `;
    if (!schema[0]?.outbox) {
      throw new Error("QC notification outbox is not installed in this environment");
    }

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

    await tx`
      update bridge_titles set status = 'QC_REVIEW', updated_at = now()
      where id = ${title.id}
    `;
    const [event] = await tx<{ id: number }>`
      insert into bridge_title_events (title_id, from_status, to_status, actor_user_id, note)
      values (${title.id}, ${title.status}, 'QC_REVIEW', ${actorUserId}, ${note ?? null})
      returning id
    `;
    if (!event?.id) throw new Error("QC lifecycle event could not be persisted");

    await tx`
      insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values (
        ${actorUserId}, 'title.advance', 'bridge_title', ${title.id},
        ${JSON.stringify({ from: title.status, to: "QC_REVIEW", submissionEventId: event.id })}
      )
    `;

    await tx`
      insert into bridge_title_submission_consents
        (title_id, submission_event_id, actor_user_id, actor_account_type, consent_version, accepted_at)
      values
        (${title.id}, ${event.id}, ${actorUserId}, ${submitter.account_type}, ${consentVersion}, now())
    `;
    // Stable idempotency key: tied to the persisted lifecycle event, not wall-clock time.
    const eventKey = `bridge-qc-submitted:${event.id}`;
    const baseUrl = bridgeEnv.appUrl();
    if (!baseUrl) throw new Error("Bridge application URL is not configured; QC notification was not queued");
    const titleName = locked.name || title.id;
    const subject = `QC review requested: ${titleName}`;
    const textBody = `A title has been submitted for QC review in Crayons Bridge. Title: ${titleName}. Title reference: ${title.id}. Open the internal QC desk: ${baseUrl}/internal?desk=qc`;
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
