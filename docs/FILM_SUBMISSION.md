# Film submission ownership

Canonical workflow: Crayons Bridge `/submit-film` and `/studio/submit-film`.

Crayons Loop `/submit-film` and `/creator` only hand off to Bridge. They do not write `loop_titles` or localStorage.

Loop consumer tables are not deleted. Loop-owned form localStorage (`crayonsloop_creator_submissions`) is not a production source of truth and is not migrated.

A submission creates:

- `bridge_titles` DRAFT (same lifecycle as other titles)
- `bridge_submissions` status `submitted` with persisted rights certification (`bridge-rights-v1`)

Screener status is `pending` until validation exists. LOOP publication still requires rights + capture + ingest (`licenseTitleToLoop`). Schema: `migrations/0009_film_submissions.sql` (Preview apply after owner YES).
