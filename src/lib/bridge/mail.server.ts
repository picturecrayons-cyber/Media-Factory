import { TRANSACTIONAL_FROM } from "./canonical";
import { bridgeEnv } from "./env";

export async function sendBridgeMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const host = bridgeEnv.smtpHost();
  const user = bridgeEnv.smtpUser();
  const pass = bridgeEnv.smtpPass();
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP_PASS is unset. Bind the Hostinger mailbox password for abijithasokan@crayonspictures.com on Vercel Preview only (not IMAP, not hPanel).",
    );
  }
  const port = Number(bridgeEnv.smtpPort() || "465");
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: bridgeEnv.mailFrom() || TRANSACTIONAL_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
