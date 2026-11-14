import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidHostingerBearer,
  parseHostingerIncomingPayload,
  readLimitedRequestBody,
} from "./hostinger-incoming.ts";

const mailbox = "abijithasokan@crayonspictures.com";

function createStreamedPostRequest(body: ReadableStream<Uint8Array>): Request {
  const init = {
    method: "POST",
    body,
    duplex: "half",
  };
  return new Request(
    "https://example.test/api/hostinger-incoming",
    init as RequestInit,
  );
}

describe("Hostinger incoming mail webhook", () => {
  it("accepts the configured Bearer token and rejects invalid credentials", () => {
    assert.equal(isValidHostingerBearer("Bearer secret-token", "secret-token"), true);
    assert.equal(isValidHostingerBearer("bearer secret-token", "secret-token"), true);
    assert.equal(isValidHostingerBearer("Bearer wrong-token", "secret-token"), false);
    assert.equal(isValidHostingerBearer("secret-token", "secret-token"), false);
    assert.equal(isValidHostingerBearer("Bearer secret-token", ""), false);
  });

  it("accepts a valid message.received event for the configured mailbox", () => {
    const result = parseHostingerIncomingPayload({
      event: "message.received",
      mailbox,
      message: {
        from: "Producer <producer@example.com>",
        subject: "Production delivery enquiry",
        thread_id: "thr_123",
        snippet: "A short message preview",
        timestamp: "2026-11-14T09:30:00Z",
      },
    }, mailbox);

    assert.deepEqual(result, {
      eventName: "message.received",
      mailbox,
      sender: "Producer <producer@example.com>",
      subject: "Production delivery enquiry",
      threadId: "thr_123",
      preview: "A short message preview",
      messageReceivedAt: "2026-11-14T09:30:00.000Z",
    });
  });

  it("rejects unsupported events, mailbox mismatches, and invalid senders", () => {
    assert.throws(() => parseHostingerIncomingPayload({
      event: "message.deleted",
      mailbox,
      message: { from: "producer@example.com" },
    }, mailbox), /Unsupported Hostinger event/);

    assert.throws(() => parseHostingerIncomingPayload({
      event: "message.received",
      mailbox: "other@example.com",
      message: { from: "producer@example.com" },
    }, mailbox), /Unexpected mailbox/);

    assert.throws(() => parseHostingerIncomingPayload({
      event: "message.received",
      mailbox,
      message: { from: "not-an-email" },
    }, mailbox), /Invalid sender/);
  });

  it("bounds stored text fields and tolerates an absent optional preview", () => {
    const result = parseHostingerIncomingPayload({
      event: "message.received",
      mailbox,
      message: {
        from: "producer@example.com",
        subject: "S".repeat(1200),
        text: "P".repeat(2000),
      },
    }, mailbox);

    assert.equal(result.subject.length, 998);
    assert.equal(result.preview?.length, 1500);
    assert.equal(result.threadId, null);
    assert.equal(result.messageReceivedAt, null);
  });
});

describe("bounded Hostinger webhook body reader", () => {
  it("reads chunked request bodies that stay within the byte limit", async () => {
    const chunks = [
      new TextEncoder().encode('{"event":'),
      new TextEncoder().encode('"message.received"}'),
    ];
    const request = createStreamedPostRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }));

    assert.equal(
      await readLimitedRequestBody(request, 128),
      '{"event":"message.received"}',
    );
  });

  it("cancels a chunked stream as soon as it exceeds the configured cap", async () => {
    let cancelled = false;
    const request = createStreamedPostRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234567890"));
        controller.enqueue(new TextEncoder().encode("abcdefghij"));
      },
      cancel() {
        cancelled = true;
      },
    }));

    assert.equal(await readLimitedRequestBody(request, 16), null);
    assert.equal(cancelled, true);
  });
});
