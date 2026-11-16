
revoke all on table public."user" from anon, authenticated;
revoke all on table public.account from anon, authenticated;
revoke all on table public.session from anon, authenticated;
revoke all on table public.verification from anon, authenticated;
revoke all on table public.bridge_loop_publications from anon, authenticated;

create index if not exists loop_payment_events_user_id_idx
  on public.loop_payment_events(user_id);
create index if not exists loop_subscriptions_plan_id_idx
  on public.loop_subscriptions(plan_id);
create index if not exists loop_user_tvod_entitlements_title_id_idx
  on public.loop_user_tvod_entitlements(title_id);
create index if not exists loop_watch_progress_title_id_idx
  on public.loop_watch_progress(title_id);
create index if not exists poster_jobs_user_id_idx
  on public.poster_jobs(user_id);
