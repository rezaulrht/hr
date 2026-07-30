import nodemailer from "nodemailer"

import { env } from "../config/env"

/**
 * The one place mail leaves this server.
 *
 * With no `SMTP_HOST` configured, mail is logged to the console instead of
 * sent. That is a deliberate dev-mode fallback, not a bug — it is what lets
 * password-reset links and the attendance digests be exercised locally
 * without an SMTP account.
 */
export interface MailAttachment {
  filename: string
  content: Buffer
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html: string,
  attachments?: MailAttachment[]
): Promise<void> {
  if (!env.SMTP_HOST) {
    const note = attachments?.length ? ` (+${attachments.length} attachment)` : ""
    console.log(`[dev email fallback] To: ${to} | Subject: ${subject}${note}\n${text}`)
    return
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })

  await transporter.sendMail({
    from: env.EMAIL_FROM ?? "no-reply@peoplecore.io",
    to,
    subject,
    text,
    html,
    attachments,
  })
}
