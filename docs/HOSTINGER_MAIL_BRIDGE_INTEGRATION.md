# Hostinger Mail ↔ Crayons Bridge

## Current behavior

- `POST /api/hostinger-mail/webhook` accepts only authenticated `message.received` events.
- Events are deduplicated. They link automatically only when the exact Hostinger `thread_id` and mailbox address match a Bridge thread; otherwise they remain in a Super Admin-only triage list.
- If a least-privilege Hostinger API token, mailbox resource ID and message UID are configured, Bridge attempts to fetch the message text. Otherwise it stores the provider-supplied preview.
- Linking an existing thread backfills queued inbound event previews into that conversation.
- Outbound drafts remain unsent until a Super Admin types `SEND EMAIL` and explicitly clicks Send. Recipients must match the linked prospect's recorded contact email. SMTP failures and ambiguous outcomes are not retried automatically.

## Preview-only setup checklist

Do not configure this integration against a production mailbox until Preview isolation has been proven.

1. In Vercel, add the following as **Preview-only environment variables** for the isolated Bridge Preview deployment:
   - `HOSTINGER_MAIL_WEBHOOK_SECRET`: the bearer secret returned when creating the webhook in Hostinger Mail.
   - `HOSTINGER_MAIL_API_TOKEN`: a least-privilege API token scoped to the required mailbox only.
   - `HOSTINGER_MAILBOX_RESOURCE_ID`: that mailbox's Hostinger resource ID.
   - Existing outbound mail settings: `HOSTINGER_SMTP_HOST`, `HOSTINGER_SMTP_USER`, `HOSTINGER_SMTP_PASS`, `MAIL_FROM`, and `SMTP_PORT`.
2. In Hostinger Mail, create a `message.received` webhook pointed to `https://<verified-isolated-preview-host>/api/hostinger-mail/webhook`. Copy the one-time webhook secret directly into the Preview environment; never commit it.
3. Test using a dedicated test mailbox and test buyer contact only. Confirm a repeated webhook is idempotent and creates only one message record.
4. In Bridge, link the exact thread ID and exact mailbox address to the intended prospect. An unlinked event must not create a buyer account or entitlement.
5. Test outbound send only with an explicitly approved test recipient. Confirm outbox/audit/message records and reconcile the Sent mailbox before considering any retry after an ambiguous SMTP result.

## Release boundary

This documentation does not mean the webhook is configured or that Vercel has the required secrets. No email has been sent and no live mailbox webhook has been created by this implementation. Production remains HOLD / NOT CERTIFIED.
