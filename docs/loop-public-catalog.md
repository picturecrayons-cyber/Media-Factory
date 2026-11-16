# Loop public catalogue — secure Bridge-authorized read path

This function is intentionally small and read-only.

## Runtime
- Supabase project: Testing first; Production rollout requires a separate approved migration and deployment.
- Function: `loop-public-catalog`
- JWT verification: disabled because it is a public catalogue endpoint. The function accepts GET and OPTIONS only.
- It uses the Supabase server service-role key inside the Edge Function runtime only. Never put this key in Vercel/browser variables.

## Authorization source
The function calls `public.public_loop_catalog()`. That function is `SECURITY INVOKER`, `STABLE`, has an empty search_path, and is executable only by `service_role`. It joins Loop title projections to exact Bridge publication rows and checks:
- authorization status = authorized
- approval exists and revocation is absent
- window start/end exist and the current time is inside the window
- WORLDWIDE territory
- language includes the Loop title language
- exploitation model includes the Loop access tier
- Loop title is approved, listed and published

The underlying `loop_titles` and `bridge_loop_publications` tables remain unavailable to `anon` and `authenticated`.

## Public response
Only safe presentation fields are returned. No owner information, rights evidence, original object paths, master keys, private metadata or payment/entitlement data is returned.

## Testing verification (2026-11-16)
Testing Supabase ref: `jbymleftneggcgutlcqu`.
- Function deployed ACTIVE, version 1.
- Function RPC role ACL: service_role only.
- anon/authenticated function EXECUTE: false.
- anon/authenticated SELECT on source tables: false.
- Public Loop catalogue API on Vercel Preview: HTTP 200 with `{ "success": true, "count": 0, "titles": [] }`, as the Testing catalogue contains no authorized titles.

Production was not modified. No title, rights, publication, payment, entitlement or media records were inserted or updated.

## Release gate
Do not deploy this function or migration to Production until the SQL is replayed and reviewed against the exact Production schema, a separate Production migration is checked in, independent security review passes, and the Loop API is verified against a Production read-only smoke check. Public film releases remain title-specific gated by rights, asset, QC, legal and commercial evidence.
