import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";

export type CustomerService = {
  code: string;
  category: string;
  name: string;
  description: string | null;
  why: string | null;
  classification: "BILLABLE" | "PASS_THROUGH";
  pricingMethod: string;
  unitLabel: string;
  rateConfigured: boolean;
};

export const getCustomerServiceCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "service.catalog_read");

    const sql = await getSql();
    const rows = await sql.query<{
      code: string;
      category: string;
      name: string;
      description: string | null;
      why: string | null;
      classification: "BILLABLE" | "PASS_THROUGH";
      pricing_method: string;
      unit_label: string;
      rate_configured: boolean;
    }>(
      `select
         c.code,
         c.category,
         c.name,
         c.description,
         c.why,
         c.classification,
         c.pricing_method,
         c.unit_label,
         exists (
           select 1
           from public.bridge_service_rates r
           where r.service_code = c.code
             and r.active = true
             and r.currency = 'INR'
             and r.base_price_paise is not null
             and r.effective_from <= now()
             and (r.effective_to is null or r.effective_to > now())
         ) as rate_configured
       from public.bridge_service_catalog c
       where c.active = true
         and c.customer_visible = true
         and c.classification in ('BILLABLE', 'PASS_THROUGH')
       order by c.category, c.name`,
      [],
    );

    const taxRows = await sql.query<{ configured: boolean }>(
      `select exists (
         select 1
         from public.bridge_tax_rates
         where active = true
           and currency = 'INR'
           and effective_from <= now()
           and (effective_to is null or effective_to > now())
       ) as configured`,
      [],
    );

    return {
      services: rows.map((row) => ({
        code: row.code,
        category: row.category,
        name: row.name,
        description: row.description,
        why: row.why,
        classification: row.classification,
        pricingMethod: row.pricing_method,
        unitLabel: row.unit_label,
        rateConfigured: row.rate_configured,
      })),
      taxConfigured: taxRows[0]?.configured === true,
      quoteConfigurationReady:
        rows.length > 0 &&
        rows.every((row) => row.rate_configured) &&
        taxRows[0]?.configured === true,
    };
  });
