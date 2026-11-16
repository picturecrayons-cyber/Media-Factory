
create policy "deny_client_access" on public.bridge_creator_notifications for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_financial_ledger for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_catalog for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_costs for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_invoices for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_order_events for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_orders for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_quote_lines for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_quotes for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_rates for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_settlement_lines for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_service_settlement_rules for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_tax_rates for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.bridge_title_gate_certifications for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.legacy_creator_intake for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.loop_media_migration_queue for all to anon, authenticated using (false) with check (false);
create policy "deny_client_access" on public.loop_parental_controls for all to anon, authenticated using (false) with check (false);
