-- A submitted license is a durable Bridge record awaiting independent legal review.
-- Preserve existing DRAFT records for compatibility; new TVOD submissions use SUBMITTED.
alter table public.bridge_rights_grants
  drop constraint if exists bridge_rights_grants_status_check;

alter table public.bridge_rights_grants
  add constraint bridge_rights_grants_status_check
  check (status in ('DRAFT', 'SUBMITTED', 'VALID', 'EXPIRED', 'REVOKED'));
