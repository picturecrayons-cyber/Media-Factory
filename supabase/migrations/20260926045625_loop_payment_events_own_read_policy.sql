
create policy "loop_payment_events_own_read"
on public.loop_payment_events
for select
to authenticated
using ((select auth.uid()) = user_id);
