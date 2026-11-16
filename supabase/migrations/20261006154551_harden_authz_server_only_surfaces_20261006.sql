
alter function public.loop_parental_controls_set_updated_at()
  set search_path = public, pg_temp;

alter function public.bridge_title_buyer_visibility(text)
  set search_path = public, pg_temp;

alter function public.bridge_assert_buyer_publishable(text)
  set search_path = public, pg_temp;

revoke all on table public.loop_parental_controls from anon, authenticated;
revoke all on table public.bridge_title_gate_certifications from anon, authenticated;
