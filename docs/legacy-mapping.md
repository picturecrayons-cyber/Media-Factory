# Legacy → Crayons Bridge mapping

Dry-run only. **No production import** until a later written owner approval.

Source inputs (Django / StreamVista dumps, zip extracts) stay **private**. Do not commit JSON dumps, zip archives, or PII.

## Title fields

| Legacy | Canonical | Notes |
|---|---|---|
| `id` / `pk` | `legacyId` | Required. Stored later as `bridge_titles.legacy_id`. |
| `title` / `name` | `name` | Required. |
| `title_ml` / `malayalam_title` | `nameMl` | Optional. |
| `synopsis` / `description` | `synopsis` | Empty string if missing. |
| `language` / `original_language` | `language` | Defaults to Malayalam. |
| `year` / `release_year` | `year` | Integer or null. |
| `runtime` / `runtime_minutes` | `runtimeMinutes` | Integer or null. |
| `creator_id` / `creator_owner_id` / `owner` | `ownerUserId` | Must resolve to a Bridge user before any future import. |
| `status` | **always `DRAFT`** | Legacy live/licensed states are not trusted. |

## Dry-run

```bash
node --experimental-strip-types scripts/legacy-migrate.mjs --file /private/path/titles.json
```

`--apply` is refused. Reconciliation report includes `sourceCount`, `mappedCount`, and `skipped`.

## After a future import approval

1. Resolve `ownerUserId` to existing `bridge_profiles`.
2. Insert titles as `DRAFT` only.
3. Re-run QC / rights before `LIVE_FOR_BUYERS`.
4. Never copy fake entitlements, PIN gates, or Loop catalog rows.
