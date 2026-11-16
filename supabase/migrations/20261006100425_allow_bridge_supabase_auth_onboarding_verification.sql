alter table public.bridge_loop_identity_links
drop constraint if exists bridge_loop_identity_links_verification_method_check;

alter table public.bridge_loop_identity_links
add constraint bridge_loop_identity_links_verification_method_check
check (
  verification_method = any (
    array[
      'verified_email_reauthentication'::text,
      'manual_documented_review'::text,
      'supabase_auth_onboarding'::text
    ]
  )
);