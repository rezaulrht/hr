// The transport and its dev-mode console fallback moved to src/utils/mailer
// so the attendance jobs could send mail without duplicating either.
import { sendMail as send } from "../../utils/mailer"

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
