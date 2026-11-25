import { getSql } from "@/lib/db";

/**
 * Sends one durable owner-submission outbox message.
 * Claiming is atomic; duplicate workers cannot claim the same fresh row.
 * Delivery failures are retained with bounded exponential retry.
 */
export async function dispatchOwnerSubmissionNotification(eventKey: string): Promise<{ sent: boolean }> {
  const sql = await getSql();
  const claimed = await sql<{
    id: string;
    recipient_email: string;
    subject: string;
    text_body: string;
    html_body: string | null;
    attempts: number;
  }>`
    update bridge_notification_outbox
    set status = 'sending',
        attempts = attempts + 1,
        processing_started_at = now(),
        updated_at = now()
    where event_key = ${eventKey}
      and next_attempt_at <= now()
      and (
        status in ('pending','failed')
        or (status = 'sending' and processing_started_at < now() - interval '10 minutes')
      )
    returning id, recipient_email, subject, text_body, html_body, attempts
  `;
  const message = claimed[0];
  if (!message) return { sent: false };

  try {
    const { sendTransactionalEmail } = await import("./mail.server");
    const result = await sendTransactionalEmail({
      to: message.recipient_email,
      subject: message.subject,
      text: message.text_body,
      html: message.html_body ?? undefined,
      category: "owner_submission_intake",
    });
    await sql`
      update bridge_notification_outbox
      set status = 'sent',
          sent_at = now(),
          provider_message_id = ${result.messageId ?? null},
          last_error = null,
          processing_started_at = null,
          updated_at = now()
      where id = ${message.id}::uuid
    `;
    return { sent: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "mail_delivery_failed";
    await sql`
      update bridge_notification_outbox
      set status = 'failed',
          last_error = ${detail.slice(0, 500)},
          next_attempt_at = now() + make_interval(mins => least(60, greatest(1, power(2, least(attempts, 6))::int))),
          processing_started_at = null,
          updated_at = now()
      where id = ${message.id}::uuid
    `;
    console.warn("Bridge owner-submission notification queued for retry", {
      eventKey,
      error: detail,
    });
    return { sent: false };
  }
}
