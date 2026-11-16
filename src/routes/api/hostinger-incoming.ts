import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  isHostingerTestDeliveryPayload,
  isValidHostingerBearer,
  parseHostingerIncomingPayload,
  readLimitedRequestBody,
  type HostingerIncomingMailRecord,
} from "@/lib/bridge/hostinger-incoming";
import { bridgeEnv } from "@/lib/bridge/env";

const MAX_WEBHOOK_BYTES = 64 * 1024;
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
          if (isHostingerTestDeliveryPayload(payload, expectedMailbox)) {
            // Hostinger's Test action has no message metadata. Acknowledge the
            // connectivity probe without storing a synthetic message.
            return Response.json({ ok: true, test: true, stored: false });
          }
          message = parseHostingerIncomingPayload(payload, expectedMailbox);
        } catch (error) {
          // Log only the parser's fixed validation reason; never log message content,
          // sender addresses, mailbox values, bearer tokens, or the raw payload.
          const reason = error instanceof Error ? error.message : "Unknown payload validation error";
          console.warn("[hostinger-incoming] rejected Hostinger event payload", { reason });
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
