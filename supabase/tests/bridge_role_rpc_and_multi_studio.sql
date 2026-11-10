begin;

select plan(5);

select ok(
  to_regprocedure('public.bridge_current_internal_role()') is not null,
  'public Bridge role wrapper exists'
);

select ok(
  has_function_privilege('authenticated', 'public.bridge_current_internal_role()', 'EXECUTE'),
  'authenticated can call the role wrapper'
);

select ok(
  not has_function_privilege('anon', 'public.bridge_current_internal_role()', 'EXECUTE'),
  'anon cannot call the role wrapper'
);

select ok(
  to_regclass('public.bridge_organization_memberships_one_active_org_per_user') is null,
  'legacy one-active-organization index is absent'
);

select ok(
  to_regclass('public.bridge_organization_memberships_user_status_org_idx') is not null,
  'multi-Studio membership lookup index exists'
);

select * from finish();
rollback;
