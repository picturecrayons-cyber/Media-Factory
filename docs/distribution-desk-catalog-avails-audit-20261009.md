# Bridge catalog-avails audit — 2026-10-09

**Source:** shared Supabase project `mlmgugivsyoxzdgwkbpu`, read-only queries against `public.bridge_titles`, `bridge_rights_grants`, `bridge_qc_cases`, `bridge_legal_cases`, `bridge_asset_versions`, `bridge_loop_publications`, and `bridge_buyer_title_access`.

**Evidence timestamp:** 2026-10-09 (UTC query execution; this is a point-in-time snapshot, not a live availability guarantee).

## Executive result

- 25 active (non-merged) title rows; only 20 distinct normalized title names. This does not reconcile to the requested 21-title working list and indicates duplicate/alias cleanup is needed before bulk outreach.
- 1 row is marked `LIVE_FOR_BUYERS`; 23 are `DRAFT`; 0 are `LICENSING_READY`.
- Only 1 row has a master key and poster key; 0 title rows have a current valid `bridge_rights_grants` record, 0 QC case rows, 0 legal case rows, and 0 asset-version rows in the queried live schema snapshot.
- No active Loop publication authorization exists in the queried rows. Jananam 1947's only publication row is revoked.
- No inquiry table existed before this change. This PR adds a server-only intake/draft ledger; it does not connect a mailbox or send email.

**Decision:** no title should be represented as commercially available based on this snapshot. Missing, conflicting or stale evidence means **NEEDS REVIEW**, not “available”.

## Priority titles

| Requested title | Canonical record(s) found | Current status / evidence | Avails decision |
|---|---|---|---|
| Jananam 1947 | `legacy-film-7` plus two similarly named non-legacy rows | `legacy-film-7` is `LIVE_FOR_BUYERS`, but has 0 valid rights grants, 0 QC cases, 0 legal cases, 0 asset-version rows, and its one Loop publication row is revoked. The other two rows are `DRAFT` and `PREPARING`. | **HOLD** — no current verified avails; resolve duplicate records and restore/re-authorize only after evidence gates pass. |
| Koodal | No matching active title row found | No authoritative title record found by name search. | **NEEDS CATALOG MATCH** — do not create a guessed title or claim availability. |
| The Protector | No matching active title row found | No authoritative title record found by name search. | **NEEDS CATALOG MATCH** — do not create a guessed title or claim availability. |
| Bahumukham | `legacy-film-37` — “Bahumukham - Good, Bad & The Actor” | `DRAFT`, Telugu, 2024, 87 min; no rights, QC, legal, asset-version or publication evidence rows. | **HOLD** — no verified avails. |
| Vaathil | No matching active title row found | No authoritative title record found by name search. | **NEEDS CATALOG MATCH** — do not create a guessed title or claim availability. |

## Catalog integrity and gaps

1. **Name duplicates:** 25 active rows normalize to 20 names. Aandaal appears in three rows; Jananam 1947 appears in three rows. Do not auto-merge; use the existing duplicate-title review/merge controls and preserve provenance.
2. **Commercial fields are not proof of availability:** a zero fee, a populated licensing-fee field, a lifecycle status, or a stored master key is not a rights grant or signed deal.
3. **Missing evidence:** the query found no rows in `bridge_rights_grants`, `bridge_qc_cases`, `bridge_legal_cases`, or `bridge_asset_versions` for the active title set. Recheck after evidence is ingested; do not infer QC/legal pass from title status.
4. **Loop boundary:** only Bridge can authorize publication. A title status alone does not activate Loop distribution.
5. **Documents and screener:** chain-of-title/censor evidence and an authorized private screener must be reviewed through the existing Bridge gates before they can be referenced in a buyer-facing reply.
6. **MG / fee terms:** no MG or licensing term is asserted in this report. Values in metadata are not independently verified contract terms.

## First-milestone workflow in this PR

- An authorized Bridge legal/licensing operator records an inquiry with a source reference.
- Bridge creates a cautious response draft that confirms receipt and says availability/terms are under review.
- An authorized reviewer may edit the draft and explicitly approve the **draft record**.
- The record and reviewer action are audit logged. RLS is enabled with no client policies; access is through permission-checked server functions.
- There is intentionally **no outbound mail transport, send endpoint, mailbox listener, scheduled agent, or automatic buyer outreach** in this milestone. An approved draft is not a sent message.

## Repeatable verification query scope

The snapshot was derived from read-only aggregate queries over the tables listed above, excluding title rows with `merged_into_title_id IS NOT NULL`. Availability must be re-evaluated at the time of each future inquiry against current rights windows, restrictions/holdbacks, QC/legal evidence, buyer access, and approved screener authorization.
