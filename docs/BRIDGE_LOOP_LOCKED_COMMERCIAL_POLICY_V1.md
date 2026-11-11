# Bridge → Loop Locked Commercial Policy v1

Status: BUSINESS POLICY LOCKED; implementation is in Draft PR; not certified.

## Default rule

- Master distributor: StreamVista OPC Pvt Ltd / Crayons Bridge.
- Agreement: Master Exclusive Distribution Agreement with a minimum initial term of five (5) years.
- Scope: worldwide only to the extent the Content Owner owns or controls and expressly grants the relevant rights.
- Rights managed by Bridge: linear, non-linear and ancillary rights, subject to the actual grant.
- Sublicensing: Bridge may sublicense to approved buyers only within the granted scope, territory, language, media, term and restrictions.
- Default net-receipts split: Content Owner 65%; Bridge 35%.
- Permitted deductions before split: applicable taxes, refunds, chargebacks and payment-gateway fees only. Ordinary Bridge operating expenses are not deducted from the Owner share.
- Loop: TVOD only in the current scope. Loop is a Bridge-authorized consumer destination, not a separate rights authority.
- Renewal: mutual written agreement.
- Exceptions: title-specific, written, authorized and auditable. No silent overrides.
- A Loop listing suspension or removal does not itself terminate the Bridge–Owner master agreement. Existing buyer sublicenses and transition/termination treatment must be addressed in the signed agreement.

## Publication gates

The current Loop preflight must fail closed unless the grant is valid, WORLDWIDE, TVOD, explicitly windowed, QC-approved, legally approved and exactly 65/35. The 5-year Master Exclusive agreement remains a separate legal gate: the current inspected schema does not yet establish a verified signed-agreement record with signer, signed timestamp, effective term dates and exclusive grant. Do not infer that a rights grant window is the same as the master agreement term. Until that schema and evidence contract exist, mark the five-year agreement gate NOT VERIFIED and do not certify publication.

## Bridge B2B interface vocabulary

Use business-to-business operational language:
- Creator/Studio action: **Submit** / **Submit Files** (not “Upload” as the primary workflow action).
- Bridge action: **Authorize Loop Listing** (not “Publish”).
- Destination status: **Listed on Loop** / **Not Listed**. “Published” may remain an internal database/API field only; it is not preferred Bridge-facing status copy.
- Buyer distribution status: **Available to Buyers** or **Delivered**, only when supported by the actual buyer workflow.
- Do not change internal identifiers, database columns, permissions or API names solely to match display wording.

## STAGING-only migration planning — NOT EXECUTED

Target: Supabase Testing DB `jbymleftneggcgutlcqu` (STAGING).
Action: prepare migration plan only.
Access: READ-ONLY during discovery; any eventual migration is WRITE and requires a reviewed, separately approved SQL migration.
Risk: HIGH until per-table ownership, reviewer and finance access are proven.

Four tables previously identified with RLS enabled but no policies:
- `bridge_rights_evidence`
- `bridge_rights_evidence_reviews`
- `bridge_settlement_reference_claims`
- `bridge_settlement_reference_claim_events`

Before writing policies:
1. Inspect complete columns, PK/FK relationships, triggers, views, grants, and all application read/write paths.
2. Map each table to its real principal and permitted operations. Do not assume all four tables use the same owner predicate.
3. Verify identity mapping: Bridge actor identity and `auth.uid()` mapping; do not use user-editable metadata for authorization.
4. Define SELECT/INSERT/UPDATE/DELETE policies separately. UPDATE needs both USING and WITH CHECK plus a valid SELECT policy.
5. Keep evidence review and settlement approval restricted to authorized legal/finance/internal roles; creator/studio may only access their own permitted evidence.
6. Revoke unnecessary anon/authenticated grants; grant only required table privileges. RLS is not a substitute for least-privilege grants.
7. Test anon, unrelated authenticated user, owning Creator, same-organization Studio member, legal reviewer, finance reviewer and super-admin.
8. Run Supabase security advisors and verify no unintended access before calling PASS.

No SQL is applied by this document. No Production database is in scope.

## Release gates

- GitHub CI must pass on the exact Draft PR head SHA.
- Vercel Preview must be for that same SHA and the Bridge project.
- Authenticated role-based Preview tests must verify Submit, files, QC, rights/legal, commercial agreement, buyer delivery, Loop TVOD listing, acknowledgement, playback authorization and revocation.
- No merge, promotion, Production migration or Production deployment is authorized by this policy document.
