import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";

export const getCommercialConfiguration = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.configure");

    const sql = await getSql();
    const services = await sql.query<{ code: string; name: string }>(
      "select code,name from public.bridge_service_catalog where active=true and customer_visible=true and classification in ('BILLABLE','PASS_THROUGH') order by category,name",
      [],
    );
    const rates = await sql.query<{
      id: string;
      service_code: string;
      base_price_paise: number;
      minimum_price_paise: number;
      version: number;
      effective_from: string | Date;
    }>(
      "select id,service_code,base_price_paise,minimum_price_paise,version,effective_from from public.bridge_service_rates where active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by service_code",
      [],
    );
    const tax = await sql.query<{ id: string; rate_percent: number; effective_from: string | Date }>(
      "select id,rate_percent,effective_from from public.bridge_tax_rates where active=true and currency='INR' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc limit 1",
      [],
    );

    return {
      services,
      rates: rates.map((rate) => ({
        id: rate.id,
        serviceCode: rate.service_code,
        basePricePaise: Number(rate.base_price_paise),
        minimumPricePaise: Number(rate.minimum_price_paise),
        version: Number(rate.version),
        effectiveFrom: new Date(rate.effective_from).toISOString(),
      })),
      taxRate: tax[0]
        ? { id: tax[0].id, ratePercent: Number(tax[0].rate_percent), effectiveFrom: new Date(tax[0].effective_from).toISOString() }
        : null,
    };
  });
