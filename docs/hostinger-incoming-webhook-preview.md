# Hostinger incoming webhook receiver (Preview-only)

Endpoint: `POST /api/hostinger-incoming`

## Required Preview configuration

- `HOSTINGER_WEBHOOK_SECRET`: the webhook's Bearer secret, stored as a masked Preview-only environment variable. Never commit it or paste it into chat.
- `HOSTINGER_WEBHOOK_MAILBOX` (optional but recommended): exact expected mailbox address.

Do not copy a Production secret into Preview. If the current Hostinger webhook secret is not securely available, rotate it only through an approved secret-handling process and update the matching Preview environment variable. Keep the Hostinger webhook paused until verification and separate activation approval.

## Current behavior

- Missing secret: `503` (fail closed).
- Missing/incorrect Bearer token: `401`.
- Oversized, invalid JSON, wrong event shape, or mailbox mismatch: `413` / `400`.
- Valid `message.received` JSON with a valid Bearer token: `200` with `processing: "validation-only"`.

This endpoint validates delivery only. It does **not** persist email content, create CRM records, or trigger actions. A downstream processing/storage contract needs separate review before describing the integration as fully complete.

## Verification checklist

1. Preview deployment is tied to the exact PR head SHA.
2. Set the dedicated Preview secret securely and verify the mailbox constraint.
3. Test missing secret, missing token, wrong token, malformed JSON, wrong event, mailbox mismatch, and valid Hostinger test delivery.
4. Confirm Hostinger reports HTTP 200 for its test delivery.
5. Keep the webhook paused; activation requires separate explicit approval.
