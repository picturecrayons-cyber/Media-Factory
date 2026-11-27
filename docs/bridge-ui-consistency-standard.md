# Crayons Bridge UI Consistency Standard

Status: proposed implementation contract  
Scope: all public, authenticated, account-specific, administrative, and internal Bridge routes  
Implementation policy: Preview-first; no role, permission, workflow, data, or release-gate changes are implied by visual standardization.

## 1. Non-negotiable product rules

- One visual system; role-specific navigation, data, and actions remain distinct.
- UI visibility is not authorization. Server-side RBAC and ownership checks remain authoritative.
- Never expose a module or action to an account that does not already have permission.
- Do not manufacture workflow completion, QC results, rights evidence, legal approvals, delivery evidence, publication authorization, payment, or revenue.
- Preserve existing API contracts, query keys, mutation semantics, audit events, and database schemas during presentation-only changes.
- Any workflow or permission change must be isolated into a separately reviewed change set.

## 2. Route inventory

The generated route tree currently includes:

- Public: `/`, `/contact`, `/privacy`, `/terms`
- Authentication and onboarding: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/callback`, `/auth/confirm`, `/onboarding`
- Account workspaces: `/creator`, `/studio`, `/buyer`, `/investor`, `/account`, `/workspace`, `/deliveries`, `/title/$id`
- Internal and administration: `/dashboard`, `/internal`, `/admin`, `/admin/workstations`, `/admin-cms`, `/cms`, `/loop-cms`
- Application entry: `/app`, `/submit-film`

API and machine routes are excluded from visual redesign except for error/health surfaces that are intentionally user-facing.

## 3. Shared page frame

All authenticated Bridge pages should use one shared page-frame contract:

- Main content maximum width: 1440px.
- Horizontal gutters: 16px mobile, 24px small desktop, 32px wide desktop.
- Main vertical padding: 24px desktop; 16px mobile.
- Content sections use a consistent 24px vertical rhythm, with 16px within compact groups.
- No nested page-level max-width wrapper unless a documented focused-content exception applies (forms, legal text, or reading views).
- Tables and media grids may scroll within their own bounded containers; the page itself must not gain horizontal overflow.

The public marketing site may use a separate marketing frame, but its typography, spacing scale, controls, and accessibility tokens should derive from the same foundation.

## 4. Page heading contract

Authenticated pages receive their primary H1 from the shared shell. Route content must not render a second H1.

- Eyebrow: optional, small, uppercase, consistent tracking.
- H1: one per page; shared size, weight, and spacing.
- Description: optional, concise, readable, and directly below the H1.
- Primary action: aligned to the heading block on wide screens; stacked below it on narrow screens.
- Section headings: H2; subsection headings: H3. Do not skip levels for visual sizing.
- Heading text describes the user's task, not internal implementation names.

## 5. Component standards

### Panels and cards
- Use shared surface, border, radius, and padding tokens.
- Default panel radius: 14px; compact controls may use 10px.
- Standard panel padding: 16px mobile, 20px desktop.
- Avoid mixing square, pill, and oversized rounded treatments within the same component family.
- Use elevation sparingly; hierarchy should primarily come from spacing and typography.

### Buttons and controls
- Reuse the shared Button component and its semantic variants.
- Primary, secondary/outline, quiet, and destructive actions must be visually distinguishable.
- Minimum interactive target: 44px where practical.
- Every icon-only control requires an accessible name.
- Disabled, loading, success, and error states must be explicit; do not communicate state by color alone.

### Navigation
- Reuse shared shell navigation and active-state treatment.
- Desktop navigation may be horizontal or role-specific sidebar, but its placement and active-state semantics must remain consistent.
- Mobile navigation must remain keyboard accessible and horizontally usable without clipping.
- Preserve role-based navigation filtering; do not add links to solve visual inconsistency.

### Tables and lists
- Standardize header typography, cell padding, row dividers, alignment, and empty/loading/error states.
- Numeric values align consistently; dates and currency use shared formatters.
- Wide tables scroll inside a labelled container on mobile.
- Empty states explain why no records appear and identify the next permitted action without implying missing approvals.

### Status and workflow labels
- Use one shared status component and canonical label map.
- Keep persisted status values separate from display labels.
- Use consistent wording and capitalization across Creator, Studio, Buyer, Investor, Super Admin, and Internal Operations.
- Status color is supplemental; always show readable text.
- Preserve the workflow vocabulary: Upload → QC → Rights → License → Deliver → Earn.

### Forms and dialogs
- Standardize label, helper, validation, error, and required-field placement.
- Preserve server validation and permission checks.
- Confirm destructive or irreversible actions; never make a visual redesign silently change action semantics.

## 6. Language and content style

- Use sentence case for page titles, section headings, tabs, and buttons unless a proper product name requires otherwise.
- Use action verbs consistently: Save, Submit, Review, Approve, Reject, Authorize, Suspend, Revoke, Deliver.
- Do not use Approve/Publish/Live as synonyms.
- Distinguish a draft, a submitted request, an approved record, an authorized publication, and a publicly available title.
- Use one canonical label per workflow status; avoid duplicate synonyms across modules.
- Keep helper text short, specific, and factual. Error messages should state what failed and whether a retry is safe.

## 7. Role-specific experience

The visual system is shared, but each account remains functionally distinct:

- Creator: own titles, upload/preparation, submissions, status and delivery updates.
- Studio: organization-owned titles, team/production workflows, deliveries and account controls permitted to the studio.
- Buyer: discoverable authorized catalogue, own licenses and entitlements.
- Investor: assigned portfolio and participation records only; no title-editing controls unless separately authorized.
- Super Admin: administrative control plane, review queues, policy and audit tools.
- Internal Operations: only the queues and operational actions granted to the operator's internal role.

The route guard, server permission checks, data ownership filters, and account-scoped query keys must remain intact.

## 8. Accessibility and responsive acceptance

- One H1 per page; semantic H2/H3 hierarchy.
- Keyboard access and visible focus for all interactive elements.
- Form controls have programmatic labels and associated errors.
- Status and validation states do not rely on color alone.
- Respect reduced-motion preferences.
- No horizontal page overflow at 320px, 375px, 768px, 1024px, and 1440px widths.
- Test zoom/reflow at 200%.
- Preserve sufficient contrast for text, borders, focus, and disabled controls.

## 9. Implementation sequence

1. Inventory routes and current page-level layout overrides.
2. Establish shared PageFrame, PageHeader, SectionHeader, Panel, Status, and table primitives.
3. Migrate one representative route per account type.
4. Verify visual parity and role-specific content before migrating remaining routes.
5. Migrate title workspace and QC/Rights/License/Delivery/Revenue modules.
6. Migrate internal/admin desks and public/auth/onboarding pages.
7. Run route smoke tests, role-isolation tests, keyboard checks, and responsive screenshots.
8. Verify the exact Preview commit and review regressions before any Production consideration.

## 10. Required release evidence

- Exact commit SHA and successful build/typecheck/lint/test gates.
- Route-by-route desktop and mobile screenshots for all account types.
- Authenticated role matrix proving each account sees only its authorized modules/actions.
- No new client-side access to server-only tables or protected records.
- No workflow state, database, payment, rights, QC, legal, publication, or audit mutations from presentation-only changes.
- Production remains unchanged until Preview evidence and explicit release approval are complete.
