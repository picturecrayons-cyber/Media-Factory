# Crayons Bridge — Super Admin Workspace Presets
## Architecture and field mapping (2026-11-17)

**Status:** Architecture proposal only. No database migration has been applied and no Production data has been changed.

## 1. Goals

Reduce repeated entry in Title Workspace by letting an authorized Super Admin save and reuse:
- Operational defaults (company display context, default territory, default language, and TVOD workflow defaults).
- Agreement-specific legal/commercial templates (agreement reference, ownership-evidence reference, revenue-share split, exclusivity, and validity-window guidance).

Applying a preset may prefill a new **DRAFT** form. It must never approve rights, verify ownership, change an existing grant, mark a title READY, or publish to Loop.

## 2. Current form and server field mapping

Source: `src/components/bridge/workflow-desk.tsx`, `src/lib/bridge/workflow.ts`, and `src/lib/bridge/workflow-policy.ts`.

| Current UI field | Current submission field | Preset treatment |
| --- | --- | --- |
| Company context (currently shown as StreamVista OPC Pvt Ltd outside the form) | None | Operational display default only; not a rights assertion |
| Territory (currently hard-coded Worldwide) | `territories: ["WORLDWIDE"]` | Operational default; editable; server currently accepts WORLDWIDE only |
| Language (currently `title.language`) | `languages: [title.language]` | Operational default; initialize from title; editable only within supported server validation |
| License model (TVOD) | Server writes media `["CRAYONS_LOOP","TVOD"]` | Operational workflow default; cannot silently change server-side media scope |
| License starts | `windowStart` | Legal template may offer a suggested value; user must confirm |
| License ends | `windowEnd` | Legal template may offer a suggested value; user must confirm |
| Agreement reference | `agreementReference` | Legal template reference; never proof of execution |
| Ownership evidence reference | `ownershipReference` | Legal template reference; never proof of ownership or verification |
| Rights owner share (%) | `rightsOwnerSharePct` | Agreement-specific value; integer 0–100 |
| Distributor share (%) | Derived as `100 - rightsOwnerSharePct` | Derived only; both shares must total exactly 100 |
| Exclusive license | `exclusivity: EXCLUSIVE / NON_EXCLUSIVE` | Agreement-specific value; explicit selection required |

The current server validator requires one WORLDWIDE territory, a non-empty language list, ISO datetime values, agreement and ownership references of at least 8 characters, integer percentage shares totalling 100, and an end time after the start time. These checks remain authoritative.

## 3. Preset categories

### A. Operational preset
May contain:
- Display company/workspace name.
- Default territory (initial value WORLDWIDE; editable).
- Language behavior (default from title metadata).
- TVOD workflow label/default.
- Document-category guidance.

It must not contain user permissions, title ownership, reviewer identity, or approval state.

### B. Agreement-specific legal/commercial preset
May contain:
- Human-readable template name and agreement reference.
- Ownership-evidence reference (opaque document/asset reference preferred; legacy text reference may be retained where migration compatibility requires it).
- Rights-owner and distributor shares.
- Exclusivity.
- Suggested validity-window behavior.

A saved reference is only a reference. The application must not label a document verified merely because it appears in a preset. The legal reviewer must inspect the underlying evidence independently.

## 4. Proposed persistence model

Proposed server-only table: `private.bridge_workspace_presets`.

Suggested columns:
- `id uuid primary key`
- `preset_type text check in ('OPERATIONAL','LEGAL')`
- `name text not null`
- `version integer not null`
- `configuration jsonb not null`
- `status text check in ('DRAFT','ACTIVE','ARCHIVED')`
- `created_by text not null`, `updated_by text not null`
- `created_at timestamptz`, `updated_at timestamptz`

Constraints:
- Unique active version/name per preset type (final index definition to be confirmed against actual schema).
- Validate JSON configuration with Zod on every server read and write.
- Server-side only; no direct anon/authenticated Data API access.
- Super Admin only for create/update/archive/apply.
- Audit every create, version, activate, archive, and apply event.
- Version changes create a new version; do not rewrite historical versions.
- Never store contract files or source media in preset JSON.

This table is a proposal. It is **not** authorized for application to STAGING or PRODUCTION yet.

## 5. UI placement and behavior

Add **Settings → Workspace Presets** for verified Super Admin sessions only.

The page should provide:
1. Operational presets list and editor.
2. Agreement-specific legal/commercial presets list and editor.
3. Create new version / archive actions.
4. A preview of exactly which Title Workspace fields will be prefilled.
5. Apply-to-new-draft action only.

In Title Workspace:
- Add a preset selector above the TVOD draft fields.
- Applying a preset pre-fills a new unsaved form only.
- Keep dates visible and require explicit confirmation.
- Keep territory, language, exclusivity, agreement reference, evidence reference, and shares editable subject to server validation.
- Do not apply presets to existing grants.
- Do not submit automatically when a preset is selected.
- Keep the legal review checklist independent of preset values.

## 6. Authorization and legal separation

- Route and server handlers must resolve the authenticated actor from the server session, not from client-supplied role or user ID.
- Require verified email and `internalRole === "super_admin"` for preset management.
- Never rely on a hidden navigation link or UI-only check.
- A preset cannot grant a role or permission.
- Existing `reviewWorkflow` remains a separate action. The reviewer must be a different user from the draft creator; the preset creator is not treated as a reviewer.
- Approval/rejection always requires an explicit note and reviewer identity.
- No preset may set `bridge_rights_grants.status` to `VALID`, update `bridge_titles.status`, create a legal case, or publish Loop content.

## 7. Super Admin verification gates

Current code inspection confirms:
- `RequireBridge allow="super_admin"` checks the server-resolved profile role.
- `permissionsFor` gives verified Super Admin all registered permissions.
- `reviewWorkflow` checks the legal permission, requires a selected DRAFT grant, and rejects approval by the same user who created the grant.
- `canGrantInternalRole` permits Super Admin to grant internal roles, including Super Admin.

Still NOT VERIFIED:
- The live browser session user ID matches the single Production `super_admin` profile.
- The live session's server-resolved role matches the visible header label.
- Runtime denial behavior for non-Super Admin users on preset endpoints.
- Full audit-trail completeness for role grants and legal review.

These require a separate authenticated, read-only/runtime verification pass. Do not use a write-capable browser run or alter roles as a test.

## 8. Field-level acceptance tests

- Operational preset prefills only its allowlisted operational fields.
- Legal preset prefills only its allowlisted draft fields.
- Invalid percentages, missing references, malformed dates, and unsupported territory/language are rejected server-side.
- Selecting a preset never submits a draft.
- Saving a preset never creates a license grant.
- Applying a preset never mutates an existing grant.
- Creator, Studio, Buyer, Investor, Admin, QC Reviewer, Legal Reviewer, Finance, and Viewer are denied preset management.
- Verified Super Admin can manage presets; unverified Super Admin is denied.
- Draft creator cannot approve their own grant even after applying a preset.
- Independent reviewer approval remains an explicit, separately audited action.
- Existing license records and existing title workflow remain unchanged.

## 9. Execution boundary

- **STAGING DB:** READ-ONLY inspection only. Migration application requires separate approval after migration-history/schema reconciliation.
- **PRODUCTION DB:** HOLD / NOT CERTIFIED / NO WRITE.
- **GitHub:** proposal branch and Draft PR only.
- **Vercel:** no deployment/promotion; Preview only after schema and migration gates pass.
- **Cost:** ₹0; no paid services, upgrades, or browser automation.
- **Regression rule:** App-inu pani kittaruthu.
