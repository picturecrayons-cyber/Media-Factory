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
  costBasisPaise: z.number().int().nonnegative().optional(),
  targetMarginPercent: z.number().min(0).max(100).optional(),
  pricingConfig: z.record(z.string(), z.unknown()).default({}),
  sourceNote: z.string().max(500).default(""),
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
      "insert into public.bridge_service_rates(service_code,version,currency,base_price_paise,minimum_price_paise,cost_basis_paise,target_margin_percent,pricing_config,source_note,active,source,created_by) values($1,$2,'INR',$3,$4,$5,$6,$7::jsonb,$8,$9,'ADMIN_CONFIG',$10) returning id",
      [
        data.serviceCode,
        version,
        data.basePricePaise,
        data.minimumPricePaise ?? 0,
        data.costBasisPaise ?? 0,
        data.targetMarginPercent ?? null,
        JSON.stringify(data.pricingConfig),
        data.sourceNote,
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


const settlementInput = z.object({
  titleId: z.string().min(8).nullable().optional(),
  beneficiaryType: z.enum(["CREATOR","RIGHTS_HOLDER","INVESTOR","DISTRIBUTOR","PARTNER","BRIDGE"]),
  beneficiaryUserId: z.string().min(1).max(160).nullable().optional(),
  basis: z.enum(["REVENUE","NET_AFTER_TAX","NET_AFTER_COSTS"]).default("REVENUE"),
  percentageBps: z.number().int().min(0).max(10000).nullable().optional(),
  fixedAmountPaise: z.number().int().nonnegative().nullable().optional(),
  activate: z.boolean().default(false),
});

export const configureSettlementRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(settlementInput)
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.configure");

    if (data.percentageBps == null && data.fixedAmountPaise == null) {
      throw new Error("Settlement rule needs a percentage or fixed amount");
    }

    const sql = await getSql();
    if (data.activate && data.percentageBps != null) {
      const existing = await sql.query<{ percentage_bps: number }>(
        "select coalesce(sum(percentage_bps),0) as percentage_bps from public.bridge_service_settlement_rules where (title_id=$1 or (title_id is null and $1 is null)) and active=true and beneficiary_type<>$2",
        [data.titleId ?? null, data.beneficiaryType],
      );
      const nextTotal = Number(existing[0]?.percentage_bps ?? 0) + data.percentageBps;
      if (nextTotal > 10000) throw new Error("Active settlement percentages exceed 100%");
    }

    const current = await sql.query<{ version: number }>(
      "select coalesce(max(version),0) as version from public.bridge_service_settlement_rules where (title_id=$1 or (title_id is null and $1 is null)) and beneficiary_type=$2",
      [data.titleId ?? null, data.beneficiaryType],
    );
    const version = Number(current[0]?.version ?? 0) + 1;

    if (data.activate) {
      await sql.query(
        "update public.bridge_service_settlement_rules set active=false,effective_to=coalesce(effective_to,now()) where (title_id=$1 or (title_id is null and $1 is null)) and beneficiary_type=$2 and active=true",
        [data.titleId ?? null, data.beneficiaryType],
      );
    }

    const rows = await sql.query<{ id: string }>(
      "insert into public.bridge_service_settlement_rules(title_id,beneficiary_type,beneficiary_user_id,basis,percentage_bps,fixed_amount_paise,active,version,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
      [
        data.titleId ?? null,
        data.beneficiaryType,
        data.beneficiaryUserId ?? null,
        data.basis,
        data.percentageBps ?? null,
        data.fixedAmountPaise ?? null,
        data.activate,
        version,
        actor.userId,
      ],
    );

    await writeAudit({
      actorUserId: actor.userId,
      action: "finance.settlement_rule_configured",
      entityType: "bridge_service_settlement_rule",
      entityId: rows[0].id,
      metadata: {
        titleId: data.titleId ?? null,
        beneficiaryType: data.beneficiaryType,
        beneficiaryUserId: data.beneficiaryUserId ?? null,
        basis: data.basis,
        percentageBps: data.percentageBps ?? null,
        fixedAmountPaise: data.fixedAmountPaise ?? null,
        activated: data.activate,
      },
    });

    return { ruleId: rows[0].id, active: data.activate, version };
  });
