import { timingSafeEqual } from "node:crypto";

export type HostingerIncomingMailRecord = {
  eventName: "message.received";
  mailbox: string;
  sender: string;
  subject: string;
  threadId: string | null;
  preview: string | null;
  messageReceivedAt: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function firstString(source: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeSender(value: string): string {
  const sender = value.trim();
  const address = sender.match(/<([^<>]+)>/)?.[1]?.trim() ?? sender;
  if (
    sender.length > 320 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)
  ) {
    throw new Error("Invalid sender");
  }
  return sender;
}

export function isValidHostingerBearer(
  authorizationHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!expectedSecret.trim()) return false;
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1]?.trim();
  if (!supplied) return false;

  const suppliedBytes = Buffer.from(supplied, "utf8");
  const expectedBytes = Buffer.from(expectedSecret.trim(), "utf8");
  return suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes);
}

export function parseHostingerIncomingPayload(
  value: unknown,
  expectedMailbox: string,
): HostingerIncomingMailRecord {
  const payload = asRecord(value);
  if (!payload || payload.event !== "message.received") {
    throw new Error("Unsupported Hostinger event");
  }

  const message = asRecord(payload.message);
  if (!message) throw new Error("Missing message metadata");

  const mailboxValue = typeof payload.mailbox === "string"
    ? payload.mailbox
    : asRecord(payload.mailbox)?.address;
  if (typeof mailboxValue !== "string" || !expectedMailbox.trim()) {
    throw new Error("Missing mailbox");
  }

  const mailbox = mailboxValue.trim().toLowerCase();
  if (mailbox !== expectedMailbox.trim().toLowerCase()) {
    throw new Error("Unexpected mailbox");
  }

  const rawSender = firstString(message, ["from", "sender"]);
  if (!rawSender) throw new Error("Missing sender");
  const sender = normalizeSender(rawSender);

  const subject = (firstString(message, ["subject"]) ?? "").slice(0, 998);
  const threadId = firstString(message, ["thread_id", "threadId"]);
  const rawPreview = firstString(message, [
    "preview",
    "snippet",
    "truncated_message",
    "message",
    "text",
    "body",
  ]);

  const rawTimestamp = firstString(message, [
    "timestamp",
    "received_at",
    "receivedAt",
    "date",
  ]) ?? firstString(payload, ["timestamp", "received_at", "receivedAt"]);
  const timestamp = rawTimestamp ? new Date(rawTimestamp) : null;
  const messageReceivedAt = timestamp && Number.isFinite(timestamp.getTime())
    ? timestamp.toISOString()
    : null;

  return {
    eventName: "message.received",
    mailbox,
    sender,
    subject,
    threadId: threadId ? threadId.slice(0, 256) : null,
    preview: rawPreview ? rawPreview.slice(0, 1500) : null,
    messageReceivedAt,
  };
}
