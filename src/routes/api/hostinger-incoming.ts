import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  isValidHostingerBearer,
  parseHostingerIncomingPayload,
  readLimitedRequestBody,
  type HostingerIncomingMailRecord,
} from "@/lib/bridge/hostinger-incoming";
import { bridgeEnv } from "@/lib/bridge/env";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function safePayloadShape(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { payloadType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value };
  }
  const payload = value as Record<string, unknown>;
  const data = payload.data;
  const dataRecord = data !== null && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  const message = payload.message;
  const mailbox = payload.mailbox;
  const dataMessage = dataRecord?.message;
  const dataMailbox = dataRecord?.mailbox;
  const safeKeys = (record: unknown): string[] => {
    if (record === null || typeof record !== "object" || Array.isArray(record)) return [];
    return Object.keys(record as Record<string, unknown>)
      .slice(0, 30)
      .map((key) => key.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 48))
      .sort();
  };
  const valueType = (input: unknown): string =>
    input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
  return {
    topLevelKeys: safeKeys(payload),
    event: typeof payload.event === "string" ? payload.event : null,
    idType: valueType(payload.id),
    timestampType: valueType(payload.timestamp),
    dataType: valueType(data),
    dataKeys: safeKeys(data),
    dataMailboxType: valueType(dataMailbox),
    dataMailboxKeys: safeKeys(dataMailbox),
    dataMessageType: valueType(dataMessage),
    dataMessageKeys: safeKeys(dataMessage),
    mailboxType: valueType(mailbox),
    mailboxKeys: safeKeys(mailbox),
    messageType: valueType(message),
    messageKeys: safeKeys(message),
  };
}

export const Route = createFileRoute("/api/hostinger-incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = bridgeEnv.hostingerIncomingWebhookSecret();
        if (!secret) {
          return Response.json({ error: "Incoming mail receiver is not configured" }, { status: 503 });
        }

        if (!isValidHostingerBearer(request.headers.get("authorization"), secret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
        if (!contentType.includes("application/json")) {
          return Response.json({ error: "JSON required" }, { status: 415 });
        }

        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        let raw: string | null;
        try {
          raw = await readLimitedRequestBody(request, MAX_WEBHOOK_BYTES);
        } catch {
          return Response.json({ error: "Could not read request body" }, { status: 400 });
        }
        if (raw === null) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          console.warn("[hostinger-incoming] rejected invalid JSON body");
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        let message: HostingerIncomingMailRecord;
        try {
          const expectedMailbox = bridgeEnv.hostingerIncomingMailbox();
          message = parseHostingerIncomingPayload(payload, expectedMailbox);
        } catch (error) {
          // Log only the parser's fixed validation reason; never log message content,
          // sender addresses, mailbox values, bearer tokens, or the raw payload.
          const reason = error instanceof Error ? error.message : "Unknown payload validation error";
          if (reason === "Missing message metadata") {
            // Log only property names and JSON value types; never content.
            console.warn("[hostinger-incoming] missing message metadata; payload shape", {
              reason,
              shape: safePayloadShape(payload),
            });
          } else {
            console.warn("[hostinger-incoming] rejected Hostinger event payload", { reason });
          }
          return Response.json({ error: "Invalid incoming mail event" }, { status: 400 });
        }

        const payloadHash = createHash("sha256").update(raw, "utf8").digest("hex");

        try {
          // Import the database lazily: metadata-free Hostinger test pings are
          // acknowledged above and do not need a Postgres connection.
          const { getSql } = await import("@/lib/db");
          const sql = await getSql();
          const inserted = await sql<{ id: string }>`
            insert into private.bridge_inbound_mail_events (
              payload_sha256, event_name, mailbox, sender, subject,
              thread_id, preview, message_received_at
            ) values (
              ${payloadHash}, ${message.eventName}, ${message.mailbox}, ${message.sender},
              ${message.subject}, ${message.threadId}, ${message.preview},
              ${message.messageReceivedAt}::timestamptz
            )
            on conflict (payload_sha256) do nothing
            returning id
          `;

          return Response.json({
            ok: true,
            duplicate: inserted.length === 0,
          });
        } catch {
          console.error("[hostinger-incoming] event persistence failed");
          return Response.json({ error: "Incoming event could not be stored" }, { status: 503 });
        }
      },
    },
  },
});
