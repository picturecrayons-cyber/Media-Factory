import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import {
  isValidHostingerBearer,
  parseHostingerIncomingPayload,
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

        const raw = await request.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_WEBHOOK_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        let message: HostingerIncomingMailRecord;
        try {
          const expectedMailbox = bridgeEnv.hostingerIncomingMailbox();
          message = parseHostingerIncomingPayload(payload, expectedMailbox);
        } catch {
          return Response.json({ error: "Invalid incoming mail event" }, { status: 400 });
        }

        const payloadHash = createHash("sha256").update(raw, "utf8").digest("hex");

        try {
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
