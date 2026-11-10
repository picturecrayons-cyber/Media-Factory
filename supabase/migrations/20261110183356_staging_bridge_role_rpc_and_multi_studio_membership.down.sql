-- STAGING rollback for 20261110183356.
-- Preflight recorded no legacy single-active-organization index on this STAGING DB,
-- so rollback drops only the new wrapper and does not recreate that legacy constraint.
drop function if exists public.bridge_current_internal_role();
