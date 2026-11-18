import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertNotDevUser } from "./guards";
import { requireVerifiedActor } from "./session";

/**
 * Read-only operational payment and settlement oversight for Super Admin.
 * Omits buyer identity, email, checkout credentials, private settlement evidence and entitlement data.
 * Does not call Razorpay or mutate payment, invoice, ledger or entitlement records.
 */
export const listSuperAdminPaymentOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "super_admin") {
      throw new Error("Super Admin access required");
    }

    const sql = await getSql();
    const [groups, recent, settlementGroups, recentSettlements] = await Promise.all([
      sql<{
        status: string;
        currency: string;
        payment_count: number | string;
        total_amount_paise: number | string;
      }>`
        select status, currency, count(*)::int as payment_count,
               coalesce(sum(amount_paise), 0)::bigint as total_amount_paise
        from bridge_payments
        group by status, currency
        order by status, currency
      `,
      sql<{
        id: string;
        title_name: string | null;
        purpose: string;
        provider: string;
        status: string;
        amount_paise: number | string;
        currency: string;
        created_at: string | Date;
        verified_at: string | Date | null;
      }>`
        select p.id, t.name as title_name, p.purpose, p.provider, p.status,
               p.amount_paise, p.currency, p.created_at, p.verified_at
        from bridge_payments p
        left join bridge_titles t on t.id = p.title_id
        order by p.created_at desc
        limit 25
      `,
      sql<{
        status: string;
        currency: string;
        settlement_count: number | string;
        revenue_received_paise: number | string;
        creator_payable_paise: number | string;
        investor_payable_paise: number | string;
        bridge_share_paise: number | string;
      }>`
        select status, currency, count(*)::int as settlement_count,
               coalesce(sum(revenue_received_paise), 0)::bigint as revenue_received_paise,
               coalesce(sum(creator_payable_paise), 0)::bigint as creator_payable_paise,
               coalesce(sum(investor_payable_paise), 0)::bigint as investor_payable_paise,
               coalesce(sum(bridge_share_paise), 0)::bigint as bridge_share_paise
        from bridge_title_settlements
        group by status, currency
        order by status, currency
      `,
      sql<{
        id: string;
        title_name: string;
        revenue_received_paise: number | string;
        creator_payable_paise: number | string;
        investor_payable_paise: number | string;
        bridge_share_paise: number | string;
        currency: string;
        status: string;
        settled_at: string | Date | null;
        created_at: string | Date;
      }>`
        select s.id, t.name as title_name, s.revenue_received_paise,
               s.creator_payable_paise, s.investor_payable_paise,
               s.bridge_share_paise, s.currency, s.status, s.settled_at, s.created_at
        from bridge_title_settlements s
        join bridge_titles t on t.id = s.title_id
        order by s.created_at desc
        limit 50
      `,
    ]);

    const recentLedger = await sql<{
      id: string;
      title_name: string | null;
      entry_type: string;
      classification: string;
      amount_paise: number | string;
      currency: string;
      reference: string | null;
      created_at: string | Date;
    }>`
      select l.id, t.name as title_name, l.entry_type, l.classification,
             l.amount_paise, l.currency, l.reference, l.created_at
      from bridge_financial_ledger l
      left join bridge_titles t on t.id = l.title_id
      order by l.created_at desc
      limit 100
    `.then((rows) => ({ status: "AVAILABLE" as const, rows })).catch(() => ({
      status: "UNAVAILABLE" as const,
      rows: [],
    }));

    const invoices = await sql<{
      id: string;
      invoice_number: string;
      status: string;
      subtotal_paise: number | string;
      tax_paise: number | string;
      total_paise: number | string;
      currency: string;
      issued_at: string | Date;
      paid_at: string | Date | null;
      order_id: string;
    }>`
      select id, invoice_number, status, subtotal_paise, tax_paise,
             total_paise, currency, issued_at, paid_at, order_id
      from bridge_service_invoices
      order by issued_at desc
      limit 100
    `.then((rows) => ({ status: "AVAILABLE" as const, rows })).catch(() => ({
      status: "UNAVAILABLE" as const,
      rows: [],
    }));

    const ledger = await sql<{
      entry_type: string;
      classification: string;
      currency: string;
      entry_count: number | string;
      total_amount_paise: number | string;
    }>`
      select entry_type, classification, currency,
             count(*)::int as entry_count,
             coalesce(sum(amount_paise), 0)::bigint as total_amount_paise
      from bridge_financial_ledger
      group by entry_type, classification, currency
      order by currency, entry_type, classification
    `.then((rows) => ({ status: "AVAILABLE" as const, rows })).catch(() => ({
      status: "UNAVAILABLE" as const,
      rows: [],
    }));

    return {
      summary: groups.map((row) => ({
        status: row.status,
        currency: row.currency,
        paymentCount: Number(row.payment_count),
        totalAmountPaise: Number(row.total_amount_paise),
      })),
      recentPayments: recent.map((row) => ({
        reference: row.id,
        titleName: row.title_name,
        purpose: row.purpose,
        provider: row.provider,
        status: row.status,
        amountPaise: Number(row.amount_paise),
        currency: row.currency,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        verifiedAt: row.verified_at == null
          ? null
          : row.verified_at instanceof Date
            ? row.verified_at.toISOString()
            : String(row.verified_at),
      })),
      settlementSummary: settlementGroups.map((row) => ({
        status: row.status,
        currency: row.currency,
        count: Number(row.settlement_count),
        revenueReceivedPaise: Number(row.revenue_received_paise),
        creatorPayablePaise: Number(row.creator_payable_paise),
        investorPayablePaise: Number(row.investor_payable_paise),
        bridgeSharePaise: Number(row.bridge_share_paise),
      })),
      recentSettlements: recentSettlements.map((row) => ({
        reference: row.id,
        titleName: row.title_name,
        revenueReceivedPaise: Number(row.revenue_received_paise),
        creatorPayablePaise: Number(row.creator_payable_paise),
        investorPayablePaise: Number(row.investor_payable_paise),
        bridgeSharePaise: Number(row.bridge_share_paise),
        currency: row.currency,
        status: row.status,
        settledAt: row.settled_at == null ? null : row.settled_at instanceof Date ? row.settled_at.toISOString() : String(row.settled_at),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      })),
      invoices: {
        status: invoices.status,
        rows: invoices.rows.map((row) => ({
          reference: row.id,
          invoiceNumber: row.invoice_number,
          orderReference: row.order_id,
          status: row.status,
          subtotalPaise: Number(row.subtotal_paise),
          taxPaise: Number(row.tax_paise),
          totalPaise: Number(row.total_paise),
          currency: row.currency,
          issuedAt: row.issued_at instanceof Date ? row.issued_at.toISOString() : String(row.issued_at),
          paidAt: row.paid_at == null ? null : row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
        })),
      },
      ledger: {
        status: ledger.status,
        groups: ledger.rows.map((row) => ({
          entryType: row.entry_type,
          classification: row.classification,
          currency: row.currency,
          count: Number(row.entry_count),
          totalAmountPaise: Number(row.total_amount_paise),
        })),
      },
      recentLedger: {
        status: recentLedger.status,
        rows: recentLedger.rows.map((row) => ({
          reference: row.id,
          titleName: row.title_name,
          entryType: row.entry_type,
          classification: row.classification,
          amountPaise: Number(row.amount_paise),
          currency: row.currency,
          businessReference: row.reference,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        })),
      },
    };
  });
