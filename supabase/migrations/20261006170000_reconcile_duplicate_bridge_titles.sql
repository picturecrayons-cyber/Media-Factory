-- Bridge duplicate-title reconciliation
-- Safe/idempotent cleanup of records already verified as empty DRAFT duplicates.
-- Rights-ambiguous Aandaal and Telugu Pranayam 1947 records are intentionally untouched.
--
-- Canonical records retained:
--   legacy-film-7  -> Jananam 1947 Pranayam Thudarunnu
--   legacy-film-48 -> Sri Balaji Photo Studio
--
-- Preconditions are fail-closed: a duplicate is removed only when it has no
-- dependent Bridge/Loop/legacy-link records.

begin;

delete from public.bridge_titles t
where t.id = '4334e6029497ba74d042cb49157d6ccc'
  and t.status = 'DRAFT'
  and not exists (select 1 from public.bridge_assets x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_asset_versions x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_qc_cases x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_legal_cases x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_rights_grants x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_destination_packages x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_buyer_title_access x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_loop_publications x where x.title_id = t.id)
  and not exists (select 1 from public.loop_titles x where x.bridge_title_id = t.id)
  and not exists (select 1 from public.streamvista_legacy_links x where x.bridge_title_id = t.id);

delete from public.bridge_titles t
where t.id = 'legacy-film-49'
  and t.status = 'DRAFT'
  and not exists (select 1 from public.bridge_assets x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_asset_versions x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_qc_cases x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_legal_cases x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_rights_grants x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_destination_packages x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_buyer_title_access x where x.title_id = t.id)
  and not exists (select 1 from public.bridge_loop_publications x where x.title_id = t.id)
  and not exists (select 1 from public.loop_titles x where x.bridge_title_id = t.id)
  and not exists (select 1 from public.streamvista_legacy_links x where x.bridge_title_id = t.id);

commit;
