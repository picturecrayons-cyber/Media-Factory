import { getSql } from "@/lib/db";

export async function writeAudit(opts: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  actorRole?: string | null;
  previousState?: string | null;
  newState?: string | null;
  reason?: string | null;
}) {
  const sql = await getSql();
  await sql`
    insert into bridge_audit_logs (
      actor_user_id, action, entity_type, entity_id, metadata,
      actor_role, previous_state, new_state, reason
    )
    values (
      ${opts.actorUserId},
      ${opts.action},
      ${opts.entityType},
      ${opts.entityId ?? null},
      ${JSON.stringify(opts.metadata ?? {})},
      ${opts.actorRole ?? null},
      ${opts.previousState ?? null},
      ${opts.newState ?? null},
      ${opts.reason ?? null}
    )
  `;
}
