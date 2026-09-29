import { TRANSACTIONAL_FROM, PRODUCT_NAME, LEGAL_OWNER } from "./canonical";
import { bridgeEnv } from "./env";

export interface TransactionalEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  category?: string;
}

const BRIDGE_LOGO_URL = "https://bridge.crayonspictures.com/brand/logo.png";

export function formatBrandedEmailHtml(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#172033;">
  <table width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dce3e8;border-radius:18px;overflow:hidden;">
        <tr><td style="padding:28px 32px 18px;border-bottom:1px solid #e7edf1;">
          <img src="${BRIDGE_LOGO_URL}" alt="Crayons Bridge" width="190" style="display:block;max-width:190px;height:auto;border:0;">
        </td></tr>
        <tr><td style="padding:30px 32px;">
          <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#111827;">${title}</h1>
          <div style="font-size:15px;line-height:1.65;color:#52606d;">${bodyHtml}</div>
          ${cta ? `<div style="margin-top:26px;"><a href="${cta.url}" style="display:inline-block;background:#10b5ea;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:999px;">${cta.label}</a></div>` : ""}
        </td></tr>
        <tr><td style="padding:22px 32px;background:#f9fbfc;border-top:1px solid #e7edf1;font-size:12px;line-height:1.6;color:#7a8793;">
          <p style="margin:0 0 4px;"><strong>${PRODUCT_NAME}</strong> · ${LEGAL_OWNER}</p>
          <p style="margin:0 0 4px;">Media Supply Chain · Rights · Licensing · Delivery</p>
          <p style="margin:0;">Support: <a href="mailto:${TRANSACTIONAL_FROM}" style="color:#52606d;">${TRANSACTIONAL_FROM}</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendTransactionalEmail(opts: TransactionalEmailOptions): Promise<{ ok: boolean; messageId?: string }> {
  const host = bridgeEnv.smtpHost();
  const user = bridgeEnv.smtpUser();
  const pass = bridgeEnv.smtpPass();

  if (!host || !user || !pass) throw new Error("Transactional email is not configured");

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
  const body = `<p>Welcome, ${opts.name || "Creator"}.</p><p>Your Crayons Bridge workspace is ready. Upload masters, complete QC, manage rights and licensing, and authorize distribution from one workspace.</p>`;
  return sendTransactionalEmail({
    to: opts.to,
    subject,
    text: "Welcome to Crayons Bridge. Open your workspace at https://bridge.crayonspictures.com/dashboard",
    html: formatBrandedEmailHtml(subject, body, { label: "Open Crayons Bridge", url: "https://bridge.crayonspictures.com/dashboard" }),
    category: "welcome",
  });
}

export async function sendSignInAlertEmail(opts: { to: string }) {
  const subject = "New sign-in to Crayons Bridge";
  const body = "<p>A new sign-in to your Crayons Bridge account was detected.</p><p>If this was not you, reset your password immediately and contact support.</p>";
  return sendTransactionalEmail({ to: opts.to, subject, text: body.replace(/<[^>]+>/g, " "), html: formatBrandedEmailHtml(subject, body, { label: "Review account", url: "https://bridge.crayonspictures.com/account" }), category: "security_sign_in" });
}

export async function sendAdminUpdatedEmail(opts: { to: string; summary: string }) {
  const subject = "Your Crayons Bridge account was updated";
  const body = `<p>An administrator updated your Crayons Bridge account.</p><p><strong>Change:</strong> ${opts.summary}</p><p>If this does not look right, contact support.</p>`;
  return sendTransactionalEmail({ to: opts.to, subject, text: `Crayons Bridge admin update: ${opts.summary}`, html: formatBrandedEmailHtml(subject, body, { label: "Open account", url: "https://bridge.crayonspictures.com/account" }), category: "admin_update" });
}

export async function sendDistributionAuthorizedEmail(opts: { to: string; titleName: string; destination: string }) {
  const subject = `Distribution Authorized: ${opts.titleName}`;
  const body = `<p>Distribution has been authorized for <strong>${opts.titleName}</strong> to <strong>${opts.destination}</strong>.</p><p>Technical and legal readiness verified.</p>`;
  return sendTransactionalEmail({
    to: opts.to,
    subject,
    text: `Distribution has been authorized for ${opts.titleName} to ${opts.destination}.`,
    html: formatBrandedEmailHtml(subject, body, { label: "View in Workspace", url: "https://bridge.crayonspictures.com/dashboard" }),
    category: "distribution_authorized",
  });
}
