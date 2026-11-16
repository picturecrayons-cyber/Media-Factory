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
 * Hostinger's webhook "Test" action currently posts a metadata-only envelope:
 * { event, id, timestamp, data: { date, from, messageId, subject } }.
 * It contains no mailbox-bound message body and must never be persisted as mail.
 * Accept only this exact schema after the route has validated the Bearer secret.
 */
function isStrictHostingerTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Hostinger timestamps are RFC 3339 / ISO-8601 with an explicit timezone.
  // Validate component ranges and calendar values before Date.parse so values
  // such as "1" or 2026-02-30 are never normalized into valid test pings.
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?(Z|[+-](?:0\\d|1\\d|2[0-3]):[0-5]\\d)$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) return false;

  return Number.isFinite(Date.parse(value));
}

export function isHostingerTestDeliveryEnvelope(value: unknown): boolean {
  const payload = asRecord(value);
  if (!payload) return false;
  const exactKeys = (record: UnknownRecord, expected: string[]) => {
    const actual = Object.keys(record).sort();
    return actual.length === expected.length &&
      actual.every((key, index) => key === [...expected].sort()[index]);
  };

  if (!exactKeys(payload, ["data", "event", "id", "timestamp"])) return false;
  if (payload.event !== "message.received") return false;
  if (typeof payload.id !== "string" || !payload.id.trim() || payload.id.length > 256) return false;
  if (!isStrictHostingerTimestamp(payload.timestamp)) return false;

  const data = asRecord(payload.data);
  if (!data || !exactKeys(data, ["date", "from", "messageId", "subject"])) return false;
  if (!isStrictHostingerTimestamp(data.date)) return false;
  if (
    typeof data.messageId !== "string" ||
    !data.messageId.trim() ||
    data.messageId.length > 998
  ) return false;
  if (typeof data.subject !== "string" || data.subject.length > 998) return false;

  let rawSender: string | null = null;
  if (typeof data.from === "string") {
    rawSender = data.from;
  } else {
    const from = asRecord(data.from);
    if (from && exactKeys(from, ["address", "name"])) {
      rawSender = firstString(from, ["address"]);
      if (typeof from.name !== "string") return false;
    } else if (from && exactKeys(from, ["address"])) {
      rawSender = firstString(from, ["address"]);
    }
  }
  if (!rawSender) return false;
  try {
    normalizeSender(rawSender);
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
