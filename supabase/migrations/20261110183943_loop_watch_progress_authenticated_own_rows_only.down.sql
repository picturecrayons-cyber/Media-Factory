-- STAGING rollback for 20261110183943.
drop policy if exists loop_watch_progress_select_own on public.loop_watch_progress;
drop policy if exists loop_watch_progress_insert_own on public.loop_watch_progress;
drop policy if exists loop_watch_progress_update_own on public.loop_watch_progress;
revoke all on table public.loop_watch_progress from authenticated;
