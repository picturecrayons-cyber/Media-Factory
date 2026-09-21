import { PRODUCTION_DOMAIN, TRANSACTIONAL_FROM } from "./canonical.ts";

export const VERIFY_RESEND_MS = 120_000;
export const VERIFY_TTL_MS = 24 * 3600 * 1000;

export function canonicalAppOrigin(appUrl: string): string {
  const raw = appUrl.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Verification URL host is not allowed");
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  const vercelPreview = host.endsWith(".vercel.app");
  const canonical = host === PRODUCTION_DOMAIN || host.endsWith(".crayonspictures.com");
  if (url.protocol === "https:") {
    if (!(canonical || vercelPreview)) throw new Error("Verification URL host is not allowed");
  } else if (url.protocol === "http:" && local) {
    /* preview / local desks only */
  } else {
    throw new Error("Verification URL host is not allowed");
  }
  return `${url.protocol}//${url.host}`;
}

export function canonicalVerifyUrl(appUrl: string, token: string): string {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Invalid token");
  return `${canonicalAppOrigin(appUrl)}/verify-email?token=${token}`;
}

export function assertVerifyResendAllowed(lastCreatedAt: Date | string | null, now = new Date()) {
  if (!lastCreatedAt) return;
  const last = lastCreatedAt instanceof Date ? lastCreatedAt : new Date(lastCreatedAt);
  if (Number.isNaN(last.getTime())) return;
  if (now.getTime() - last.getTime() < VERIFY_RESEND_MS) {
    throw new Error("Wait two minutes before requesting another verification mail");
  }
}

export function verificationEmailCopy(opts: {
  displayName?: string | null;
  url: string;
  to: string;
}) {
  const name = (opts.displayName ?? "").trim() || "there";
  const subject = "Verify your Crayons Bridge email";
  const text = [
    `Hello ${name},`,
    "",
    "Confirm this mailbox for Crayons Bridge (StreamVista OPC Pvt Ltd).",
    "This message is sent from the Hostinger transactional mailbox. It is not a change of your login email.",
    "",
    opts.url,
    "",
    "This link expires in 24 hours and can be used once.",
    "If you did not request this, ignore the email.",
    "",
    `Sent to ${opts.to} from ${TRANSACTIONAL_FROM}.`,
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;background:#0b0a09;color:#efe6d4;font-family:IBM Plex Sans,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0a09;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#141210;border:1px solid #efe6d41f;padding:28px;">
        <tr><td style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#00b8f8;">Crayons Bridge</td></tr>
        <tr><td style="padding-top:12px;font-size:22px;font-family:Georgia,serif;">Verify your email</td></tr>
        <tr><td style="padding-top:12px;font-size:14px;line-height:1.5;color:#9a8f7e;">Hello ${escapeHtml(name)}. Confirm this mailbox for StreamVista OPC Pvt Ltd. The link expires in 24 hours and is single-use.</td></tr>
        <tr><td style="padding-top:24px;"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#00b8f8;color:#031018;text-decoration:none;font-weight:600;padding:12px 18px;">Verify email</a></td></tr>
        <tr><td style="padding-top:24px;font-size:12px;line-height:1.5;color:#6e675b;">If you did not request this, ignore the email. Login identity stays ${escapeHtml(opts.to)}. Hostinger is the send path only.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
