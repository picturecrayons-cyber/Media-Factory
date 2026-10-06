import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";
import { writeAudit } from "./audit";

const rateInput = z.object({
  serviceCode: z.string().min(2).max(80),
  basePricePaise: z.number().int().nonnegative(),
  minimumPricePaise: z.number().int().nonnegative().optional(),
  activate: z.boolean().default(false),
});

export const configureServiceRate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(rateInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.configure");

    const sql = await getSql();
    const service = await sql.query<{ code: string }>(
      "select code from public.bridge_service_catalog where code=$1 and active=true limit 1",
      [data.serviceCode],
    );
    if (!service[0]) throw new Error("SERVICE_NOT_ACTIVE");

    const current = await sql.query<{ version: number }>(
      "select coalesce(max(version),0) as version from public.bridge_service_rates where service_code=$1",
      [data.serviceCode],
    );
    const version = Number(current[0]?.version ?? 0) + 1;

    if (data.activate) {
      await sql.query(
        "update public.bridge_service_rates set active=false,effective_to=coalesce(effective_to,now()) where service_code=$1 and active=true",
        [data.serviceCode],
      );
    }

    const rows = await sql.query<{ id: string }>(
      "insert into public.bridge_service_rates(service_code,version,currency,base_price_paise,minimum_price_paise,active,source,created_by) values($1,$2,'INR',$3,$4,$5,'ADMIN_CONFIG',$6) returning id",
      [
        data.serviceCode,
        version,
        data.basePricePaise,
        data.minimumPricePaise ?? 0,
        data.activate,
        actor.userId,
      ],
    );

    await writeAudit({
      actorUserId: actor.userId,
      action: "finance.service_rate_configured",
      entityType: "bridge_service_rate",
      entityId: rows[0].id,
      metadata: {
        serviceCode: data.serviceCode,
        version,
        activated: data.activate,
      },
    });

    return {
      rateId: rows[0].id,
      serviceCode: data.serviceCode,
      version,
      active: data.activate,
    };
  });

const taxInput = z.object({
  ratePercent: z.number().min(0).max(100),
  activate: z.boolean().default(false),
});

export const configureTaxRate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(taxInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.configure");

    const sql = await getSql();
    if (data.activate) {
      await sql.query(
        "update public.bridge_tax_rates set active=false,effective_to=coalesce(effective_to,now()) where currency='INR' and active=true",
        [],
      );
    }

    const rows = await sql.query<{ id: string }>(
      "insert into public.bridge_tax_rates(currency,rate_percent,active,created_by) values('INR',$1,$2,$3) returning id",
      [data.ratePercent, data.activate, actor.userId],
    );

    await writeAudit({
      actorUserId: actor.userId,
      action: "finance.tax_rate_configured",
      entityType: "bridge_tax_rate",
      entityId: rows[0].id,
      metadata: { ratePercent: data.ratePercent, activated: data.activate },
    });

    return { taxRateId: rows[0].id, active: data.activate };
  });
