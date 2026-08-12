import type { Metadata } from "next"

import { AuthShell } from "../auth-shell"
import { ForgotPasswordForm } from "./forgot-password-form"

export const metadata: Metadata = {
  title: "Reset your password | byteSpate",
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will email you a link to set a new one."
      footer={
        <>
          Locked out with no access to that inbox? Only your HR admin can change the email on your
          record.
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
