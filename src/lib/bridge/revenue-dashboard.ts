import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";

type RevenueSummary = {
  available: boolean;
  reason?: string;
  recognizedRevenuePaise?: number;
  refundsPaise?: number;
  operatingCostsPaise?: number;
  netContributionPaise?: number;
  paidInvoiceValuePaise?: number;
  paidInvoiceCount?: number;
  pendingPaymentCount?: number;
  ordersWithRevenueCount?: number;
};

/**
 * Read-only, server-side revenue summary. Never derives cash receipts from title
 * lifecycle status or indicative licensing fees. Missing schema returns an
 * explicit unavailable state instead of invented zero-valued financial KPIs.
 */
export const getRevenueDeskSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.void())
  .handler(async ({ context }): Promise<RevenueSummary> => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "finance.read");

    try {
      const sql = await getSql();
      const [ledgerRows, invoiceRows, orderRows] = await Promise.all([
        sql.query<{
          revenue_paise: number | string;
          refunds_paise: number | string;
          costs_paise: number | string;
          orders_with_revenue: number | string;
        }>(
          `select
             coalesce(sum(amount_paise) filter (where entry_type='REVENUE'),0)::bigint as revenue_paise,
             coalesce(sum(amount_paise) filter (where entry_type='REFUND'),0)::bigint as refunds_paise,
             coalesce(sum(amount_paise) filter (where entry_type in ('INTERNAL_COST','PAYMENT_FEE')),0)::bigint as costs_paise,
             count(distinct service_order_id) filter (where entry_type='REVENUE')::bigint as orders_with_revenue
           from public.bridge_financial_ledger
           where currency='INR'`,
          [],
        ),
        sql.query<{
          paid_invoice_value_paise: number | string;
          paid_invoice_count: number | string;
        }>(
          `select
             coalesce(sum(greatest(total_paise-refunded_amount_paise,0)),0)::bigint as paid_invoice_value_paise,
             count(*)::bigint as paid_invoice_count
           from public.bridge_service_invoices
           where status in ('PAID','PARTIALLY_REFUNDED')`,
          [],
        ),
        sql.query<{ pending_payment_count: number | string }>(
          "select count(*)::bigint as pending_payment_count from public.bridge_service_orders where status='PAYMENT_PENDING'",
          [],
        ),
      ]);
      const ledger = ledgerRows[0];
      const invoices = invoiceRows[0];
      const orders = orderRows[0];
      if (!ledger || !invoices || !orders) {
        return { available: false, reason: "Financial summary could not be read; no financial figures are shown." };
      }
      const revenue = Number(ledger.revenue_paise);
      const refunds = Number(ledger.refunds_paise);
      const costs = Number(ledger.costs_paise);
      return {
        available: true,
        recognizedRevenuePaise: revenue - refunds,
        refundsPaise: refunds,
        operatingCostsPaise: costs,
        netContributionPaise: revenue - refunds - costs,
        paidInvoiceValuePaise: Number(invoices.paid_invoice_value_paise),
        paidInvoiceCount: Number(invoices.paid_invoice_count),
        pendingPaymentCount: Number(orders.pending_payment_count),
        ordersWithRevenueCount: Number(ledger.orders_with_revenue),
      };
    } catch {
      return {
        available: false,
        reason: "Commercial finance schema or database access is not ready. No financial figures are shown.",
      };
    }
  });
