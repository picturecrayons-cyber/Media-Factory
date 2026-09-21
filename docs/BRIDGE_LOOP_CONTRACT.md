# Bridge → Loop publishing contract

Owner: StreamVista OPC Pvt Ltd  
Products: CRAYONS BRIDGE (system of record) · CRAYONS LOOP (viewer OTT)  
Canonical Supabase: `uakpqqardziifcwzvgfx` only  
Forbidden refs: `tqzimuwozhipqgyerdff`, `jpfyhahrdxbtwximsglj`  
Status: **contract + additive schema on `feat/crayons-bridge-production`**. Loop catalog ingest is Prompt 7. This file does not promote production.

## Rule

Bridge owns content identity, masters, QC, rights, windows, and publishing permission.  
Loop owns viewer accounts, subscriptions, rentals, watch progress.  
Loop must not recreate Bridge rights/licensing.  
A Loop viewer is never a Bridge creator/studio account.

Two different handoffs exist and must stay separate:

| Channel | Table | What moves | When |
|---|---|---|---|
| B2B buyer delivery | `bridge_deliveries` + `bridge_loop_releases` | Short-lived **private master** GET after Razorpay **capture** | Buyer/license desk |
| Loop catalog publish | `bridge_loop_publications` | **Derived** playback (H.264 MP4 or HLS) + catalog metadata | After QC + rights + window + playback READY |

`licenseTitleToLoop` today posts `masterKey`. That is **not** a catalog publish. Prompt 7 must not reuse that payload as `loop_titles.playback_path`.

## 1. Existing tables / endpoints that already match

### Bridge (`Media-Factory`)

- `bridge_titles` — identity (`id`, `slug`, `name`, `synopsis`, `language`, `year`, `runtime_minutes`, `poster_key`, `master_key`, `genre`, `status`)
- `bridge_qc_reviews` — latest `pass` required
- `bridge_title_rights` — `territories`, `start_date`, `end_date`, `rights_type`, `media_type`, `chain_of_title_status`, `approved_at`
- `bridge_assets` — `kind` in poster / screener / master / subtitle (playback/trailer added in 0007)
- `bridge_loop_releases` — HMAC attempt log after capture (B2B, not catalog)
- `LOOP_HANDOFF_URL` / `LOOP_HANDOFF_SECRET` — fail closed when unset (`src/lib/bridge/loop-handoff.ts`)
- `assertLoopPublishGates` — `src/lib/bridge/loop-publish.ts`

### Loop (`crayons-loop-streaming-platform`) — consume later, do not duplicate

- `loop_titles` columns already used: `id`, `slug`, `title`, `synopsis`, `content_type`, `language`, `year`, `duration_minutes`, `maturity_rating`, `poster_path`, `backdrop_path`, `trailer_path`, `playback_path`, `stream_playback_url`, `access_tier`, `published`, `status`, `is_tvod_enabled`, `tvod_rental_price`, `tvod_purchase_price`, `metadata`
- `src/lib/bridgeAdapter.ts` — `BridgeTitleReference` (`source_system`, `bridge_title_id`, `loop_title_id`, `delivery_status`)
- `/api/media/stream-url` — signed S3 GET. Must never be pointed at a Bridge **master** key.

## 2. Gaps

- No `bridge_loop_publications` row until 0007 (this branch).
- No derived `playback` asset kind until 0007.
- Loop catalog still comes from Loop CMS + `KNOWN_FILMS_MEDIA` + hardcoded `CANONICAL_PUBLIC_TITLES`.
- Pranayam 1947 playback is a `.mov` mezzanine — **not READY** for this contract.
- `LOOP_HANDOFF_*` unbound on Vercel Preview → fail closed.
- Shared Supabase project: Loop tables and Bridge tables coexist. Do not write Bridge rows from Loop clients.

## 3. Publish record (one row per window)

Field map. Bridge is owner unless marked Loop.

| Contract field | Bridge source | Loop target (Prompt 7) | Owner |
|---|---|---|---|
| `bridge_title_id` | `bridge_titles.id` | `metadata.bridge_title_id` | Bridge |
| `loop_title_id` | filled after ingest ack | `loop_titles.id` | Loop (assigned) |
| `title` | `bridge_titles.name` | `title` | Bridge |
| `synopsis` | `bridge_titles.synopsis` | `synopsis` | Bridge |
| `content_type` | publication `content_type` (default Film) | `content_type` | Bridge |
| `year` | `bridge_titles.year` | `year` | Bridge |
| `languages` | `bridge_titles.language` | `language` | Bridge |
| `artwork` | `bridge_assets` kind poster | `poster_path` via Loop signer | Bridge key, Loop URL |
| `trailer` | `bridge_assets` kind trailer | `trailer_path` | Bridge key, Loop URL |
| `genres` | `bridge_titles.genre` | metadata | Bridge |
| `cast_credits` | publication payload | metadata | Bridge |
| `maturity_rating` | publication payload | `maturity_rating` | Bridge |
| `availability_territory` | `bridge_title_rights.territories` | metadata.territory | Bridge |
| `rights_start` / `rights_end` | rights dates | metadata window | Bridge |
| `monetization_mode` | publication (`free`/`svod`/`tvod`/`premiere`) | `access_tier` | Bridge |
| `price_plan_eligibility` | paise + plan codes | `tvod_*` / plan | Bridge |
| `playback_asset_reference` | `bridge_assets` kind **playback** | `playback_path` (Loop-signed, never master) | Bridge |
| `publishing_status` | `published` / `unpublished` | `published` + `status` | Bridge |

Playback READY means:

- asset kind = `playback`
- MIME `video/mp4` or HLS playlist
- key ≠ `master_key`
- path does not end `.mov` / `.mxf`
- not `/media/` sandbox

## 4. Gates before TITLE_PUBLISHED_TO_LOOP

All must pass. Any miss → `blocked`, no Loop row.

1. Title exists on `bridge_titles`
2. Latest QC decision is `pass`
3. Rights row evidenced and `approved_at` set
4. Territory on the publication is inside `bridge_title_rights.territories`
5. License window active (`start_date` ≤ now < `end_date` if end set)
6. Explicit publish permission (`publishing_status` requested = published)
7. Streaming asset READY (derived playback, not master)
8. HMAC ingest bound (`LOOP_HANDOFF_URL` https + `LOOP_HANDOFF_SECRET`) — otherwise blocked, title stays off Loop

Expired or invalid rights → `TITLE_UNPUBLISHED`. Loop must drop catalog visibility and refuse `/watch`.

## 5. Fail-closed cases

- Ingest unset → do not mint `loop_titles`
- QC fail / pending → blocked
- Rights unverified / expired → blocked / unpublished
- Only a master or `.mov` mezzanine → blocked (`playback not READY`)
- Public-ACL on master bucket → forbidden
- Client `?paid=true` / localStorage → ignored
- Loop CMS `PUBLISH_CATALOG_PRODUCTION` is **not** a substitute for this contract
- Demo / hardcoded fallback titles must not be written by Prompt 7

## 6. Auth domains

| Surface | Auth | Users |
|---|---|---|
| Bridge | Better Auth | creator, studio, buyer, invited internal |
| Loop | Supabase Auth on `uakpqqardziifcwzvgfx` | viewer, subscriber, rental |

No auto-provision of Bridge desk accounts from Loop signup.

## 7. Events (server, idempotent)

`TITLE_PUBLISHED_TO_LOOP` · `TITLE_UNPUBLISHED` · `RIGHTS_EXPIRING` · `RIGHTS_EXPIRED`

Dedupe on `bridge_loop_publications.id` / event id. Do not send duplicate mail.

## 8. Owner YES required before Prompt 7

Prompt 7 (Loop consume + catalog swap) needs a written YES after this contract.  
Do not apply 0007 to canonical Supabase until owner YES on schema.  
Do not merge to `main`. Do not touch crayonsloop production.

Prompt 8 (Pranayam derived MP4/HLS) is independent playback repair on Loop **preview** and is still required before any publication of that title can pass gate 7.
