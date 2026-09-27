import { TRANSACTIONAL_FROM, PRODUCT_NAME, LEGAL_OWNER } from "./canonical";
import { bridgeEnv } from "./env";

export interface TransactionalEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  category?: string;
}

export function formatBrandedEmailHtml(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0a09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4ede4;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0a09; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #141210; border: 1px solid #282420; border-radius: 16px; overflow: hidden; padding: 36px 32px;">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #282420;">
              <span style="font-size: 18px; font-weight: 700; letter-spacing: -0.5px; color: #00b4d8; text-transform: uppercase;">
                ${PRODUCT_NAME}
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding-top: 28px; padding-bottom: 28px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; line-height: 1.3; color: #f4ede4;">
                ${title}
              </h1>
              <div style="font-size: 15px; line-height: 1.6; color: #9c9184;">
                ${bodyHtml}
              </div>
              ${
                cta
                  ? `<div style="margin-top: 28px;">
                      <a href="${cta.url}" style="display: inline-block; background-color: #00b4d8; color: #0b0a09; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 9999px;">
                        ${cta.label}
                      </a>
                    </div>`
                  : ""
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #282420; font-size: 12px; line-height: 1.5; color: #6e6458;">
              <p style="margin: 0 0 4px;"><strong>${PRODUCT_NAME}</strong> · ${LEGAL_OWNER}</p>
              <p style="margin: 0 0 4px;">Distribution & Rights Control Plane</p>
              <p style="margin: 0;">Contact: <a href="mailto:${TRANSACTIONAL_FROM}" style="color: #9c9184; text-decoration: underline;">${TRANSACTIONAL_FROM}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTransactionalEmail(opts: TransactionalEmailOptions): Promise<{ ok: boolean; messageId?: string }> {
  const host = bridgeEnv.smtpHost();
  const user = bridgeEnv.smtpUser();
  const pass = bridgeEnv.smtpPass();

  if (!host || !user || !pass) {
    throw new Error("Transactional email is not configured");
  }

  const port = Number(bridgeEnv.smtpPort() || "587");
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const fromAddress = bridgeEnv.mailFrom() || `Crayons Bridge <${TRANSACTIONAL_FROM}>`;

  const info = await transporter.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html || formatBrandedEmailHtml(opts.subject, `<p>${opts.text}</p>`),
  });

  return { ok: true, messageId: info.messageId };
}

export async function sendBridgeMail(opts: { to: string; subject: string; text: string; html?: string }) {
  return sendTransactionalEmail(opts);
}

export async function sendWelcomeEmail(opts: { to: string; name: string }) {
  const subject = "Welcome to Crayons Bridge";
  const body = `<p>Welcome, ${opts.name || "Creator"}.</p><p>Your Crayons Bridge workspace is ready. You can now upload masters, verify QC, manage rights, and authorize distribution to Crayons Loop and other partners.</p>`;
  const cta = { label: "Open Crayons Bridge", url: "https://bridge.crayonspictures.com/dashboard" };
  return sendTransactionalEmail({
    to: opts.to,
    subject,
    text: `Welcome to Crayons Bridge. Open your workspace at https://bridge.crayonspictures.com/dashboard`,
    html: formatBrandedEmailHtml(subject, body, cta),
    category: "welcome",
  });
}

export async function sendDistributionAuthorizedEmail(opts: { to: string; titleName: string; destination: string }) {
  const subject = `Distribution Authorized: ${opts.titleName}`;
  const body = `<p>Distribution has been authorized for <strong>${opts.titleName}</strong> to destination <strong>${opts.destination}</strong>.</p><p>Technical and legal readiness verified.</p>`;
  const cta = { label: "View in Workspace", url: "https://bridge.crayonspictures.com/dashboard" };
  return sendTransactionalEmail({
    to: opts.to,
    subject,
    text: `Distribution has been authorized for ${opts.titleName} to ${opts.destination}.`,
    html: formatBrandedEmailHtml(subject, body, cta),
    category: "distribution_authorized",
  });
}
