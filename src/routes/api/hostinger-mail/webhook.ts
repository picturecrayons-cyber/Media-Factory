import { createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { bridgeEnv } from "@/lib/bridge/env";

const webhookPayload = z.object({
  event: z.literal("message.received"),
  mailbox: z.string().trim().min(1).max(320),
  message: z.object({
    thread_id: z.string().trim().min(1).max(500),
    id: z.union([z.string(), z.number()]).optional(),
    uid: z.union([z.string(), z.number()]).optional(),
    message_id: z.string().optional(),
    from: z.unknown().optional(),
    subject: z.string().max(1000).optional(),
    text: z.string().optional(),
    snippet: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  }).passthrough(),
}).passthrough();

function safeEqual(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function senderAddress(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 320);
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.email === "string") return candidate.email.slice(0, 320);
    if (typeof candidate.address === "string") return candidate.address.slice(0, 320);
  }
  return null;
}

function receivedDate(value: string | number | undefined): Date {
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const parsed = new Date(ms);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

export const Route = createFileRoute("/api/hostinger-mail/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = bridgeEnv.hostingerMailWebhookSecret();
        if (!expected) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
        const authorization = request.headers.get("authorization") ?? "";
        const actual = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!actual || !safeEqual(actual, expected)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const raw = await request.text();
        if (raw.length > 64_000) return Response.json({ error: "Payload too large" }, { status: 413 });
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const checked = webhookPayload.safeParse(parsed);
        if (!checked.success) return Response.json({ error: "Unsupported webhook payload" }, { status: 400 });

        const payload = checked.data;
        const mailbox = payload.mailbox.trim().toLowerCase();
        const threadId = payload.message.thread_id;
        const rawMessageId = String(
          payload.message.id ?? payload.message.uid ?? payload.message.message_id ??
          createHash("sha256").update([
            mailbox, threadId, String(payload.message.timestamp ?? ""),
            senderAddress(payload.message.from) ?? "", payload.message.subject ?? "",
          ].join("|")).digest("hex"),
        );
        const externalMessageId = "hostinger:" + createHash("sha256")
          .update(mailbox + "|" + rawMessageId).digest("hex");
        const eventKey = createHash("sha256")
          .update(mailbox + "|" + threadId + "|" + rawMessageId).digest("hex");
        const receivedAt = receivedDate(payload.message.timestamp);
        const preview = (payload.message.text ?? payload.message.snippet ?? "").slice(0, 2000);
        const sender = senderAddress(payload.message.from);
        const subject = (payload.message.subject ?? "(no subject)").slice(0, 240);

        const sql = await getSql();
        const result = await sql.transaction(async (tx) => {
          const inserted = await tx<{ id: string }>`
            insert into bridge_mail_webhook_events
              (event_key, mailbox_ref, external_thread_id, external_message_id, sender_ref,
               subject, preview_text, received_at, status, metadata)
            values (
              ${eventKey}, ${mailbox}, ${threadId}, ${externalMessageId}, ${sender},
              ${subject}, ${preview}, ${receivedAt.toISOString()}, 'UNLINKED',
              ${JSON.stringify({ event: payload.event, sourceMessageId: rawMessageId })}::jsonb
            )
            on conflict (event_key) do nothing
            returning id
          `;
          if (!inserted[0]) return { duplicate: true, linked: false };

          const linked = await tx<{ id: string }>`
            select id from bridge_communication_threads
            where channel = 'HOSTINGER_MAIL'
              and external_thread_id = ${threadId}
              and lower(coalesce(mailbox_account_ref, '')) = ${mailbox}
            limit 1
          `;
          if (!linked[0]) return { duplicate: false, linked: false };

          await tx`
            insert into bridge_communication_messages
              (thread_id, direction, sender_ref, recipient_refs, subject, body_text,
               external_message_id, sent_at, created_by)
            values (
              ${linked[0].id}, 'INBOUND', ${sender}, ${JSON.stringify([mailbox])}::jsonb,
              ${subject}, ${preview}, ${externalMessageId}, ${receivedAt.toISOString()}, 'hostinger-webhook'
            )
            on conflict (external_message_id) do nothing
          `;
          await tx`
            update bridge_communication_threads
            set last_activity_at = greatest(last_activity_at, ${receivedAt.toISOString()}::timestamptz),
                updated_at = now()
            where id = ${linked[0].id}
          `;
          await tx`
            update bridge_mail_webhook_events
            set status = 'LINKED', linked_thread_id = ${linked[0].id}
            where event_key = ${eventKey}
          `;
          return { duplicate: false, linked: true };
        });

        return Response.json({ accepted: true, ...result }, { status: 202 });
      },
    },
  },
});
