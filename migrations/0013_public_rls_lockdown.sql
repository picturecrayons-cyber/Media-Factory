-- Public-schema RLS lockdown for Crayons Bridge.
-- Apply first to staging; production rollout requires a separate release approval.
-- Tables without a policy intentionally default-deny client access until their
-- intended access model is reviewed. Server-side owner/service-role paths remain
-- subject to their own credentials and must never be exposed to browser clients.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    '_migrations',
    'bridge_assets',
    'bridge_audit_logs',
    'bridge_dmca_registrations',
    'bridge_email_challenges',
    'bridge_entitlements',
    'bridge_invites',
    'bridge_loop_identity_links',
    'bridge_loop_publications',
    'bridge_payments',
    'bridge_profiles',
    'bridge_title_events',
    'bridge_titles',
    'bridge_webhook_events',
    'config_revisions',
    'entitlements',
    'loc_jobs',
    'loop_entitlements',
    'loop_profiles',
    'loop_subscriptions',
    'loop_titles',
    'loop_watch_progress',
    'loop_watchlist',
    'platform_meta',
    'profiles',
    'qc_jobs',
    'revenue_events',
    'screeners',
    'submissions',
    'subscriptions',
    'territories',
    'titles',
    'transfers',
    'watchlist'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

-- These 21 tables previously had broad client grants and no active RLS.
-- Remove Data API table privileges pending per-table policy/grant design.
REVOKE ALL PRIVILEGES ON TABLE
  public.bridge_dmca_registrations,
  public.config_revisions,
  public.entitlements,
  public.loc_jobs,
  public.loop_entitlements,
  public.loop_profiles,
  public.loop_subscriptions,
  public.loop_titles,
  public.loop_watch_progress,
  public.loop_watchlist,
  public.platform_meta,
  public.profiles,
  public.qc_jobs,
  public.revenue_events,
  public.screeners,
  public.submissions,
  public.subscriptions,
  public.territories,
  public.titles,
  public.transfers,
  public.watchlist
FROM anon, authenticated;

-- Do not add permissive policies here. Add narrowly scoped policies and grants
-- only after confirming each table's intended API/client access.
