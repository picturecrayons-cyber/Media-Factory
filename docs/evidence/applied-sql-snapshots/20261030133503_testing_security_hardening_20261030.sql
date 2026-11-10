
begin;

alter table public.bridge_title_duplicate_reviews enable row level security;
alter table public.bridge_title_reconciliation_snapshots enable row level security;
alter table public.bridge_title_reconciliation_events enable row level security;

revoke all on function public.bridge_duplicate_title_loop_release_allowed(text) from public;
revoke all on function public.bridge_duplicate_title_loop_release_allowed(text) from anon, authenticated;

commit;
