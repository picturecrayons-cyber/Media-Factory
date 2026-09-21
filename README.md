# CRAYONS LOOP

Premium Malayalam / global cinema streaming — catalog, kids safe mode, SVOD + TVOD, and a 10-command-center owner ops desk.

Mapped from [crayonsloop.com](https://crayonsloop.com): public cinema, account & family profiles, Mission Control, ingest, rights, QC, localization, screeners, and edge transfers.

## Stack

- TanStack Start (file routing) + React 19
- Tailwind v4
- Postgres (Neon in production, PGLite in preview)
- Better Auth (Google / X / email)
- Zustand for cinema UI (kids mode, search)

## Scripts

```bash
npm install
npm run dev          # 0.0.0.0:8080
npm run build
npm run typecheck
```

Set `DATABASE_URL` for Neon. Auth credentials are injected at deploy. Do not commit `.env` files.

## Surfaces

| Path | What |
|---|---|
| `/` | Cinema home + hero |
| `/browse` `/title/:slug` `/watch/:slug` | Catalog & studio player |
| `/kids` | U-rated portal (PIN `0000` to exit) |
| `/account` | Profiles, entitlements, invoices |
| `/plans` | Monthly ₹149 · Annual ₹999 · TVOD ₹79 / ₹249 |
| `/admin` | Mission Control — Connect · Sync · Map · Configure · Undo |
| `/owner/workspace` | Ingest · Rights · QC |
| `/owner/supply-chain` | Localization |
| `/owner/sharing` | Forensic screeners |
| `/owner/transfers` | Edge / S3 transfers |

## License

Proprietary — StreamVista / Crayons Pictures. All rights reserved.
