-- Private, token-hashed Studio organization invitations. No email delivery is performed by this schema.
create table if not exists private.bridge_organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  invitee_email text not null check (length(invitee_email) <= 320),
  membership_role text not null check (membership_role in ('admin','member','producer','dit')),
  token_hash char(64) not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by text not null references public.bridge_profiles(user_id),
  expires_at timestamptz not null,
  accepted_by text references public.bridge_profiles(user_id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);
create index if not exists bridge_organization_invites_email_idx
  on private.bridge_organization_invites(lower(invitee_email), created_at desc);
alter table private.bridge_organization_invites enable row level security;
revoke all privileges on table private.bridge_organization_invites from public, anon, authenticated;
grant all privileges on table private.bridge_organization_invites to service_role;
