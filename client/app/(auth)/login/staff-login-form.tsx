"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { loginStaff } from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import { ROLE_ROUTES } from "@/lib/auth/role-routes"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"

export function StaffLoginForm() {
  const router = useRouter()
  const { setSession } = useSession()
  const [employeeId, setEmployeeId] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Trim as well as uppercase: employee codes are handed out by email and
      // arrive pasted with stray whitespace, which the server matches exactly.
      const { accessToken, user } = await loginStaff(employeeId.trim(), password)
      setSession(accessToken, user)
      router.push(user.mustChangePassword ? "/change-password" : ROLE_ROUTES[user.role])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <Label htmlFor="employee-id" className="mb-1.5 text-xs font-bold">
          Employee ID
        </Label>
        <Input
          id="employee-id"
          type="text"
          placeholder="BS-EMP-00001"
          value={employeeId}
          // The field is styled `uppercase`, but text-transform only changes
          // what is painted — without this the value sent stays as typed and a
          // lowercase code fails an exact-match lookup while looking correct.
          onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
          className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] uppercase focus-visible:border-[#17191C] focus-visible:ring-0"
        />
      </div>
      <div className="mb-4">
        <Label htmlFor="employee-password" className="mb-1.5 text-xs font-bold">
          Password
        </Label>
        <PasswordInput
          id="employee-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="h-auto w-full rounded border-[#D8DCE1] bg-white px-3.5 py-2.75 text-[13.5px] focus-visible:border-[#17191C] focus-visible:ring-0"
        />
      </div>

      {error ? <p className="mb-4 text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="block w-full rounded bg-[#17191C] py-3.5 text-center text-sm font-bold text-white hover:bg-[#33373D] disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-[11.5px] leading-[1.6] text-[#8B95A3]">
        First time signing in? Use the temporary ID and password your HR team sent you — you&rsquo;ll be asked to
        set a new password.
      </p>
    </form>
  )
}
