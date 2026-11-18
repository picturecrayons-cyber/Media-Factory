import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";
import { loadTitle } from "./titles";
import { rejectPermanentTitleDeletion } from "./title-deletion-policy";

/**
 * Read-only deletion preflight. This deliberately does not delete rows or
 * objects. It reports schema-level FK dependencies and keeps the operation
 * blocked until legal retention and storage recovery are evidenced.
 */
export const inspectTitleDeletion = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8).max(128) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.delete");

    const title = await loadTitle(data.id);
    if (!title) throw new Error("Not found");

    const sql = await getSql();
    const foreignKeys = await sql<{
      referencing_table: string;
      referencing_column: string;
      on_delete: string;
    }>`
      select
        c.conrelid::regclass::text as referencing_table,
        child_attr.attname as referencing_column,
        case c.confdeltype
          when 'a' then 'NO ACTION'
          when 'r' then 'RESTRICT'
          when 'c' then 'CASCADE'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
          else 'UNKNOWN'
        end as on_delete
      from pg_constraint c
      join lateral unnest(c.conkey) with ordinality child_key(attnum, ord) on true
      join lateral unnest(c.confkey) with ordinality parent_key(attnum, ord)
        on parent_key.ord = child_key.ord
      join pg_attribute child_attr
        on child_attr.attrelid = c.conrelid and child_attr.attnum = child_key.attnum
      join pg_attribute parent_attr
        on parent_attr.attrelid = c.confrelid and parent_attr.attnum = parent_key.attnum
      where c.contype = 'f'
        and c.confrelid = 'public.bridge_titles'::regclass
        and parent_attr.attname = 'id'
      order by c.conrelid::regclass::text, child_attr.attname
    `;

    return {
      title: { id: title.id, name: title.name, status: title.status },
      status: "BLOCKED" as const,
      foreignKeys,
      blockers: [
        "Legal, contractual, accounting, dispute, and preservation retention clearance has not been evidenced.",
        "OCI primary and recovery object inventory, versions, checksums, retention, and restore proof have not been verified.",
        "Referencing foreign keys are listed, but live dependent-row counts and external-system dependencies have not been reconciled.",
        "A transactional archive, restore, and verified storage-cleanup workflow is not implemented.",
      ],
      destructiveActionAvailable: false as const,
    };
  });

export const deleteTitle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(8), confirmation: z.string().min(1).max(160) }))
  .handler(async () => {
    // Fail closed before any database mutation, audit write, or OCI operation.
    rejectPermanentTitleDeletion();
  });
