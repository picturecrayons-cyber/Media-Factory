# Buyer Organization Isolation — Design Draft

Status: REVIEW REQUIRED — NOT IMPLEMENTED AS A DATABASE MODEL

## Scope

Crayons Bridge remains the authoritative B2B control plane. Buyer organizations receive access only through explicit Bridge grants. Crayons Loop remains downstream delivery only.

This draft proposes an organization-level Buyer model without changing Production or applying any database migration.

## Source findings

1. The current buyer title grant table, `bridge_buyer_title_access`, is keyed by `(title_id, buyer_user_id)`. It supports individual Buyer grants, not Buyer-organization grants.
2. `bridge_organizations` and `bridge_organization_memberships` were introduced with a Studio RBAC purpose. The migration has no organization-type discriminator.
3. The current organization migration creates a partial unique index allowing only one active organization membership per user. Do not reuse this structure for Buyer organizations without reconciling that constraint and the separately approved multiple-Studio-membership requirement.
4. License package reservation currently identifies one `buyer_user_id`. It has no Buyer organization reservation identity.
5. Application SQL uses a privileged server connection, so RLS alone is not sufficient. Every Buyer server action and signed-URL path must enforce organization membership and title/package grants explicitly.

## Recommended model for review

Keep Buyer organization membership separate from Studio membership until the existing organization migration and RLS model are fully reconciled.

Proposed additive entities (names are provisional):

- `bridge_buyer_organizations`: canonical Buyer organization identity, legal name, status, audit timestamps.
- `bridge_buyer_organization_memberships`: organization ID, Bridge user ID, role, membership status, approval metadata, created/updated timestamps. Support multiple active Buyer organizations per user if the business rules allow it; do not infer membership from email domain or organization display name.
- `bridge_buyer_organization_title_access`: title ID, Buyer organization ID, grantor, granted/expiry/revocation timestamps, evidence and audit references.
- Extend package reservation only after defining the distinction between the purchasing member and the organization that owns the resulting entitlement. A reservation should record both the organization scope and the member who initiated payment; payment capture must verify that member still belongs to the reserved organization.

## Required server-side rules

1. A Buyer can read a title only when the title is publishable AND the Buyer has an active, unexpired individual grant OR belongs to an active organization with an active, unexpired organization grant.
2. Revoked, expired, suspended, removed, or ambiguous memberships fail closed.
3. A Buyer must not discover another organization's package names, prices, negotiation state, payment state, assets, downloads, delivery metadata, or entitlement records.
4. A package reservation is atomic. The same package cannot be reserved by two distinct Buyer organizations or users. Concurrent retries by the same purchasing member must return the same payment/order record, not create duplicate external payment orders.
5. Payment capture, reservation ownership validation, package licensing, entitlement creation, and audit event must commit atomically.
6. Signed asset URLs must be issued only after title grant, organization membership, package entitlement, asset class, and delivery authorization checks.
7. Organization membership removal or suspension must immediately stop future reads and signed URL issuance. Existing signed URLs must have short, bounded lifetimes.
8. Buyer organizations cannot authorize titles or external rights. Only the Bridge Admin/Legal authorization workflow can authorize publication/licensing/delivery.

## Required tests

- Buyer A cannot read Buyer B's individual grant or package.
- Buyer Org A cannot read Buyer Org B's title, package, negotiation, payment, entitlement, asset, or delivery data.
- One user in multiple Buyer organizations receives only the data granted to each membership.
- Suspended/revoked membership and expired/revoked grants deny access.
- A stale payment from one buyer cannot license a package reserved by another buyer or organization.
- Concurrent package reservation attempts by different buyers/organizations produce one winner.
- Concurrent retries using the same idempotency key return one persisted payment/order and do not create duplicate provider orders.
- Revoking membership prevents new signed URL issuance.
- RLS and server-side authorization agree; service-role queries do not bypass application checks.

## Current implementation status

- Individual buyer title grants are now checked in the Buyer catalog, title detail, rights/package listing, asset listing/download, and license-order server paths on the isolated implementation branch.
- Buyer package listings now filter to unclaimed offers or packages reserved/licensed by the current Buyer.
- Package payment capture now validates the reserving buyer and performs payment capture, package licensing, entitlement insertion, and audit write in one database transaction.
- This is not Buyer organization support. The Buyer organization schema, membership approval workflow, organization grants, and organization-scoped package entitlement remain NOT IMPLEMENTED.

## Database and release safety

- STAGING DB: READ-ONLY. This document is a code-repository design draft only; no migration was applied.
- PRODUCTION DB: READ-ONLY / HOLD / NOT CERTIFIED / NO-GO.
- No PR, merge, Preview build, deployment, or Vercel action is authorized by this draft.
- Do not create new tables or change RLS/grants until the complete STAGING migration history, current schema, policies, and privilege model are reconciled and a separate write approval is given.
