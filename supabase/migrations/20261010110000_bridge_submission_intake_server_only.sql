-- Keep rights-intake metadata server-only.
-- Browser access is through the authenticated Bridge server function and RBAC.
revoke all on table public.bridge_title_submission_intake from anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate
  on table public.bridge_title_submission_intake to service_role;
