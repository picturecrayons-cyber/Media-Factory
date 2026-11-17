import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { writeAudit } from "./audit";
import {
  isWorkspacePresetManager,
  legalPresetConfig,
  operationalPresetConfig,
  workspacePresetWriteInput,
  type WorkspacePresetConfig,
} from "./workspace-presets-policy";

function assertPresetManager(actor: { emailVerified: boolean; internalRole: string | null }) {
  if (!isWorkspacePresetManager(actor)) throw new Error("Super Admin access required");
}

function parseConfiguration(type: "OPERATIONAL" | "LEGAL", value: unknown): WorkspacePresetConfig {
  const parsed = type === "OPERATIONAL"
    ? operationalPresetConfig.safeParse(value)
    : legalPresetConfig.safeParse(value);
  if (!parsed.success) throw new Error("Invalid workspace preset configuration");
  return parsed.data;
}

const presetRow = z.object({
  id: z.string().uuid(),
  preset_type: z.enum(["OPERATIONAL", "LEGAL"]),
  name: z.string(),
  version: z.number(),
  configuration: z.unknown(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  created_at: z.union([z.string(), z.date()]),
  updated_at: z.union([z.string(), z.date()]),
});

export const listWorkspacePresets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ includeArchived: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPresetManager(actor);
    const sql = await getSql();
    const rows = data.includeArchived
      ? await sql<z.infer<typeof presetRow>>`
          select id, preset_type, name, version, configuration, status, created_at, updated_at
          from public.bridge_workspace_presets
          order by preset_type, lower(name), version desc
          limit 200
        `
      : await sql<z.infer<typeof presetRow>>`
          select id, preset_type, name, version, configuration, status, created_at, updated_at
          from public.bridge_workspace_presets
          where status = 'ACTIVE'
          order by preset_type, lower(name), version desc
          limit 200
        `;
    return {
      presets: rows.map((row) => ({
        ...row,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })),
    };
  });

export const saveWorkspacePreset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(workspacePresetWriteInput)
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPresetManager(actor);
    const configuration = parseConfiguration(data.type, data.configuration);
    const normalizedName = data.name.toLocaleLowerCase("en-US");
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      let previous: { id: string; version: number; status: string } | undefined;
      if (data.id) {
        const rows = await tx<{ id: string; version: number; status: string }>`
          select id, version, status
          from public.bridge_workspace_presets
          where id = ${data.id}
          for update
        `;
        previous = rows[0];
        if (!previous || previous.status !== "ACTIVE") {
          throw new Error("Preset is unavailable or already archived");
        }
      }
      const versions = await tx<{ next_version: number }>`
        select coalesce(max(version), 0) + 1 as next_version
        from public.bridge_workspace_presets
        where preset_type = ${data.type} and normalized_name = ${normalizedName}
      `;
      if (previous) {
        await tx`
          update public.bridge_workspace_presets
          set status = 'ARCHIVED', archived_at = now(), updated_at = now()
          where id = ${data.id} and status = 'ACTIVE'
        `;
      }
      const [saved] = await tx<{ id: string; version: number }>`
        insert into public.bridge_workspace_presets
          (preset_type, name, normalized_name, version, configuration, status, created_by, updated_by)
        values (
          ${data.type}, ${data.name}, ${normalizedName}, ${versions[0]?.next_version ?? 1},
          ${JSON.stringify(configuration)}::jsonb, 'ACTIVE', ${actor.userId}, ${actor.userId}
        )
        returning id, version
      `;
      await writeAudit({
        actorUserId: actor.userId,
        action: previous ? "workspace_preset.version_created" : "workspace_preset.created",
        entityType: "bridge_workspace_preset",
        entityId: saved.id,
        metadata: { presetType: data.type, name: data.name, version: saved.version },
      }, tx);
      return { id: saved.id, version: saved.version };
    });
  });

export const archiveWorkspacePreset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPresetManager(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [archived] = await tx<{ id: string; name: string; preset_type: string; version: number }>`
        update public.bridge_workspace_presets
        set status = 'ARCHIVED', archived_at = now(), updated_at = now(), updated_by = ${actor.userId}
        where id = ${data.id} and status = 'ACTIVE'
        returning id, name, preset_type, version
      `;
      if (!archived) throw new Error("Active preset not found");
      await writeAudit({
        actorUserId: actor.userId,
        action: "workspace_preset.archived",
        entityType: "bridge_workspace_preset",
        entityId: archived.id,
        metadata: { presetType: archived.preset_type, name: archived.name, version: archived.version },
      }, tx);
      return { archived: true };
    });
  });

export const applyWorkspacePreset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const actor = await requireVerifiedActor(context.userId);
    assertPresetManager(actor);
    const sql = await getSql();
    return sql.transaction(async (tx) => {
      const [preset] = await tx<{
        id: string;
        preset_type: "OPERATIONAL" | "LEGAL";
        name: string;
        version: number;
        configuration: unknown;
      }>`
        select id, preset_type, name, version, configuration
        from public.bridge_workspace_presets
        where id = ${data.id} and status = 'ACTIVE'
        for share
      `;
      if (!preset) throw new Error("Active preset not found");
      const configuration = parseConfiguration(preset.preset_type, preset.configuration);
      await writeAudit({
        actorUserId: actor.userId,
        action: "workspace_preset.applied_to_draft",
        entityType: "bridge_workspace_preset",
        entityId: preset.id,
        metadata: { presetType: preset.preset_type, name: preset.name, version: preset.version },
      }, tx);
      return {
        id: preset.id,
        type: preset.preset_type,
        name: preset.name,
        version: preset.version,
        configuration,
      };
    });
  });
