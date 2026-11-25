import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPermission } from "./rbac";
import { requireVerifiedActor } from "./session";

export const listFinanceDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "finance") throw new Error("Finance role required");
    assertPermission(actor, "finance.read");
    assertPermission(actor, "razorpay.orders_read");
    assertPermission(actor, "finance.payouts_read");
    const sql = await getSql();
    const [payments, payouts, channelPayments] = await Promise.all([
      sql.unsafe("select id,user_id,title_id,purpose,provider,provider_order_id,provider_payment_id,amount_paise,currency,status,verified_at,provider_fee_paise,provider_tax_paise,refunded_amount_paise,chargeback_amount_paise,provider_failure_reason,created_at from bridge_payments order by created_at desc limit 200"),
      sql.unsafe("select id::text,order_id::text,beneficiary_type,beneficiary_user_id,basis,percentage_bps,amount_paise,status,paid_at,created_at from bridge_service_settlement_lines order by created_at desc limit 200"),
      sql.unsafe("select id::text,statement_line_id::text,estimate_available_at,payment_due_at,payment_posted_at,paid_amount_minor,payment_reference,payment_status,created_at from bridge_channel_payment_schedule order by created_at desc limit 200"),
    ]);
    return { payments: JSON.parse(JSON.stringify(payments)), payouts: JSON.parse(JSON.stringify(payouts)), channelPayments: JSON.parse(JSON.stringify(channelPayments)) };
  });
