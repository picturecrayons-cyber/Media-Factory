# Hostinger SMTP — Crayons Bridge verification

Sender infrastructure mailbox: `abijithasokan@crayonspictures.com`  
That is the **From** address. It is **not** the signed-in user's login identity.

## Environment names (values never in git)

| Name | Purpose | Scope |
|---|---|---|
| `SMTP_PASS` | Hostinger **mailbox** password | Vercel **Preview only** |
| `SMTP_HOST` | default `smtp.hostinger.com` | Preview (optional; code default exists) |
| `SMTP_PORT` | default `465` (TLS) | Preview (optional) |
| `SMTP_USER` | default `abijithasokan@crayonspictures.com` | Preview (optional) |
| `MAIL_FROM` | default same as SMTP_USER | Preview (optional) |
| `BETTER_AUTH_URL` / `APP_URL` | Canonical verify-link origin | Preview |

Do **not** bind `SMTP_PASS` to Production until the owner writes YES.  
Do **not** use hPanel password or IMAP password.  
Do **not** prefix with `VITE_`.

## Claims

| Environment | When it is true |
|---|---|
| PREVIEW VERIFIED | Preview deploy has `SMTP_PASS`, a real mail arrived, the link verified the intended account, token was consumed |
| PRODUCTION VERIFIED | Not claimed. Production mail remains unbound unless explicitly enabled later |

## Flow

Account email (Better Auth `user.email`) → `email_verified = false` → hashed token in `bridge_email_challenges` → Hostinger SMTP send → `/verify-email?token=` → consume token → `bridge_profiles.email_verified` and `user.emailVerified`.

Resend: 2-minute throttle. Previous unused tokens are invalidated. SMTP failure does not report success.
