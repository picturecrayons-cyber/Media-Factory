import { getSql } from "@/lib/db";

export async function writeAudit(opts: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const sql = await getSql();
  await sql`
    insert into bridge_audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    values (
      ${opts.actorUserId},
      ${opts.action},
      ${opts.entityType},
      ${opts.entityId ?? null},
      ${JSON.stringify(opts.metadata ?? {})}
    )
  `;
}
