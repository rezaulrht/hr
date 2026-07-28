"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { changePassword as apiChangePassword } from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import { ROLE_ROUTES } from "@/lib/auth/role-routes"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ChangePasswordPage() {
  const router = useRouter()
  const { user, accessToken, status, setSession } = useSession()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === "unauthenticated") {
    router.replace("/login")
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!accessToken || !user) return
    setError(null)
    setSubmitting(true)
    try {
      const result = await apiChangePassword(accessToken, currentPassword, newPassword)
      setSession(result.accessToken, result.user)
      router.push(ROLE_ROUTES[result.user.role])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-7 py-10">
      <div className="w-full max-w-100">
        <h1 className="font-heading text-[26px] font-bold tracking-tight">Set a new password</h1>
        <p className="mt-2 mb-6.5 text-[13.5px] text-[#55657A]">
          For your security, you need to set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label htmlFor="current-password" className="mb-1.5 text-xs font-bold">
              Current (temporary) password
            </Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] focus-visible:border-[#17191C] focus-visible:ring-0"
            />
          </div>
          <div className="mb-4">
            <Label htmlFor="new-password" className="mb-1.5 text-xs font-bold">
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] focus-visible:border-[#17191C] focus-visible:ring-0"
            />
          </div>

          {error ? <p className="mb-4 text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="block w-full rounded bg-[#17191C] py-3.5 text-center text-sm font-bold text-white hover:bg-[#33373D] disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </main>
  )
}
