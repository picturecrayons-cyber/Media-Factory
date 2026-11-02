import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";
import { assertPermission, type Actor } from "./rbac";
import {
  canOperateVendorJob,
  canRequestVendorJob,
  canSignOffVendorJob,
  nextVendorJobState,
} from "./vendor-delivery-policy";
import { requireVerifiedActor } from "./session";

const jobType = z.enum(["dubbing", "loudness_check", "imf_request", "dcp_request", "human_qc"]);
const transitionAction = z.enum(["start_work", "submit_review", "sign_off", "block"]);

type TitleScope = {
  id: string;
  name: string;
  owner_user_id: string;
  owner_account_type: "independent_creator" | "studio" | "buyer" | "investor";
  owner_organization_id: string | null;
  status: string;
};


function unavailableStorage(error: unknown): never {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  if (candidate?.code === "42P01" || /relation .*bridge_vendor_job.* does not exist/i.test(message)) {
    throw new Error("Vendor job storage is not installed in this environment. No request was saved; the reviewed migration must be applied separately.");
  }
  throw error;
}

async function withStorage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return unavailableStorage(error);
  }
}

async function addJobEvent(
  tx: Sql,
  input: { jobId: string; actorUserId: string; eventType: string; fromState?: string | null; toState?: string | null; metadata?: Record<string, unknown> },
) {
  await tx`
    insert into public.bridge_vendor_job_events
      (job_id, actor_user_id, event_type, from_state, to_state, metadata)
    values
      (${input.jobId}, ${input.actorUserId}, ${input.eventType},
       ${input.fromState ?? null}, ${input.toState ?? null},
       ${JSON.stringify(input.metadata ?? {})}::jsonb)
  `;
}

export const listDeliveryDeskTitles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "delivery.read");
    if (actor.internalRole && !actor.organizationId) return { titles: [] };
    if (!actor.internalRole && !["studio", "independent_creator"].includes(actor.accountType)) {
      return { titles: [] };
    }
    const isInternal = Boolean(actor.internalRole);
    const isStudio = !isInternal && actor.accountType === "studio" && Boolean(actor.organizationId);
    const sql = await getSql();
    const titles = await sql<{
      id: string; name: string; language: string; year: number | null; status: string;
    }>`
      select t.id, t.name, t.language, t.year, t.status
      from public.bridge_titles t
      where
        (not ${isInternal} and t.owner_user_id = ${actor.userId})
        or (${isStudio} and t.owner_account_type = 'studio'
            and t.owner_organization_id = ${actor.organizationId ?? null})
        or (${isInternal} and t.owner_organization_id = ${actor.organizationId ?? null})
      order by t.updated_at desc
      limit 200
    `;
    return { titles };
  });

export const listVendorDeliveryJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "delivery.read");
    if (actor.internalRole && !actor.organizationId) return { jobs: [] };
    if (!actor.internalRole && !["studio", "independent_creator"].includes(actor.accountType)) {
      return { jobs: [] };
    }
    const sql = await getSql();
    const isInternal = Boolean(actor.internalRole);
    const isStudio = !isInternal && actor.accountType === "studio" && Boolean(actor.organizationId);
    const rows = await withStorage(() => sql<{
      id: string; title_id: string; title_name: string; job_type: string; state: string;
      note: string; requested_by: string; assigned_vendor: string | null;
      assigned_by: string | null; assigned_at: string | null; signed_off_by: string | null;
      signed_off_at: string | null; created_at: string;
    }>`
      select j.id, j.title_id, t.name as title_name, j.job_type, j.state, j.note,
             j.requested_by, j.assigned_vendor, j.assigned_by, j.assigned_at,
             j.signed_off_by, j.signed_off_at, j.created_at
      from public.bridge_vendor_jobs j
      join public.bridge_titles t on t.id = j.title_id
      where j.organization_id is not distinct from t.owner_organization_id
        and (
          (not ${isInternal} and t.owner_user_id = ${actor.userId})
          or (${isStudio} and t.owner_account_type = 'studio'
              and t.owner_organization_id = ${actor.organizationId ?? null})
          or (${isInternal} and t.owner_organization_id = ${actor.organizationId ?? null})
        )
      order by j.created_at desc
      limit 200
    `);
    return { jobs: rows };
  });

export const requestVendorDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().trim().min(8).max(200),
    type: jobType,
    idempotencyKey: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    return withStorage(() => sql.transaction(async (tx) => {
      const [title] = await tx<TitleScope>`
        select id, name, owner_user_id, owner_account_type, owner_organization_id, status
        from public.bridge_titles where id = ${data.titleId} for update
      `;
      if (!title) throw new Error("Not found");
      if (!canRequestVendorJob(actor, {
        ownerUserId: title.owner_user_id,
        ownerAccountType: title.owner_account_type,
        ownerOrganizationId: title.owner_organization_id,
      })) throw new Error("Forbidden");
      const id = randomUUID();
      const [created] = await tx<{ id: string; state: string }>`
        insert into public.bridge_vendor_jobs
          (id, organization_id, title_id, job_type, state, note, requested_by, idempotency_key)
        values
          (${id}, ${title.owner_organization_id}, ${title.id}, ${data.type},
           'requested', ${data.note ?? ""}, ${actor.userId}, ${data.idempotencyKey})
        on conflict (idempotency_key) do nothing
        returning id, state
      `;
      if (!created) {
        const [existing] = await tx<{ id: string; state: string; title_id: string; requested_by: string; job_type: string }>`
          select id, state, title_id, requested_by, job_type
          from public.bridge_vendor_jobs where idempotency_key = ${data.idempotencyKey}
        `;
        if (!existing || existing.requested_by !== actor.userId ||
            existing.title_id !== title.id || existing.job_type !== data.type) {
          throw new Error("Idempotency key already used for a different vendor request");
        }
        return { id: existing.id, state: existing.state };
      }
      await addJobEvent(tx, {
        jobId: created.id, actorUserId: actor.userId, eventType: "requested",
        toState: "requested", metadata: { titleId: title.id, jobType: data.type },
      });
      await writeAudit({
        actorUserId: actor.userId, action: "delivery.vendor_job.requested",
        entityType: "bridge_vendor_job", entityId: created.id,
        metadata: { titleId: title.id, organizationId: title.owner_organization_id, jobType: data.type },
      }, tx);
      return { id: created.id, state: "requested" as const };
    }));
  });

export const assignVendorDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    vendorLabel: z.string().trim().min(2).max(160),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    return withStorage(() => sql.transaction(async (tx) => {
      const [job] = await tx<{ id: string; title_id: string; organization_id: string | null; state: string }>`
        select j.id, j.title_id, j.organization_id, j.state,
               t.owner_organization_id
        from public.bridge_vendor_jobs j
        join public.bridge_titles t on t.id = j.title_id
        where j.id = ${data.jobId} for update of j
      `;
      if (!job || job.organization_id !== job.owner_organization_id ||
          !canOperateVendorJob(actor, job.organization_id)) throw new Error("Not found");
      if (job.state !== "requested") throw new Error("Invalid vendor job state transition");
      await tx`
        update public.bridge_vendor_jobs
        set state = 'assigned', assigned_vendor = ${data.vendorLabel},
            assigned_by = ${actor.userId}, assigned_at = now(), updated_at = now()
        where id = ${job.id}
      `;
      await addJobEvent(tx, {
        jobId: job.id, actorUserId: actor.userId, eventType: "assigned",
        fromState: "requested", toState: "assigned", metadata: { vendorLabel: data.vendorLabel },
      });
      await writeAudit({
        actorUserId: actor.userId, action: "delivery.vendor_job.assigned",
        entityType: "bridge_vendor_job", entityId: job.id,
        metadata: { vendorLabel: data.vendorLabel, organizationId: job.organization_id },
      }, tx);
      return { id: job.id, state: "assigned" as const };
    }));
  });

export const transitionVendorDeliveryJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    jobId: z.string().uuid(),
    action: transitionAction,
    note: z.string().trim().min(4).max(2000).optional(),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    return withStorage(() => sql.transaction(async (tx) => {
      const [job] = await tx<{
        id: string; title_id: string; organization_id: string | null; state: string; requested_by: string;
      }>`
        select j.id, j.title_id, j.organization_id, j.state, j.requested_by,
               t.owner_organization_id
        from public.bridge_vendor_jobs j
        join public.bridge_titles t on t.id = j.title_id
        where j.id = ${data.jobId} for update of j
      `;
      if (!job || job.organization_id !== job.owner_organization_id ||
          !canOperateVendorJob(actor, job.organization_id)) throw new Error("Not found");
      const nextState = nextVendorJobState(job.state, data.action);
      if (!nextState) throw new Error("Invalid vendor job state transition");
      if (data.action === "sign_off" && !canSignOffVendorJob(job.requested_by, actor.userId)) {
        throw new Error("A different reviewer must sign off this vendor job");
      }
      await tx`
        update public.bridge_vendor_jobs
        set state = ${nextState},
            note = case when ${data.note ?? null}::text is null then note else ${data.note ?? null} end,
            signed_off_by = case when ${nextState} = 'signed_off' then ${actor.userId} else signed_off_by end,
            signed_off_at = case when ${nextState} = 'signed_off' then now() else signed_off_at end,
            updated_at = now()
        where id = ${job.id}
      `;
      await addJobEvent(tx, {
        jobId: job.id, actorUserId: actor.userId, eventType: data.action,
        fromState: job.state, toState: nextState, metadata: { note: data.note ?? null },
      });
      await writeAudit({
        actorUserId: actor.userId, action: `delivery.vendor_job.${data.action}`,
        entityType: "bridge_vendor_job", entityId: job.id,
        metadata: { titleId: job.title_id, from: job.state, to: nextState, organizationId: job.organization_id },
      }, tx);
      return { id: job.id, state: nextState };
    }));
  });

export const prepareDestinationPackage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    titleId: z.string().trim().min(8).max(200),
    destination: z.string().trim().min(2).max(160),
  }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [title] = await tx<TitleScope>`
        select id, name, owner_user_id, owner_account_type, owner_organization_id, status
        from public.bridge_titles where id = ${data.titleId} for update
      `;
      if (!title || !canOperateVendorJob(actor, title.owner_organization_id)) throw new Error("Not found");
      if (title.status !== "LICENSED") throw new Error("Package preparation requires a LICENSED title");
      const [evidence] = await tx<{
        qc_case_id: string | null; legal_case_id: string | null; rights_grant_id: string | null;
      }>`
        select
          (select q.id from public.bridge_qc_cases q where q.title_id = t.id and q.status = 'PASSED'
            order by q.created_at desc limit 1) as qc_case_id,
          (select l.id from public.bridge_legal_cases l where l.title_id = t.id and l.status = 'APPROVED'
            order by l.created_at desc limit 1) as legal_case_id,
          (select r.id from public.bridge_rights_grants r where r.title_id = t.id and r.status = 'VALID'
            and r.window_start <= now() and r.window_end > now()
            order by r.created_at desc limit 1) as rights_grant_id
        from public.bridge_titles t where t.id = ${title.id}
      `;
      const assets = await tx<{ master_ok: boolean; poster_ok: boolean }>`
        select
          exists(select 1 from public.bridge_assets a where a.title_id = t.id and a.kind = 'master' and coalesce(a.byte_size,0) > 0) as master_ok,
          exists(select 1 from public.bridge_assets a where a.title_id = t.id and a.kind = 'poster' and coalesce(a.byte_size,0) > 0) as poster_ok
        from public.bridge_titles t where t.id = ${title.id}
      `;
      if (!evidence?.qc_case_id || !evidence.legal_case_id || !evidence.rights_grant_id ||
          !assets[0]?.master_ok || !assets[0]?.poster_ok) {
        throw new Error("Package preparation blocked: verified QC, legal approval, active rights, master and poster are required");
      }
      const versions = await tx<{ ids: string[] }>`
        select coalesce(array_agg(v.id::text order by v.created_at desc), array[]::text[]) as ids
        from public.bridge_asset_versions v
        where v.title_id = ${title.id} and v.processing_state = 'PASSED'
      `;
      const [version] = await tx<{ next_version: number }>`
        select coalesce(max(package_version), 0) + 1 as next_version
        from public.bridge_destination_packages
        where title_id = ${title.id} and destination = ${data.destination}
      `;
      const [pkg] = await tx<{ id: string }>`
        insert into public.bridge_destination_packages
          (title_id, destination, package_version, rights_grant_id, qc_case_id,
           legal_case_id, asset_version_ids, readiness_state, authorized_by, authorized_at)
        values
          (${title.id}, ${data.destination}, ${version.next_version}, ${evidence.rights_grant_id},
           ${evidence.qc_case_id}, ${evidence.legal_case_id},
           ${JSON.stringify(versions[0]?.ids ?? [])}::jsonb, 'HOLD', null, null)
        returning id
      `;
      await writeAudit({
        actorUserId: actor.userId, action: "delivery.destination_package.prepared",
        entityType: "bridge_destination_package", entityId: pkg.id,
        metadata: { titleId: title.id, destination: data.destination, readinessState: "HOLD" },
      }, tx);
      return { id: pkg.id, readinessState: "HOLD" as const };
    });
  });
