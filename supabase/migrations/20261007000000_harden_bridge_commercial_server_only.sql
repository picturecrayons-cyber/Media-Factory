-- Harden CRAYONS BRIDGE commercial engine to server-only database access.
-- Application authorization remains Better Auth + Bridge RBAC.
-- Data API roles must not have direct privileges on finance/commercial tables.

revoke all on table
  public.bridge_service_catalog,
  public.bridge_service_rates,
  public.bridge_tax_rates,
  public.bridge_service_quotes,
  public.bridge_service_quote_lines,
  public.bridge_service_orders,
  public.bridge_service_order_events,
  public.bridge_service_invoices,
  public.bridge_financial_ledger
from anon, authenticated;

grant select, insert, update, delete, references, trigger, truncate
on table
  public.bridge_service_catalog,
  public.bridge_service_rates,
  public.bridge_tax_rates,
  public.bridge_service_quotes,
  public.bridge_service_quote_lines,
  public.bridge_service_orders,
  public.bridge_service_order_events,
  public.bridge_service_invoices,
  public.bridge_financial_ledger
to service_role;

alter function public.bridge_service_margin_paise(uuid)
  set search_path = public, pg_temp;

revoke all on function public.bridge_service_margin_paise(uuid)
from public, anon, authenticated;

grant execute on function public.bridge_service_margin_paise(uuid)
to service_role;
