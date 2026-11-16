-- CRAYONS BRIDGE commercial control plane: idempotency and reversal hardening.

alter table public.bridge_service_costs
  add column if not exists idempotency_key text;

create unique index if not exists bridge_service_costs_idempotency_uq
  on public.bridge_service_costs(idempotency_key)
  where idempotency_key is not null;

alter table public.bridge_financial_ledger
  drop constraint if exists bridge_financial_ledger_entry_type_check;

alter table public.bridge_financial_ledger
  add constraint bridge_financial_ledger_entry_type_check
  check (entry_type in (
    'REVENUE','INTERNAL_COST','PASS_THROUGH','TAX','PAYMENT_FEE',
    'REFUND','CHARGEBACK','CHARGEBACK_REVERSAL','SETTLEMENT'
  ));
