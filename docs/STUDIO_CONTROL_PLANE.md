# Bridge Studio control plane

Studio dashboard is the business workspace. Slate is a view inside it, not the whole product.

Canonical title lifecycle is unchanged (`bridge_titles.status`). Display pipeline labels map onto it; they do not create a second model.

LOOP remains consumer OTT. Bridge does not mint Loop entitlements, HLS, or subscribers.

## Honest empty states

- No titles → “Your Studio is ready. Add your first title.”
- No deals → “No licensing opportunities yet.”
- No captured payments → “No transactions yet.” / “Gateway configured. No captured transactions yet.”
- Unconfigured destinations (FAST, AVOD, IFE, …) stay **not configured**

Zero is a real number. Placeholders such as ₹XX,XX,XXX are forbidden.

## Schema

`migrations/0008_studio_control_plane.sql` adds `bridge_deals`. Apply on canonical `uakpqqardziifcwzvgfx` Preview only after owner YES. Do not seed.
