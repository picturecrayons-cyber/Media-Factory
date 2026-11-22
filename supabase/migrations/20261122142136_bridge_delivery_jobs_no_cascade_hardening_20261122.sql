-- Forward-only hardening for the Testing Delivery Desk reconciliation.
-- Prevent title removal from cascading into delivery records; no hard-delete path.
begin;
alter table public.bridge_delivery_jobs
  drop constraint if exists bridge_delivery_jobs_title_id_fkey;
alter table public.bridge_delivery_jobs
  add constraint bridge_delivery_jobs_title_id_fkey
  foreign key (title_id) references public.bridge_titles(id) on delete restrict;
revoke all on table public.bridge_delivery_jobs from public, anon, authenticated;
grant select, insert, update on table public.bridge_delivery_jobs to authenticated;
grant all on table public.bridge_delivery_jobs to postgres, service_role;
commit;
