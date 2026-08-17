"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

import { useSession } from "@/lib/auth/session-context"

/**
 * Sign-out, lifted out of the sidebar so the header account menu runs the
 * identical sequence. Two copies of this would eventually differ, and the
 * copy that drifted would be the one that forgot to clear the query cache.
 */
export function useSignOut() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { clearSession } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    // clearSession revokes the refresh token and drops the in-memory access
    // token; it swallows network errors so a failed call still logs you out
    // locally rather than trapping you in the dashboard.
    await clearSession()
    // Wipe cached rows too. Query keys like ["leave-requests"] aren't
    // per-user, so without this the next person to sign in on this browser
    // would briefly see the previous user's data before the refetch lands.
    queryClient.clear()
    // replace, not push — the dashboard must not come back via the back button.
    router.replace("/login")
  }

  return { signOut, signingOut }
}
