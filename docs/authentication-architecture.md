# Authentication Architecture

Crayons Bridge production authentication uses Supabase Auth for user identity and sessions.

Bridge application authorization is separate. Bridge profiles and RBAC determine account type, internal role, and permissions after the authenticated identity is verified.

## Canonical flow

```text
Login or signup
  -> Supabase Auth
  -> authenticated session
  -> protected server function
  -> server-side identity verification
  -> Bridge profile resolution
  -> Bridge RBAC
  -> authorized operation
```

## Identity mapping

The Supabase user ID is the authentication identity. Bridge resolves that identity through its profile and identity-link records before applying application permissions.

Normal public onboarding account types are independent creator, studio, buyer, and investor. The selected public role is an account-type request used to complete the Bridge profile and route the user to the matching workspace; it is not proof of permission to read or mutate any record.

Google OAuth uses Supabase Auth authorization-code/PKCE flow. The selected signup role is carried as a same-tab signup hint through the OAuth redirect, then reconciled with the authenticated Bridge profile. Existing profiles retain their server-resolved account type; client metadata and redirect parameters never grant roles.

Investor registration is public. Investor workspace access is limited to records explicitly assigned to that verified Bridge profile. Public signup does not grant internal staff roles, unassigned title visibility, investment terms belonging to another investor, or internal cost/margin data.

Internal roles are not granted by normal signup and require the server-controlled invite flow.

## Security boundary

- User passwords are managed by Supabase Auth.
- Public client configuration is not treated as authorization.
- Privileged database, storage, payment, and mail credentials remain server-side.
- Protected operations require verified identity and Bridge-side permission checks.
- Invite and verification credentials are hashed where the implementation requires persisted comparison.
- Authentication or authorization uncertainty must fail closed.

## Legacy authentication code

Older Better Auth and Grok-era authentication code and schema artifacts remain in the repository. They are legacy/transitional infrastructure and are not the canonical production login, signup, or protected server-function authorization path.

Do not remove legacy authentication infrastructure as part of documentation-only work. Cleanup belongs in a separate change after proving that no active runtime dependency remains.

## Production invariant

**Supabase Auth = identity/session authority.**

**Bridge database + RBAC = application authorization authority.**
