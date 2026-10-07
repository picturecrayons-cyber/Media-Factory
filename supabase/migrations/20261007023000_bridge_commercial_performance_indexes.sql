-- Index the new commercial foreign keys used on high-frequency reconciliation paths.

create index if not exists bridge_financial_ledger_payment_idx
  on public.bridge_financial_ledger(payment_id, created_at desc);

create index if not exists bridge_service_costs_service_idx
  on public.bridge_service_costs(service_code, created_at desc);

create index if not exists bridge_service_orders_payment_idx
  on public.bridge_service_orders(payment_id);

create index if not exists bridge_service_quote_lines_rate_idx
  on public.bridge_service_quote_lines(rate_id);

create index if not exists bridge_service_quote_lines_service_idx
  on public.bridge_service_quote_lines(service_code);

create index if not exists bridge_service_settlement_lines_rule_idx
  on public.bridge_service_settlement_lines(rule_id);

