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

/**
 * Hostinger's authenticated Test action sends a synthetic wrapper, not the
 * real message.received shape: { data: { date, from, messageId, subject },
 * event, id, timestamp }. Only this exact four-field envelope is treated as
 * a no-op. It is never persisted as an inbound message.
 *
 * Real deliveries must continue through parseHostingerIncomingPayload(), which
 * requires an explicit configured mailbox and message object.
 */
export function isHostingerSyntheticTestEnvelope(value: unknown): boolean {
  const payload = asRecord(value);
  if (!payload || payload.event !== "message.received") return false;

  const hasExactKeys = (record: UnknownRecord, expected: string[]): boolean => {
    const actual = Object.keys(record).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length &&
      actual.every((key, index) => key === wanted[index]);
  };

  if (!hasExactKeys(payload, ["data", "event", "id", "timestamp"])) return false;

  const data = asRecord(payload.data);
  if (!data || !hasExactKeys(data, ["date", "from", "messageId", "subject"])) return false;

  const id = firstString(payload, ["id"]);
  const timestampValue = firstString(payload, ["timestamp"]);
  const dateValue = firstString(data, ["date"]);
  const messageId = firstString(data, ["messageId"]);
  const senderValue = firstString(data, ["from"]);
  const subject = data.subject;

  if (
    !id || id.length > 256 ||
    !timestampValue || !Number.isFinite(new Date(timestampValue).getTime()) ||
    !dateValue || !Number.isFinite(new Date(dateValue).getTime()) ||
    !messageId || messageId.length > 512 ||
    !senderValue ||
    typeof subject !== "string" || subject.length > 998
  ) return false;

  try {
    normalizeSender(senderValue);
  } catch {
    return false;
  }

  return true;
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


/**
 * Read a request body without buffering beyond maxBytes. Returns null when
 * the stream exceeds the cap and cancels the upstream reader immediately.
 */
export async function readLimitedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("maxBytes must be a positive safe integer");
  }

  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Request body exceeds configured limit");
        return null;
      }

      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
