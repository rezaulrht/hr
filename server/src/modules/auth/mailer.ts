import nodemailer from "nodemailer"

import { env } from "../../config/env"

async function send(to: string, subject: string, text: string, html: string): Promise<void> {
  if (!env.SMTP_HOST) {
    console.log(`[dev email fallback] To: ${to} | Subject: ${subject}\n${text}`)
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
  })
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  await send(
    to,
    "Reset your PeopleCore password",
    `Reset your password: ${resetLink}`,
    `<p>Reset your password: <a href="${resetLink}">${resetLink}</a></p>`
  )
}

export async function sendStaffCredentialsEmail(
  to: string,
  employeeId: string,
  temporaryPassword: string
): Promise<void> {
  await send(
    to,
    "Your PeopleCore account is ready",
    `Your employee ID: ${employeeId}\nTemporary password: ${temporaryPassword}\nYou'll be asked to change this password on first login.`,
    `<p>Your employee ID: <strong>${employeeId}</strong></p><p>Temporary password: <strong>${temporaryPassword}</strong></p><p>You'll be asked to change this password on first login.</p>`
  )
}
