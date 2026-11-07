import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

type HostingerIncomingPayload = {
  event: "message.received";
  mailbox: string;
  message: Record<string, unknown>;
};

function constantTimeTokenMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHostingerPayload(value: unknown): value is HostingerIncomingPayload {
  return (
    isRecord(value) &&
    value.event === "message.received" &&
    typeof value.mailbox === "string" &&
    value.mailbox.length > 0 &&
    isRecord(value.message)
  );
}

export const Route = createFileRoute("/api/hostinger-incoming")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedSecret = process.env.HOSTINGER_WEBHOOK_SECRET;
        if (!expectedSecret) {
          // Fail closed: never acknowledge delivery until Preview has its own secret.
          return Response.json({ error: "Receiver is not configured" }, { status: 503 });
        }

        const authorization = request.headers.get("authorization") ?? "";
        const match = /^Bearer (.+)$/i.exec(authorization);
        if (!match || !constantTimeTokenMatch(match[1], expectedSecret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 262144) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        const raw = await request.text();
        if (Buffer.byteLength(raw, "utf8") > 262144) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!isHostingerPayload(payload)) {
          return Response.json({ error: "Invalid Hostinger webhook payload" }, { status: 400 });
        }

        const expectedMailbox = process.env.HOSTINGER_WEBHOOK_MAILBOX;
        if (expectedMailbox && payload.mailbox.toLowerCase() !== expectedMailbox.toLowerCase()) {
          return Response.json({ error: "Mailbox mismatch" }, { status: 400 });
        }

        // Receiver verification only: this endpoint does not persist email content or trigger actions.
        // A downstream persistence/CRM workflow must be separately designed and reviewed.
        return Response.json(
          { ok: true, event: payload.event, accepted: true, processing: "validation-only" },
          { status: 200 },
        );
      },
    },
  },
});
