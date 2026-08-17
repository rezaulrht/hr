import type { Metadata } from "next"

import { AuthShell } from "../auth-shell"
import { ChangePasswordForm } from "./change-password-form"

export const metadata: Metadata = {
  title: "Set a new password | byteSpate",
}

export default function ChangePasswordPage() {
  return (
    <AuthShell title="Set a new password" subtitle="Choose a password only you know.">
      <ChangePasswordForm />
    </AuthShell>
  )
}
